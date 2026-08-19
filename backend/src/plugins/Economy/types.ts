import { BasePluginType, pluginUtils } from "vety";
import { z } from "zod";
import { GuildEconomyGameHistory } from "../../data/GuildEconomyGameHistory.js";
import { GuildEconomyShop } from "../../data/GuildEconomyShop.js";
import { zBoundedCharacters, zBoundedRecord, zDelayString, zSnowflake } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { CountersPlugin } from "../Counters/CountersPlugin.js";

const MAX_GAMES = 20;
const MAX_SHOP_BOOSTS = 20;
const MAX_MANAGER_ROLES = 20;

// Either a flat number (e.g. 2) or a {min, max} range that gets rolled randomly each time (e.g. {min: 1.5, max: 3}
// = a fresh value between 1.5-3 picked per play). Used both for win_multiplier (wager games) and reward (reward
// games) — same shape, different meaning attached by whichever field uses it.
export const zNumberOrRange = z.union([
  z.number().positive(),
  z
    .strictObject({
      min: z.number().positive(),
      max: z.number().positive(),
    })
    .refine((range) => range.max >= range.min, {
      message: "max must be greater than or equal to min",
    }),
]);

// Puts a portion of a game win on hold instead of it being immediately spendable — same underlying mechanism as
// give.hold_duration (see below), just triggered by winning a game rather than receiving a gift.
export const zGameHold = z.strictObject({
  // Only apply the hold if the net winnings are at least this much. Omit to apply regardless of size.
  min_amount: z.number().int().positive().nullable().default(null),
  // Fraction (0-1) of the net winnings to hold. Omit to hold the entire win.
  percentage: z.number().min(0).max(1).nullable().default(null),
  // How long the held portion stays locked — required, since a hold block with no duration doesn't mean anything.
  duration: zDelayString,
});

const zGameCommon = {
  label: zBoundedCharacters(0, 100).nullable().default(null),
  emoji: z.string().nullable().default(null),
  cooldown: zDelayString.nullable().default(null),
  hold: zGameHold.nullable().default(null),
  // Alternate keywords this game can also be played/looked up under, e.g. a game configured as `tictactoe` with
  // aliases: [ttt] can be played with `!play ttt <amount>` just the same as `!play tictactoe <amount>`. Doesn't
  // replace the config key itself — that's still the canonical name used for cooldowns/game history/etc.
  aliases: z.array(zBoundedCharacters(1, 32)).max(10).default([]),
};

// A "wager" game: the player picks a bet amount (within min_bet-max_bet), win_chance decides whether they win,
// and on a win the bet is multiplied by win_multiplier. Played with `!play <game> <amount>`.
export const zEconomyWagerGame = z
  .strictObject({
    type: z.literal("wager"),
    ...zGameCommon,
    win_chance: z.number().min(0).max(1),
    win_multiplier: zNumberOrRange,
    min_bet: z.number().int().positive(),
    max_bet: z.number().int().positive(),
    // Caps the net amount a single win can add to the balance, regardless of bet/multiplier
    max_payout: z.number().int().positive().nullable().default(null),
  })
  .refine((game) => game.max_bet >= game.min_bet, {
    message: "max_bet must be greater than or equal to min_bet",
  });

// A "reward" game: no bet — just a guaranteed (or win_chance-gated) flat payout on a cooldown, e.g. a `work` or
// `daily` command. Played with `!work <game>`.
export const zEconomyRewardGame = z.strictObject({
  type: z.literal("reward"),
  ...zGameCommon,
  // Defaults to 1 (always pays out) since most reward games (work/daily) are meant to be guaranteed; set lower
  // to make it a "sometimes you get nothing" gamble instead.
  win_chance: z.number().min(0).max(1).default(1),
  reward: zNumberOrRange,
});

// A "blackjack" game: standard blackjack rules (hit/stand/double/split), played interactively via buttons with
// `!blackjack <game> <amount>`. Dealer stands on all 17s; splitting is allowed once (2 hands max) and split aces
// only ever receive one card each; doubling down is allowed after splitting.
export const zEconomyBlackjackGame = z
  .strictObject({
    type: z.literal("blackjack"),
    ...zGameCommon,
    min_bet: z.number().int().positive(),
    max_bet: z.number().int().positive(),
    // Payout multiplier for a natural (2-card) blackjack that the dealer doesn't also have — traditionally 3:2
    blackjack_payout: z.number().positive().default(1.5),
  })
  .refine((game) => game.max_bet >= game.min_bet, {
    message: "max_bet must be greater than or equal to min_bet",
  });

// A "pvp" game: two players challenge each other (with a Discord ping + Accept/Decline buttons) and, once
// accepted, both stake `amount` — the loser's stake goes to the winner, a tie/timeout refunds both. `variant`
// picks which actual game is played. Played with `!play <game> @user <amount>`.
export const zEconomyPvpGame = z
  .strictObject({
    type: z.literal("pvp"),
    variant: z.enum(["rock_paper_scissors", "dice_duel", "tic_tac_toe"]),
    ...zGameCommon,
    min_bet: z.number().int().positive(),
    max_bet: z.number().int().positive(),
  })
  .refine((game) => game.max_bet >= game.min_bet, {
    message: "max_bet must be greater than or equal to min_bet",
  });

// A "hol" (Higher or Lower) game: a number from 1-range_max is drawn and the player guesses whether the next
// draw will be higher, lower, or the same. A correct guess sets the cash-out multiplier to that guess's own
// odds-based value (not a running product — winning several rounds in a row doesn't stack) and starts another
// round; the player can cash out after any correct guess, or keep pushing their luck until they guess wrong and
// lose the bet outright. Each round's per-choice multiplier is derived from that choice's true odds at the
// current number (rarer guesses pay more), clamped to [min_multiplier, max_multiplier] so no guess is ever
// trivial or absurd — surviving more rounds raises how close to max_multiplier that clamp is allowed to reach
// (see ramp_rounds) rather than raising the payout itself. Played with `!play <game> <amount>`.
export const zEconomyHolGame = z
  .strictObject({
    type: z.literal("hol"),
    ...zGameCommon,
    min_bet: z.number().int().positive(),
    max_bet: z.number().int().positive(),
    min_multiplier: z.number().min(1),
    max_multiplier: z.number().min(1),
    // Numbers are drawn from 1-range_max. Higher means "Higher"/"Lower" guesses stay closer to a coinflip for
    // longer (only really lopsided near the ends of the range), instead of a small range where most numbers are
    // an easy guess in one direction.
    range_max: z.number().int().min(4).max(1000).default(13),
    // How many correct guesses in a row it takes for a round's multiplier ceiling to reach the full
    // max_multiplier — round 1 is capped near min_multiplier, ramping linearly up to max_multiplier by this
    // round. Lower = reaches max_multiplier sooner (easier); higher = takes longer to earn the full payout range.
    ramp_rounds: z.number().int().positive().default(5),
    // Caps the net amount a single cash-out can add to the balance.
    max_payout: z.number().int().positive().nullable().default(null),
  })
  .refine((game) => game.max_bet >= game.min_bet, {
    message: "max_bet must be greater than or equal to min_bet",
  })
  .refine((game) => game.max_multiplier >= game.min_multiplier, {
    message: "max_multiplier must be greater than or equal to min_multiplier",
  });

// Existing configs predate the `type` field (only wager games existed), so default it to "wager" when omitted
// rather than making it a breaking change.
export const zEconomyGame = z.preprocess(
  (value) => (value && typeof value === "object" && !("type" in value) ? { ...value, type: "wager" } : value),
  z.discriminatedUnion("type", [
    zEconomyWagerGame,
    zEconomyRewardGame,
    zEconomyBlackjackGame,
    zEconomyPvpGame,
    zEconomyHolGame,
  ]),
);

export const zEconomyGive = z.strictObject({
  cooldown: zDelayString.nullable().default(null),
  // Fraction (0-1) of the given amount taken as a fee, removed from the economy entirely rather than handed to
  // the recipient — e.g. 0.1 = a 10% tax on transfers. The giver still loses the full amount; the recipient just
  // receives less than that.
  fee: z.number().min(0).max(1).nullable().default(null),
  // How long a received gift stays "pending" before the recipient can spend it — it's added to their balance
  // (and counts toward totals/the leaderboard) immediately, it just can't be wagered/traded/given away again
  // until the hold clears. Null (default) means no hold — gifts are spendable immediately.
  hold_duration: zDelayString.nullable().default(null),
});

// Either a flat non-negative integer (e.g. 10) or a {min, max} range that gets rolled randomly (e.g. {min: 5,
// max: 15}) — same idea as zNumberOrRange above but integer-only, for stock counts.
export const zIntegerOrRange = z.union([
  z.number().int().nonnegative(),
  z
    .strictObject({
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    })
    .refine((range) => range.max >= range.min, {
      message: "max must be greater than or equal to min",
    }),
]);

// A purchasable temporary multiplier, bought with coins via `!shop buy`. Buying another boost of the same
// boost_type replaces whatever's currently active (fresh multiplier + duration counted from now) rather than
// stacking multiplicatively — see GuildEconomyShop.purchaseBoost.
export const zShopBoost = z.strictObject({
  label: zBoundedCharacters(0, 100).nullable().default(null),
  emoji: z.string().nullable().default(null),
  // What this boost multiplies while active: "coins" boosts net winnings from games/`!work` (see
  // functions/applyCoinsBoost.ts); "activity" boosts counter gains from Automod's add_to_counter action (e.g. an
  // `accumulate_activity` rule) — see Automod's actions/addToCounter.ts.
  boost_type: z.enum(["coins", "activity"]),
  multiplier: z.number().min(1),
  duration: zDelayString,
  price: z.number().int().positive(),
  // Max stock available right now — null means unlimited (always purchasable, never tracked/decremented).
  stock: zIntegerOrRange.nullable().default(null),
  // How much stock is added back each restock_interval (rolled fresh per restock if given as a range, for a
  // "sometimes more, sometimes less" refill). Only meaningful alongside restock_interval — without it, `stock`
  // is a one-time batch that's gone for good once sold out.
  restock_amount: zIntegerOrRange.nullable().default(null),
  restock_interval: zDelayString.nullable().default(null),
});

export const zEconomyShop = z.strictObject({
  boosts: zBoundedRecord(z.record(zBoundedCharacters(1, 32), zShopBoost), 0, MAX_SHOP_BOOSTS).default({}),
});

export const zEconomyTrade = z.strictObject({
  // The Counters plugin counter that represents "points" to trade to/from
  points_counter_name: zBoundedCharacters(1, 100),
  // Coins granted per point when buying coins with points (can be < 1, e.g. 0.1 = 10 points per coin)
  coins_per_point: z.number().positive(),
  // Coins "spent" per point refunded when selling coins back for points. Defaults to coins_per_point
  // (symmetric exchange) if omitted — set higher than coins_per_point to charge an effective trading fee/spread.
  coins_per_point_sell: z.number().positive().nullable().default(null),
});

export const zEconomyConfig = z.strictObject({
  // The whole permission model for the dashboard's Economy admin page (balance give/subtract/set, leaderboard,
  // game history, analytics) — same idea as Giveaways' manager_roles (see Giveaways/types.ts): a member with any
  // of these role IDs can manage the economy from the dashboard, checked from the API process
  // (api/guilds/economy.ts) the same way Giveaways' manager_roles is. Independent of can_manage below, which
  // gates the in-Discord `-history` chat command via the normal vety permission-level system instead.
  manager_roles: z.array(zSnowflake).max(MAX_MANAGER_ROLES).default([]),
  currency_name: zBoundedCharacters(1, 32).default("Coins"),
  currency_emoji: z.string().nullable().default(null),
  // The Counters plugin counter used to store each user's coin balance
  counter_name: zBoundedCharacters(1, 100).default("coins"),
  trade: zEconomyTrade.nullable().default(null),
  give: zEconomyGive.default({ cooldown: null, fee: null, hold_duration: null }),
  games: zBoundedRecord(z.record(zBoundedCharacters(1, 32), zEconomyGame), 0, MAX_GAMES)
    .default({})
    .refine(
      (games) => {
        const seen = new Set(Object.keys(games));
        for (const game of Object.values(games)) {
          for (const alias of game.aliases) {
            if (seen.has(alias)) return false;
            seen.add(alias);
          }
        }
        return true;
      },
      { message: "Game aliases must be unique and can't reuse another game's name or alias" },
    ),
  shop: zEconomyShop.default({ boosts: {} }),
  can_view: z.boolean().default(false),
  can_play: z.boolean().default(false),
  can_trade: z.boolean().default(false),
  can_give: z.boolean().default(false),
  // Lets staff look up another user's game history (see GameHistoryCmd) — not granted by any default override,
  // since it's an audit tool rather than a normal player-facing permission.
  can_manage: z.boolean().default(false),
  can_shop: z.boolean().default(false),
});

export interface EconomyPluginType extends BasePluginType {
  configSchema: typeof zEconomyConfig;
  state: {
    common: pluginUtils.PluginPublicInterface<typeof CommonPlugin>;
    counters: pluginUtils.PluginPublicInterface<typeof CountersPlugin>;
    gameHistory: GuildEconomyGameHistory;
    shop: GuildEconomyShop;
    // Per (gameName, userId) last-played timestamp (ms) for game cooldowns. In-memory only — resets on restart,
    // which is fine for an anti-spam cooldown rather than something the economy's integrity depends on.
    lastPlayedAt: Map<string, number>;
  };
}

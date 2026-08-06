import { BasePluginType, pluginUtils } from "vety";
import { z } from "zod";
import { zBoundedCharacters, zBoundedRecord, zDelayString } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { CountersPlugin } from "../Counters/CountersPlugin.js";

const MAX_GAMES = 20;

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

const zGameCommon = {
  label: zBoundedCharacters(0, 100).nullable().default(null),
  emoji: z.string().nullable().default(null),
  cooldown: zDelayString.nullable().default(null),
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

// Existing configs predate the `type` field (only wager games existed), so default it to "wager" when omitted
// rather than making it a breaking change.
export const zEconomyGame = z.preprocess(
  (value) => (value && typeof value === "object" && !("type" in value) ? { ...value, type: "wager" } : value),
  z.discriminatedUnion("type", [zEconomyWagerGame, zEconomyRewardGame]),
);

export const zEconomyGive = z.strictObject({
  cooldown: zDelayString.nullable().default(null),
  // Fraction (0-1) of the given amount taken as a fee, removed from the economy entirely rather than handed to
  // the recipient — e.g. 0.1 = a 10% tax on transfers. The giver still loses the full amount; the recipient just
  // receives less than that.
  fee: z.number().min(0).max(1).nullable().default(null),
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
  currency_name: zBoundedCharacters(1, 32).default("Coins"),
  currency_emoji: z.string().nullable().default(null),
  // The Counters plugin counter used to store each user's coin balance
  counter_name: zBoundedCharacters(1, 100).default("coins"),
  trade: zEconomyTrade.nullable().default(null),
  give: zEconomyGive.default({ cooldown: null, fee: null }),
  games: zBoundedRecord(z.record(zBoundedCharacters(1, 32), zEconomyGame), 0, MAX_GAMES).default({}),
  can_view: z.boolean().default(false),
  can_play: z.boolean().default(false),
  can_trade: z.boolean().default(false),
  can_give: z.boolean().default(false),
});

export interface EconomyPluginType extends BasePluginType {
  configSchema: typeof zEconomyConfig;
  state: {
    common: pluginUtils.PluginPublicInterface<typeof CommonPlugin>;
    counters: pluginUtils.PluginPublicInterface<typeof CountersPlugin>;
    // Per (gameName, userId) last-played timestamp (ms) for game cooldowns. In-memory only — resets on restart,
    // which is fine for an anti-spam cooldown rather than something the economy's integrity depends on.
    lastPlayedAt: Map<string, number>;
  };
}

import { BasePluginType, pluginUtils } from "vety";
import { z } from "zod";
import { zBoundedCharacters, zBoundedRecord, zDelayString } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { CountersPlugin } from "../Counters/CountersPlugin.js";

const MAX_GAMES = 20;

export const zEconomyGame = z
  .strictObject({
    label: zBoundedCharacters(0, 100).nullable().default(null),
    emoji: z.string().nullable().default(null),
    // Chance (0-1) that a play wins
    win_chance: z.number().min(0).max(1),
    // On a win, the bet is returned multiplied by this (e.g. 2 = double your bet back)
    win_multiplier: z.number().positive(),
    min_bet: z.number().int().positive(),
    max_bet: z.number().int().positive(),
    // Caps the net amount a single win can add to the balance, regardless of bet/multiplier
    max_payout: z.number().int().positive().nullable().default(null),
    cooldown: zDelayString.nullable().default(null),
  })
  .refine((game) => game.max_bet >= game.min_bet, {
    message: "max_bet must be greater than or equal to min_bet",
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
  games: zBoundedRecord(z.record(zBoundedCharacters(1, 32), zEconomyGame), 0, MAX_GAMES).default({}),
  can_view: z.boolean().default(false),
  can_play: z.boolean().default(false),
  can_trade: z.boolean().default(false),
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

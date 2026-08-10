import { GuildPluginData } from "vety";
import { z } from "zod";
import { convertDelayStringToMS } from "../../../utils.js";
import { EconomyPluginType, zGameHold } from "../types.js";

// Per-user counters (must be configured in this server's YAML under counters:) used to track gifted coins that
// are still on hold — see GiveCmd/giveCoins.ts. `until` is stored as a unix timestamp in *seconds* (not ms) so
// it comfortably fits inside a Counter's int32 range.
export const PENDING_AMOUNT_COUNTER_NAME = "coins_pending_amount";
export const PENDING_UNTIL_COUNTER_NAME = "coins_pending_until";

export function pendingHoldCountersConfigured(pluginData: GuildPluginData<EconomyPluginType>): boolean {
  return (
    pluginData.state.counters.counterExists(PENDING_AMOUNT_COUNTER_NAME) &&
    pluginData.state.counters.counterExists(PENDING_UNTIL_COUNTER_NAME)
  );
}

/**
 * Returns the amount of the user's balance that's still on hold (from a recent gift via give.hold_duration,
 * and/or a game win via that game's `hold` config — both use the same two counters, see addPendingHold) and,
 * if any, the unix timestamp (ms) it unlocks at. Amount is 0 / until is null if there's no active hold. This is
 * evaluated lazily — an expired hold doesn't need to be "cleared" anywhere, it just stops counting here. Not
 * gated on any particular config field being set, since either give or any individual game can be the source of
 * a hold independently of the others.
 */
export async function getPendingInfo(
  pluginData: GuildPluginData<EconomyPluginType>,
  userId: string,
): Promise<{ amount: number; unlocksAt: number | null }> {
  if (!pendingHoldCountersConfigured(pluginData)) return { amount: 0, unlocksAt: null };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const untilSeconds = await pluginData.state.counters.getCounterValue(PENDING_UNTIL_COUNTER_NAME, null, userId);
  if (untilSeconds <= nowSeconds) return { amount: 0, unlocksAt: null };

  const amount = await pluginData.state.counters.getCounterValue(PENDING_AMOUNT_COUNTER_NAME, null, userId);
  return { amount, unlocksAt: untilSeconds * 1000 };
}

export async function getPendingAmount(pluginData: GuildPluginData<EconomyPluginType>, userId: string): Promise<number> {
  return (await getPendingInfo(pluginData, userId)).amount;
}

/**
 * The portion of `counterName` that's actually available to wager/trade/give — for the configured coins
 * counter, this subtracts any still-held gifted amount; for any other counter (e.g. the points counter used by
 * trading), holds don't apply and spendable === total.
 */
export async function getSpendableBalance(
  pluginData: GuildPluginData<EconomyPluginType>,
  counterName: string,
  userId: string,
): Promise<{ total: number; pending: number; spendable: number; pendingUnlocksAt: number | null }> {
  const config = pluginData.config.get();
  const total = await pluginData.state.counters.getCounterValue(counterName, null, userId);

  if (counterName !== config.counter_name) {
    return { total, pending: 0, spendable: total, pendingUnlocksAt: null };
  }

  const { amount: pending, unlocksAt } = await getPendingInfo(pluginData, userId);
  return { total, pending, spendable: Math.max(0, total - pending), pendingUnlocksAt: unlocksAt };
}

/**
 * Puts `amount` on hold for `holdDurationMs`. If the recipient already has an active (unexpired) hold, the new
 * amount is merged into it and the timer restarts from now — a fresh gift always "unlocks" no earlier than an
 * older one would have anyway (holds share one duration), so this is equivalent to tracking them separately
 * while needing only two counters instead of a per-gift ledger. If the existing hold has already expired, it's
 * treated as fully spendable already and NOT carried forward — only the new gift gets held.
 *
 * Must be called from within a section that already holds `economyUserLock` for `userId` (giveCoins.ts already
 * locks both the giver and recipient for the whole transfer) — this function does not lock on its own, since
 * re-acquiring the same key from the same call chain would deadlock.
 */
export async function addPendingHold(
  pluginData: GuildPluginData<EconomyPluginType>,
  userId: string,
  amount: number,
  holdDurationMs: number,
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const existingUntil = await pluginData.state.counters.getCounterValue(PENDING_UNTIL_COUNTER_NAME, null, userId);
  const hasActiveHold = existingUntil > nowSeconds;

  const existingPending = hasActiveHold
    ? await pluginData.state.counters.getCounterValue(PENDING_AMOUNT_COUNTER_NAME, null, userId)
    : 0;

  const newUntil = nowSeconds + Math.floor(holdDurationMs / 1000);

  await pluginData.state.counters.setCounterValue(PENDING_AMOUNT_COUNTER_NAME, null, userId, existingPending + amount);
  await pluginData.state.counters.setCounterValue(PENDING_UNTIL_COUNTER_NAME, null, userId, newUntil);
}

/**
 * Applies a game's `hold` config (if any) to a win. `netWinnings` should be the actual profit — the payout minus
 * whatever the player staked to get it — not the full payout, since holding a player's own returned stake back
 * from them doesn't make sense (only actual winnings get held). No-ops if `hold` is unset, the win is <= 0,
 * below `min_amount`, or the pending-hold counters aren't configured on this server.
 *
 * Same locking requirement as addPendingHold: the caller must already hold `economyUserLock` for `userId`.
 */
export async function applyGameHold(
  pluginData: GuildPluginData<EconomyPluginType>,
  userId: string,
  netWinnings: number,
  hold: z.infer<typeof zGameHold> | null,
): Promise<void> {
  if (!hold) return;
  if (netWinnings <= 0) return;
  if (hold.min_amount != null && netWinnings < hold.min_amount) return;
  if (!pendingHoldCountersConfigured(pluginData)) return;

  const holdDurationMs = convertDelayStringToMS(hold.duration);
  if (!holdDurationMs) return;

  const holdAmount = hold.percentage != null ? Math.floor(netWinnings * hold.percentage) : netWinnings;
  if (holdAmount <= 0) return;

  await addPendingHold(pluginData, userId, holdAmount, holdDurationMs);
}

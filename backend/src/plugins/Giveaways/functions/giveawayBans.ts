import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { GuildGiveawayBans } from "../../../data/GuildGiveawayBans.js";
import { GuildGiveaways } from "../../../data/GuildGiveaways.js";
import { rerollGiveaway } from "./finalizeGiveaway.js";

const giveawayEntries = new GiveawayEntries();

export interface GiveawayBanResult {
  // How many currently-running giveaways they were pulled out of.
  removedFromRunning: number;
  // IDs of ended giveaways they were rerolled out of (they'd won but never gotten a confirmed claim).
  rerolledFromGiveawayIds: number[];
}

/**
 * Bans `userId` from giveaways in `guildId`: records the ban (checked on Enter — see
 * events/giveawayButtonInteraction.ts), pulls them out of every currently-running giveaway they'd entered, and
 * rerolls them away from any ended giveaway they'd won but hadn't gotten a confirmed claim on (see
 * GuildGiveaways.findUnclaimedWinsForUser for exactly what counts as "unclaimed"). Doesn't touch the optional
 * ban_role_id role — that's a live-Discord-role action the caller handles itself (a chat command has a live
 * GuildMember to work with; the dashboard API route only has bot-token REST — see GiveawayBanCmd.ts and
 * api/guilds/giveaways.ts respectively), same split as contributor_role_id.
 */
export async function banUserFromGiveaways(
  guildId: string,
  userId: string,
  reason: string | null = null,
  expiresAt: string | null = null,
): Promise<GiveawayBanResult> {
  await GuildGiveawayBans.getGuildInstance(guildId).ban(userId, reason, expiresAt);

  const giveawaysRepo = GuildGiveaways.getGuildInstance(guildId);

  const running = await giveawaysRepo.getRunning();
  let removedFromRunning = 0;
  for (const giveaway of running) {
    const entry = await giveawayEntries.getForUser(giveaway.id, userId);
    if (entry) {
      await giveawayEntries.remove(giveaway.id, userId);
      removedFromRunning++;
    }
  }

  const unclaimedWins = await giveawaysRepo.findUnclaimedWinsForUser(userId);
  const rerolledFromGiveawayIds: number[] = [];
  for (const giveaway of unclaimedWins) {
    await rerollGiveaway(giveaway.id, [userId]);
    rerolledFromGiveawayIds.push(giveaway.id);
  }

  return { removedFromRunning, rerolledFromGiveawayIds };
}

/** Lifts a giveaway ban — doesn't restore any entries/wins removed at ban time, just stops future enforcement. */
export async function unbanUserFromGiveaways(guildId: string, userId: string): Promise<void> {
  await GuildGiveawayBans.getGuildInstance(guildId).unban(userId);
}

export async function isUserBannedFromGiveaways(guildId: string, userId: string): Promise<boolean> {
  return GuildGiveawayBans.getGuildInstance(guildId).isBanned(userId);
}

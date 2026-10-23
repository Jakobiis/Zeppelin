import { Giveaway, GiveawayCountRange } from "../../../data/entities/Giveaway.js";
import { MessageCounts } from "../../../data/GuildMessageTrackerCounts.js";

export type EntryRequirementResult = { allowed: true } | { allowed: false; reason: string };

function formatRange(range: GiveawayCountRange): string {
  return range.max != null ? `between ${range.min} and ${range.max}` : `at least ${range.min}`;
}

function inRange(actual: number, range: GiveawayCountRange): boolean {
  return actual >= range.min && (range.max == null || actual <= range.max);
}

/**
 * Checks whether a member (given their current role IDs, message counts, and counter/coin values) is allowed
 * to enter a giveaway. Blacklisted role always wins, even over a bypass role. A bypass role skips every other
 * check (required roles, message count, counter, coins) entirely. Otherwise the member must have ALL required
 * roles and fall within every configured requirement's range (each is min-only unless a max was also set).
 */
export function checkEntryRequirements(
  giveaway: Pick<
    Giveaway,
    | "required_role_ids"
    | "bypass_role_ids"
    | "blacklisted_role_ids"
    | "message_requirement"
    | "counter_requirement"
    | "coins_requirement"
    | "required_supporter_level"
    | "blacklisted_supporter_levels"
  >,
  memberRoleIds: string[],
  messageCounts: MessageCounts | null,
  counterValue: number | null,
  coinsValue: number | null,
  // Only fetched when a supporter requirement is set; null there means the lookup failed.
  supporterLevels: number[] | null = null,
): EntryRequirementResult {
  if (giveaway.blacklisted_role_ids.some((roleId) => memberRoleIds.includes(roleId))) {
    return { allowed: false, reason: "You are not allowed to enter this giveaway." };
  }

  const blacklistedLevels = giveaway.blacklisted_supporter_levels ?? [];
  const hasSupporterRequirement = giveaway.required_supporter_level != null || blacklistedLevels.length > 0;
  if (hasSupporterRequirement && supporterLevels == null) {
    return { allowed: false, reason: "Couldn't verify your supporter status right now. Please try again in a moment." };
  }

  const blacklistedLevel = blacklistedLevels.find((level) => supporterLevels!.includes(level));
  if (blacklistedLevel != null) {
    return { allowed: false, reason: `Supporter level ${blacklistedLevel} members can't enter this giveaway.` };
  }

  const hasBypassRole = giveaway.bypass_role_ids.some((roleId) => memberRoleIds.includes(roleId));
  if (hasBypassRole) {
    return { allowed: true };
  }

  const missingRequiredRole = giveaway.required_role_ids.some((roleId) => !memberRoleIds.includes(roleId));
  if (missingRequiredRole) {
    return { allowed: false, reason: "You don't have the required role(s) to enter this giveaway." };
  }

  if (giveaway.message_requirement) {
    const { period } = giveaway.message_requirement;
    const actual = messageCounts?.[period] ?? 0;
    if (!inRange(actual, giveaway.message_requirement)) {
      return {
        allowed: false,
        reason: `You need ${formatRange(giveaway.message_requirement)} messages (${period}) to enter this giveaway. You currently have ${actual}.`,
      };
    }
  }

  if (giveaway.counter_requirement) {
    const actual = counterValue ?? 0;
    if (!inRange(actual, giveaway.counter_requirement)) {
      return {
        allowed: false,
        reason: `You need ${formatRange(giveaway.counter_requirement)} activity points to enter this giveaway. You currently have ${actual}.`,
      };
    }
  }

  if (giveaway.coins_requirement) {
    const actual = coinsValue ?? 0;
    if (!inRange(actual, giveaway.coins_requirement)) {
      return {
        allowed: false,
        reason: `You need ${formatRange(giveaway.coins_requirement)} coins to enter this giveaway. You currently have ${actual}.`,
      };
    }
  }

  if (giveaway.required_supporter_level != null) {
    const maxLevel = giveaway.required_supporter_level;
    const highest = supporterLevels!.length > 0 ? Math.max(...supporterLevels!) : 0;
    if (highest < 1 || highest > maxLevel) {
      return {
        allowed: false,
        reason: `You need supporter level ${maxLevel === 1 ? "1" : `1-${maxLevel}`} to enter this giveaway.`,
      };
    }
  }

  return { allowed: true };
}

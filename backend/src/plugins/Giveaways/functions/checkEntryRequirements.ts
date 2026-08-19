import { Giveaway } from "../../../data/entities/Giveaway.js";
import { MessageCounts } from "../../../data/GuildMessageTrackerCounts.js";

export type EntryRequirementResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Checks whether a member (given their current role IDs and message counts) is allowed to enter a giveaway.
 * Blacklisted role always wins, even over a bypass role. A bypass role skips the required-role and
 * message-count checks entirely. Otherwise the member must have ALL required roles and meet the message
 * requirement (if any).
 */
export function checkEntryRequirements(
  giveaway: Pick<Giveaway, "required_role_ids" | "bypass_role_ids" | "blacklisted_role_ids" | "message_requirement">,
  memberRoleIds: string[],
  messageCounts: MessageCounts | null,
): EntryRequirementResult {
  if (giveaway.blacklisted_role_ids.some((roleId) => memberRoleIds.includes(roleId))) {
    return { allowed: false, reason: "You are not allowed to enter this giveaway." };
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
    const { period, count } = giveaway.message_requirement;
    const actual = messageCounts?.[period] ?? 0;
    if (actual < count) {
      return {
        allowed: false,
        reason: `You need at least ${count} messages (${period}) to enter this giveaway. You currently have ${actual}.`,
      };
    }
  }

  return { allowed: true };
}

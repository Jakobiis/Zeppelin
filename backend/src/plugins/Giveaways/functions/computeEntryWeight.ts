/**
 * Base weight of 1, plus the highest single extra_entries bonus among the roles the member currently has —
 * bonuses don't stack, so having multiple bonus-entry roles only ever counts the best one.
 */
export function computeEntryWeight(extraEntries: Record<string, number>, memberRoleIds: string[]): number {
  let bestBonus = 0;
  for (const roleId of memberRoleIds) {
    if (extraEntries[roleId] && extraEntries[roleId] > bestBonus) {
      bestBonus = extraEntries[roleId];
    }
  }
  return 1 + bestBonus;
}

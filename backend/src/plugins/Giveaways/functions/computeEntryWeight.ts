/**
 * Base weight of 1, plus the sum (stacking, not just the highest) of extra_entries for every matching role the
 * member currently has.
 */
export function computeEntryWeight(extraEntries: Record<string, number>, memberRoleIds: string[]): number {
  let bonus = 0;
  for (const roleId of memberRoleIds) {
    if (extraEntries[roleId]) {
      bonus += extraEntries[roleId];
    }
  }
  return 1 + bonus;
}

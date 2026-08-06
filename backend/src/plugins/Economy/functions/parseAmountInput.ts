/**
 * Parses a user-supplied amount argument: either the literal "all" (resolved to `allValue`, typically the user's
 * current balance) or a positive whole number. Returns null for anything else (negative, zero, decimal, junk).
 */
export function parseAmountInput(input: string, allValue: number): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "all") {
    return allValue;
  }

  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) ? value : null;
}

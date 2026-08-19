/**
 * Parses a user-supplied amount argument: either the literal "all" (resolved to `allValue`, typically the user's
 * current balance) or a positive whole number. Returns null for anything else (negative, zero, decimal, junk).
 */
export function parseAmountInput(input: string, allValue: number): number | null {
  const trimmed = input.trim().toLowerCase();
  if (isAllOrMaxKeyword(input)) {
    return allValue;
  }

  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Whether an amount argument is the "all"/"max" keyword rather than a literal number — callers use this to decide
 * whether to clamp the resolved amount down to a game's configured max_bet (a literal number equal to the balance
 * should still be rejected by the min/max check, not silently clamped).
 */
export function isAllOrMaxKeyword(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return trimmed === "all" || trimmed === "max";
}

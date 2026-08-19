import { GiveawayCountRange } from "../../../data/entities/Giveaway.js";

/**
 * Parses a `-flag` value like `50` (min only) or `50-500` (min-max) into a GiveawayCountRange. Returns null on
 * anything malformed — a negative/non-integer bound, or a max lower than min.
 */
export function parseCountRange(input: string): GiveawayCountRange | null {
  const [minStr, maxStr] = input.split("-", 2);

  const min = Number.parseInt(minStr ?? "", 10);
  if (!Number.isInteger(min) || min < 0) {
    return null;
  }

  if (maxStr === undefined) {
    return { min, max: null };
  }

  const max = Number.parseInt(maxStr, 10);
  if (!Number.isInteger(max) || max < min) {
    return null;
  }

  return { min, max };
}

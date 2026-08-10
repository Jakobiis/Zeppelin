import { z } from "zod";
import { zNumberOrRange } from "../types.js";
import { formatAmount } from "./formatAmount.js";

type NumberOrRange = z.infer<typeof zNumberOrRange>;

/**
 * Resolves a configured number-or-range to an actual number for this play — flat values pass through unchanged,
 * {min, max} ranges get a fresh random roll.
 */
export function rollNumberOrRange(value: NumberOrRange): number {
  if (typeof value === "number") {
    return value;
  }

  return value.min + Math.random() * (value.max - value.min);
}

export function formatWinMultiplier(value: NumberOrRange): string {
  if (typeof value === "number") {
    return `${value}x`;
  }

  return `${value.min}x-${value.max}x`;
}

export function formatRewardAmount(value: NumberOrRange): string {
  if (typeof value === "number") {
    return formatAmount(value);
  }

  return `${formatAmount(value.min)}-${formatAmount(value.max)}`;
}

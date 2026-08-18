import { z } from "zod";
import { zShopBoost } from "../types.js";

/** Looks up a shop boost by its exact config key (case-insensitive) — mirrors functions/findGame.ts. */
export function findShopBoost(
  boosts: Record<string, z.infer<typeof zShopBoost>>,
  nameOrKey: string,
): [string, z.infer<typeof zShopBoost>] | null {
  const lower = nameOrKey.toLowerCase();
  for (const [key, boost] of Object.entries(boosts)) {
    if (key.toLowerCase() === lower) return [key, boost];
  }
  return null;
}

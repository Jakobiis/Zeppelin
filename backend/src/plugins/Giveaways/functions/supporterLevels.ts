import { env } from "../../../env.js";

/**
 * Every supporter level a user has held, from the JBCL API. 404 means the user isn't known there, i.e. no levels.
 * Returns null on any other failure, so the caller can refuse entry rather than guess.
 */
export async function getSupporterLevels(userId: string): Promise<number[] | null> {
  try {
    const res = await fetch(`https://api.jailbreakchangelogs.com/v2/users/${userId}/supporter/history`, {
      headers: { Authorization: env.BOT_SERVICE_TOKEN ?? "" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) {
      return [];
    }
    if (!res.ok) {
      return null;
    }
    const history = (await res.json()) as Array<{ level: number }>;
    return history.map((entry) => entry.level);
  } catch {
    return null;
  }
}

import { env } from "../../../env.js";

// Shared by the bot process (plugin: join, /sync-roles, reconcile) and the API process (POST /jbcl/roles webhook).

export interface JbclRoles {
  owner: boolean;
  valueteam: boolean;
  websitemoderator: boolean;
  premium: number; // supporter tier 0-3
  earlyadopter: boolean;
}

export type JbclRoleMap = Partial<
  Record<"owner" | "valueteam" | "websitemoderator" | "earlyadopter" | "premium_1" | "premium_2" | "premium_3", string>
>;

const NO_ROLES: JbclRoles = { owner: false, valueteam: false, websitemoderator: false, premium: 0, earlyadopter: false };
const BATCH_SIZE = 1000; // API max per call

/**
 * Roles for each id from the JBCL API. Ids the API doesn't know get all-false (so their roles get removed).
 * Throws on API failure, so callers never strip roles because the API was down.
 */
export async function fetchJbclRoles(ids: string[]): Promise<Map<string, JbclRoles>> {
  const result = new Map<string, JbclRoles>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.jailbreakchangelogs.com/v2/users/roles", {
      method: "POST",
      headers: { Authorization: env.BOT_SERVICE_TOKEN ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`JBCL roles API error ${res.status}`);
    }
    const body = (await res.json()) as Record<string, JbclRoles>;
    for (const id of chunk) {
      result.set(id, body[id] ?? NO_ROLES);
    }
  }
  return result;
}

/** Which mapped roles to add/remove so the member's roles match `roles`. Unmapped roles are never touched. */
export function diffJbclRoles(roles: JbclRoles, map: JbclRoleMap, currentRoleIds: Iterable<string>) {
  const want: Record<keyof JbclRoleMap, boolean> = {
    owner: roles.owner,
    valueteam: roles.valueteam,
    websitemoderator: roles.websitemoderator,
    earlyadopter: roles.earlyadopter,
    premium_1: roles.premium === 1,
    premium_2: roles.premium === 2,
    premium_3: roles.premium === 3,
  };
  const current = new Set(currentRoleIds);
  const add: string[] = [];
  const remove: string[] = [];
  for (const [key, roleId] of Object.entries(map)) {
    if (!roleId) continue;
    const wanted = want[key as keyof JbclRoleMap];
    if (wanted && !current.has(roleId)) add.push(roleId);
    if (!wanted && current.has(roleId)) remove.push(roleId);
  }
  return { add, remove };
}

export const VERIFY_URL = "https://api.jailbreakchangelogs.com/verify";

export interface JbclAlt {
  user_id: string;
  matched_on: string[];
}

/**
 * Verifies without the website if the user logged in there within the last 24h (window enforced by the API).
 * Returns null when they haven't, or on API failure, so the caller falls back to the website link.
 */
export async function checkQuickVerify(userId: string): Promise<JbclAlt[] | null> {
  try {
    const res = await fetch("https://api.jailbreakchangelogs.com/v2/verify/check", {
      method: "POST",
      headers: { Authorization: env.BOT_SERVICE_TOKEN ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { verified: boolean; alts?: JbclAlt[] };
    return body.verified ? (body.alts ?? []) : null;
  } catch {
    return null;
  }
}

/** One line per alt; IP-only matches are flagged weak (shared Wi-Fi, carrier NAT). */
export function formatAltLines(alts: JbclAlt[]): string {
  return alts
    .map((alt) => {
      const weak = alt.matched_on.every((m) => m === "ip") ? " (IP only, weak)" : "";
      return `- <@${alt.user_id}> (\`${alt.user_id}\`): ${alt.matched_on.join(", ")}${weak}`;
    })
    .join("\n");
}

/** Mod log line for a verification. */
export function formatVerifyLog(userId: string, alts: JbclAlt[]): string {
  const content = `<@${userId}> (\`${userId}\`) verified.` + (alts.length ? `\n**Possible alts:**\n${formatAltLines(alts)}` : "");
  return content.slice(0, 2000);
}

/** All accounts the website links to this user, regardless of when they last logged in. Throws on API failure. */
export async function fetchJbclAlts(userId: string): Promise<JbclAlt[]> {
  const res = await fetch("https://api.jailbreakchangelogs.com/v2/users/alts", {
    method: "POST",
    headers: { Authorization: env.BOT_SERVICE_TOKEN ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`JBCL alts API error ${res.status}`);
  return ((await res.json()) as { alts: JbclAlt[] }).alts;
}

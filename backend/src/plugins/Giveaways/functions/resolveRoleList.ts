import { Client } from "discord.js";
import { resolveRoleId } from "../../../utils.js";

export type ResolveRoleListResult = { roleIds: string[]; unresolved: string[] };

/**
 * Resolves a comma/space-separated list of role mentions/IDs/names (e.g. from a `-role`/`-bypass`/`-blacklist`
 * flag) into role IDs, same resolution logic MessagesLeaderboardCmd uses for a single role. Unresolved tokens
 * are reported back rather than silently dropped, so the caller can tell the user exactly what didn't match.
 */
export async function resolveRoleList(client: Client, guildId: string, input: string): Promise<ResolveRoleListResult> {
  const tokens = input
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const roleIds: string[] = [];
  const unresolved: string[] = [];

  for (const token of tokens) {
    const roleId = await resolveRoleId(client, guildId, token);
    if (roleId) {
      roleIds.push(roleId);
    } else {
      unresolved.push(token);
    }
  }

  return { roleIds, unresolved };
}

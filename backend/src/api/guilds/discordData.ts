import { ApiPermissions } from "@zeppelinbot/shared/apiPermissions.js";
import express, { Request, Response } from "express";
import { env } from "../../env.js";
import { hasGuildPermission, requireGuildPermission } from "../permissions.js";
import { serverError, unauthorized } from "../responses.js";
import { isGiveawayManager } from "./giveawayAccess.js";

// The API and bot run as separate processes (see backend/package.json's start-api-* vs start-bot-* scripts), so
// this can't just read from discord.js's live guild caches — it makes its own bot-token REST calls to Discord.
// Used by the dashboard's config form to power role/channel/emoji pickers instead of raw ID text fields.
const DISCORD_API_URL = "https://discord.com/api/v10";

// Short-lived cache (and in-flight request de-dupe) so a form with several role/channel/emoji fields on the same
// page doesn't fire off a redundant Discord API call per field.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: number; promise: Promise<any> }>();

async function discordBotRequest(path: string): Promise<any> {
  const res = await fetch(`${DISCORD_API_URL}/${path}`, {
    headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Discord API error ${res.status}`);
  }
  return res.json();
}

function cachedDiscordBotRequest(cacheKey: string, path: string): Promise<any> {
  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise;
  }

  const promise = discordBotRequest(path).catch((err) => {
    cache.delete(cacheKey); // don't cache failures
    throw err;
  });
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
  return promise;
}

// Adds/removes a single role on a guild member directly via the bot token — no live gateway connection needed
// (PUT/DELETE .../roles/{role.id} is a plain REST call), used by the dashboard's role-grant cards (e.g.
// Giveaways' contributor role, see api/guilds/giveaways.ts). Discord itself enforces the usual constraints (the
// bot needs Manage Roles and its own top role above the target role) — a failure here just surfaces as a normal
// thrown error for the caller to report, same as any other Discord API error in this file.
export async function setGuildMemberRole(guildId: string, userId: string, roleId: string, grant: boolean): Promise<void> {
  const res = await fetch(`${DISCORD_API_URL}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: grant ? "PUT" : "DELETE",
    headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord API error ${res.status}: ${body}`);
  }
}

// Used by the Giveaways dashboard page's access check (backend/src/api/guilds/giveaways.ts) — the dashboard
// has no OAuth scope for a user's live guild roles, so this asks Discord for them using the bot's own
// membership in the guild instead, same cache/error-handling shape as the role/channel/emoji lookups above.
// Returns null (not an empty array) if the user isn't currently a member of the guild.
export async function getGuildMemberRoleIds(guildId: string, userId: string): Promise<string[] | null> {
  try {
    const member = await cachedDiscordBotRequest(`member:${guildId}:${userId}`, `guilds/${guildId}/members/${userId}`);
    return (member.roles as string[]) ?? [];
  } catch {
    return null;
  }
}

export interface GuildMemberDisplayInfo {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

// Used by the Giveaways dashboard page to show winner/host names instead of raw IDs. Discord has no bulk
// "look up several arbitrary users" endpoint, so a caller resolving several IDs (see
// api/guilds/giveaways.ts's /members route) just calls this once per ID — each call is still cached/de-duped
// the same as the single-member lookup above. Returns null if the user isn't currently a guild member (e.g.
// they left after winning) rather than throwing, so one missing member doesn't break the whole batch.
export async function getGuildMemberDisplayInfo(guildId: string, userId: string): Promise<GuildMemberDisplayInfo | null> {
  try {
    const member = await cachedDiscordBotRequest(`member:${guildId}:${userId}`, `guilds/${guildId}/members/${userId}`);
    const user = member.user ?? {};
    return {
      id: userId,
      username: user.username ?? userId,
      displayName: member.nick ?? user.global_name ?? user.username ?? userId,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=32` : null,
    };
  } catch {
    // Not a current guild member (they left, or were never one) — Discord's per-guild member endpoint 404s for
    // that. The plain per-user endpoint still resolves anyone with a valid account regardless of guild
    // membership, just without a guild nickname — this is what was making leaderboard/history/finished-giveaway
    // entries for anyone who'd left the server show their raw ID instead of a name.
    return getGlobalUserDisplayInfo(userId);
  }
}

async function getGlobalUserDisplayInfo(userId: string): Promise<GuildMemberDisplayInfo | null> {
  try {
    const user = await cachedDiscordBotRequest(`user:${userId}`, `users/${userId}`);
    return {
      id: userId,
      username: user.username ?? userId,
      displayName: user.global_name ?? user.username ?? userId,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=32` : null,
    };
  } catch {
    return null;
  }
}

// Used by the Giveaways dashboard's "Recently finished" search to resolve a typed username/nickname into
// candidate host IDs — giveaways only ever store host_id, never a username, so matching by name has to go
// through Discord's own member search rather than anything stored locally. Discord's member search endpoint
// prefix-matches from the start of a username/nickname, case-insensitively. Only finds members *currently* in
// the guild — a host who's since left won't turn up, same limitation as every other live-Discord lookup here.
export async function searchGuildMembersByUsername(guildId: string, query: string, limit: number): Promise<string[]> {
  try {
    const members = await cachedDiscordBotRequest(
      `member-search:${guildId}:${query.toLowerCase()}:${limit}`,
      `guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
    return (members as any[]).map((m) => m.user.id);
  } catch {
    return [];
  }
}

// Bulk channel name lookup, sharing the same 30s cache as the /discord-data/channels route below (same cache
// key) — used server-side by callers that want a few channel names without a round trip through that route
// themselves (e.g. the Messages dashboard's "top channels" widget, see api/guilds/messageTracker.ts). Returns an
// id -> name map; channel IDs with no match (deleted since, or just never fetched) are simply absent.
export async function getGuildChannelNameMap(guildId: string): Promise<Record<string, string>> {
  try {
    const channels = await cachedDiscordBotRequest(`channels:${guildId}`, `guilds/${guildId}/channels`);
    return Object.fromEntries((channels as any[]).map((c) => [c.id, c.name]));
  } catch {
    return {};
  }
}

// Giveaway managers need role and channel names to create a giveaway, even when they are not allowed to view
// the guild's full configuration. Other dashboard users retain the normal ReadConfig requirement.
async function hasDiscordDataAccess(userId: string, guildId: string): Promise<boolean> {
  return (
    (await hasGuildPermission(userId, guildId, ApiPermissions.ReadConfig)) ||
    (await isGiveawayManager(guildId, userId))
  );
}

function requireDiscordDataAccess() {
  return async (req: Request, res: Response, next) => {
    if (!(await hasDiscordDataAccess(req.user!.userId, req.params.guildId))) {
      return unauthorized(res);
    }
    next();
  };
}

export function initGuildDiscordDataAPI(router: express.Router) {
  const discordDataRouter = express.Router();

  discordDataRouter.get(
    "/:guildId/discord-data/roles",
    requireDiscordDataAccess(),
    async (req: Request, res: Response) => {
      try {
        const roles = await cachedDiscordBotRequest(
          `roles:${req.params.guildId}`,
          `guilds/${req.params.guildId}/roles`,
        );
        res.json(
          (roles as any[])
            .filter((r) => r.name !== "@everyone")
            .sort((a, b) => b.position - a.position)
            .map((r) => ({ id: r.id, name: r.name, color: r.color })),
        );
      } catch {
        serverError(res, "Failed to fetch roles from Discord");
      }
    },
  );

  discordDataRouter.get(
    "/:guildId/discord-data/channels",
    requireDiscordDataAccess(),
    async (req: Request, res: Response) => {
      try {
        const channels = await cachedDiscordBotRequest(
          `channels:${req.params.guildId}`,
          `guilds/${req.params.guildId}/channels`,
        );
        res.json(
          (channels as any[])
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((c) => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parent_id ?? null })),
        );
      } catch {
        serverError(res, "Failed to fetch channels from Discord");
      }
    },
  );

  discordDataRouter.get(
    "/:guildId/discord-data/emojis",
    requireGuildPermission(ApiPermissions.ReadConfig),
    async (req: Request, res: Response) => {
      try {
        const emojis = await cachedDiscordBotRequest(
          `emojis:${req.params.guildId}`,
          `guilds/${req.params.guildId}/emojis`,
        );
        res.json((emojis as any[]).map((e) => ({ id: e.id, name: e.name, animated: !!e.animated })));
      } catch {
        serverError(res, "Failed to fetch emojis from Discord");
      }
    },
  );

  router.use("/", discordDataRouter);
}

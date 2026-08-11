import { ApiPermissions } from "@zeppelinbot/shared/apiPermissions.js";
import express, { Request, Response } from "express";
import { env } from "../../env.js";
import { requireGuildPermission } from "../permissions.js";
import { serverError } from "../responses.js";

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

export function initGuildDiscordDataAPI(router: express.Router) {
  const discordDataRouter = express.Router();

  discordDataRouter.get(
    "/:guildId/discord-data/roles",
    requireGuildPermission(ApiPermissions.ReadConfig),
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
    requireGuildPermission(ApiPermissions.ReadConfig),
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

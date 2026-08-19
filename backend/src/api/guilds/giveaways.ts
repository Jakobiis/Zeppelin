import express, { NextFunction, Request, Response } from "express";
import { GiveawayEntries } from "../../data/GiveawayEntries.js";
import { Configs } from "../../data/Configs.js";
import { GuildGiveaways } from "../../data/GuildGiveaways.js";
import { createGiveawayRecord } from "../../plugins/Giveaways/functions/createGiveaway.js";
import { finalizeGiveaway, rerollGiveaway } from "../../plugins/Giveaways/functions/finalizeGiveaway.js";
import { parseMessagePeriod } from "../../plugins/MessageTracker/functions/messagePeriods.js";
import { convertDelayStringToMS, isValidSnowflake } from "../../utils.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import { getGuildMemberDisplayInfo, getGuildMemberRoleIds } from "./discordData.js";
import { clientError, notFound, ok, serverError, unauthorized } from "../responses.js";

const RECENT_FINISHED_LIMIT = 20;
const MAX_ROLES_PER_FIELD = 20;
const MAX_EXTRA_ENTRY_ROLES = 20;
const MAX_MEMBER_LOOKUP_IDS = 100;

const configs = new Configs();
const giveawayEntries = new GiveawayEntries();

// Reads the same config the dashboard's YAML/Interface editor already reads and writes
// (see misc.ts / pluginConfigSchema.ts) — no new config-reading machinery.
async function getGiveawaysPluginConfig(guildId: string): Promise<any> {
  const activeConfig = await configs.getActiveByKey(`guild-${guildId}`);
  if (!activeConfig) {
    return {};
  }
  const parsed = loadYamlSafely(activeConfig.config);
  return parsed?.plugins?.giveaways?.config ?? {};
}

async function getGiveawayManagerRoles(guildId: string): Promise<string[]> {
  const config = await getGiveawaysPluginConfig(guildId);
  return config.manager_roles ?? [];
}

function sanitizeRoleIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((id) => typeof id === "string" && isValidSnowflake(id)).slice(0, MAX_ROLES_PER_FIELD);
}

// Same shape/bounds as the config schema's extra_entries validator (Giveaways/types.ts) — a role ID -> bonus
// entries map, bonus an integer 1-100.
function sanitizeExtraEntries(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, number> = {};
  for (const [roleId, bonus] of Object.entries(input as Record<string, unknown>)) {
    if (!isValidSnowflake(roleId)) continue;
    const n = Number(bonus);
    if (!Number.isInteger(n) || n < 1 || n > 100) continue;
    result[roleId] = n;
    if (Object.keys(result).length >= MAX_EXTRA_ENTRY_ROLES) break;
  }
  return result;
}

// Same {min, max} shape used everywhere a count-based requirement is stored (see GiveawayCountRange) — max
// null/absent means "no upper bound". Rejects a negative/non-integer min, or a max below min.
function sanitizeCountRange(input: unknown): { min: number; max: number | null } | null {
  if (!input || typeof input !== "object") return null;
  const { min: rawMin, max: rawMax } = input as Record<string, unknown>;
  const min = Number(rawMin);
  if (!Number.isInteger(min) || min < 0) return null;
  if (rawMax == null) return { min, max: null };
  const max = Number(rawMax);
  if (!Number.isInteger(max) || max < min) return null;
  return { min, max };
}

// Deliberately swallows errors and denies access rather than letting one propagate — this is called from every
// route below (directly or via requireGiveawayManager), and an unhandled rejection anywhere in the API process
// kills the whole thing (see api/index.ts's process.on("unhandledRejection", ...) -> process.exit(1)), taking
// down every other route with it, not just this one. A DB hiccup here should mean "access denied", not "the
// entire API goes down for everyone."
async function isGiveawayManager(guildId: string, userId: string): Promise<boolean> {
  try {
    const managerRoles = await getGiveawayManagerRoles(guildId);
    if (managerRoles.length === 0) {
      return false;
    }
    const memberRoleIds = await getGuildMemberRoleIds(guildId, userId);
    if (!memberRoleIds) {
      return false;
    }
    return memberRoleIds.some((roleId) => managerRoles.includes(roleId));
  } catch (err) {
    console.error("[GIVEAWAYS API] isGiveawayManager failed:", err); // tslint:disable-line:no-console
    return false;
  }
}

function requireGiveawayManager() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(await isGiveawayManager(req.params.guildId, req.user!.userId))) {
      return unauthorized(res);
    }
    next();
  };
}

export function initGuildGiveawaysAPI(router: express.Router) {
  const giveawaysRouter = express.Router();

  giveawaysRouter.get(
    "/:guildId/giveaways/analytics",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      try {
        res.json(await GuildGiveaways.getGuildInstance(req.params.guildId).getAnalytics());
      } catch {
        serverError(res, "Failed to load giveaway analytics");
      }
    },
  );

  // Resolves winner/host user IDs to display names for the dashboard's giveaway list — one bot-token REST call
  // per ID (Discord has no bulk lookup), each cached/de-duped by getGuildMemberDisplayInfo already. IDs that
  // aren't currently guild members (e.g. left after winning) are just omitted rather than erroring the batch.
  giveawaysRouter.get("/:guildId/giveaways/members", requireGiveawayManager(), async (req: Request, res: Response) => {
    try {
      const ids = String(req.query.ids ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => isValidSnowflake(id))
        .slice(0, MAX_MEMBER_LOOKUP_IDS);

      const members = await Promise.all(ids.map((id) => getGuildMemberDisplayInfo(req.params.guildId, id)));
      res.json(members.filter((m) => m != null));
    } catch (err) {
      serverError(res, "Failed to resolve member names");
    }
  });

  giveawaysRouter.get("/:guildId/giveaways/access", async (req: Request, res: Response) => {
    const isManager = await isGiveawayManager(req.params.guildId, req.user!.userId);
    res.json({ isManager });
  });

  // Powers the dashboard create form's template dropdown — just the names + the fields relevant to prefilling
  // the form (not manager_roles, which isn't a giveaway-creation concern).
  giveawaysRouter.get(
    "/:guildId/giveaways/templates",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      try {
        const config = await getGiveawaysPluginConfig(req.params.guildId);
        const templates = config.templates ?? {};
        res.json(
          Object.entries(templates).map(([name, template]: [string, any]) => ({
            name,
            channel_id: template.channel_id ?? null,
            embed_color: template.embed_color ?? null,
            bypass_roles: template.bypass_roles ?? [],
            blacklisted_roles: template.blacklisted_roles ?? [],
            extra_entries: template.extra_entries ?? {},
            claim_time: template.claim_time ?? null,
          })),
        );
      } catch (err) {
        serverError(res, "Failed to load giveaway templates");
      }
    },
  );

  giveawaysRouter.post("/:guildId/giveaways", requireGiveawayManager(), async (req: Request, res: Response) => {
    const body = req.body ?? {};

    const prize = typeof body.prize === "string" ? body.prize.trim() : "";
    if (!prize || prize.length > 512) {
      return clientError(res, "Prize is required and must be at most 512 characters");
    }

    const durationMs = typeof body.duration === "string" ? convertDelayStringToMS(body.duration) : null;
    if (!durationMs || durationMs <= 0) {
      return clientError(res, "Invalid duration — use a delay string like `1d`, `30m`, or `6h`");
    }

    const winnerCount = Number(body.winners) || 1;
    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
      return clientError(res, "Winner count must be a positive whole number");
    }

    const config = await getGiveawaysPluginConfig(req.params.guildId);
    // Same auto-apply-"default" behavior as the chat command (see GiveawayStartCmd.ts) — an explicit template
    // in the request body always wins over it.
    const template =
      typeof body.template === "string" && body.template
        ? config.templates?.[body.template]
        : config.templates?.default;
    if (body.template && !template) {
      return clientError(res, `Unknown giveaway template \`${body.template}\``);
    }

    const channelId =
      typeof body.channel_id === "string" && isValidSnowflake(body.channel_id)
        ? body.channel_id
        : (template?.channel_id ?? null);
    if (!channelId) {
      return clientError(res, "A channel is required, either directly or via a template");
    }

    const hostId = typeof body.host_id === "string" && isValidSnowflake(body.host_id) ? body.host_id : req.user!.userId;

    let messageRequirement: {
      period: "daily" | "weekly" | "monthly" | "allTime";
      min: number;
      max: number | null;
    } | null = null;
    if (body.message_requirement) {
      const period = parseMessagePeriod(String(body.message_requirement.period ?? ""));
      const range = sanitizeCountRange(body.message_requirement);
      if (!period || !range) {
        return clientError(res, "Invalid message requirement");
      }
      messageRequirement = { period, ...range };
    }

    // Just a range from the client — the counter name itself comes from this guild's own Giveaways config
    // (activity_counter_name, default "activity"), same as -activity on the chat command.
    let counterRequirement: { counter_name: string; min: number; max: number | null } | null = null;
    if (body.activity_requirement) {
      const range = sanitizeCountRange(body.activity_requirement);
      if (!range) {
        return clientError(res, "Invalid activity points requirement");
      }
      counterRequirement = { counter_name: config.activity_counter_name ?? "activity", ...range };
    }

    let coinsRequirement: { min: number; max: number | null } | null = null;
    if (body.coins_requirement) {
      const range = sanitizeCountRange(body.coins_requirement);
      if (!range) {
        return clientError(res, "Invalid coins requirement");
      }
      coinsRequirement = range;
    }

    try {
      const giveaway = await createGiveawayRecord(req.params.guildId, {
        channel_id: channelId,
        host_id: hostId,
        prize,
        winner_count: winnerCount,
        duration_ms: durationMs,
        embed_color: typeof body.embed_color === "number" ? body.embed_color : (template?.embed_color ?? null),
        required_role_ids: sanitizeRoleIds(body.required_role_ids),
        bypass_role_ids: body.bypass_role_ids ? sanitizeRoleIds(body.bypass_role_ids) : (template?.bypass_roles ?? []),
        blacklisted_role_ids: body.blacklisted_role_ids
          ? sanitizeRoleIds(body.blacklisted_role_ids)
          : (template?.blacklisted_roles ?? []),
        extra_entries: body.extra_entries ? sanitizeExtraEntries(body.extra_entries) : (template?.extra_entries ?? {}),
        message_requirement: messageRequirement,
        counter_requirement: counterRequirement,
        coins_requirement: coinsRequirement,
        claim_time_ms: (() => {
          if (typeof body.claim_time === "string" && body.claim_time) return convertDelayStringToMS(body.claim_time);
          if (template?.claim_time) return convertDelayStringToMS(template.claim_time);
          return null;
        })(),
      });
      res.json({ ...giveaway, entry_count: 0 });
    } catch (err) {
      serverError(res, "Failed to create giveaway");
    }
  });

  giveawaysRouter.get("/:guildId/giveaways", requireGiveawayManager(), async (req: Request, res: Response) => {
    try {
      const repo = GuildGiveaways.getGuildInstance(req.params.guildId);
      const [running, recentlyFinished] = await Promise.all([
        repo.getRunning(),
        repo.getRecentlyFinished(RECENT_FINISHED_LIMIT),
      ]);

      const withEntryCounts = await Promise.all(
        [...running, ...recentlyFinished].map(async (giveaway) => ({
          ...giveaway,
          entry_count: await giveawayEntries.count(giveaway.id),
        })),
      );

      res.json(withEntryCounts);
    } catch (err) {
      serverError(res, "Failed to load giveaways");
    }
  });

  giveawaysRouter.post("/:guildId/giveaways/:id/end", requireGiveawayManager(), async (req: Request, res: Response) => {
    try {
      const giveaway = await GuildGiveaways.getGuildInstance(req.params.guildId).find(Number(req.params.id));
      if (!giveaway) return notFound(res);
      if (giveaway.status !== "running") return clientError(res, "Giveaway isn't running");

      await finalizeGiveaway(giveaway.id, { cancelled: false });
      ok(res);
    } catch (err) {
      serverError(res, "Failed to end giveaway");
    }
  });

  giveawaysRouter.post(
    "/:guildId/giveaways/:id/reroll",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      try {
        const giveaway = await GuildGiveaways.getGuildInstance(req.params.guildId).find(Number(req.params.id));
        if (!giveaway) return notFound(res);
        if (giveaway.status !== "ended") return clientError(res, "Giveaway hasn't ended yet");

        const replaceWinnerIds = sanitizeRoleIds(req.body?.replaceWinnerIds);
        const currentWinnerIds = giveaway.winner_ids.filter((id) => !giveaway.expired_winner_ids.includes(id));
        if (replaceWinnerIds.length === 0 || replaceWinnerIds.length !== new Set(replaceWinnerIds).size) {
          return clientError(res, "Select one or more current winners to reroll");
        }
        if (replaceWinnerIds.some((id) => !currentWinnerIds.includes(id)))
          return clientError(res, "Invalid winner selection");

        const { newWinnerIds } = await rerollGiveaway(giveaway.id, replaceWinnerIds);
        res.json({ result: "ok", newWinnerCount: newWinnerIds.length });
      } catch (err) {
        serverError(res, "Failed to reroll giveaway");
      }
    },
  );

  giveawaysRouter.post(
    "/:guildId/giveaways/:id/cancel",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      try {
        const giveaway = await GuildGiveaways.getGuildInstance(req.params.guildId).find(Number(req.params.id));
        if (!giveaway) return notFound(res);
        if (giveaway.status !== "running") return clientError(res, "Giveaway isn't running");

        await finalizeGiveaway(giveaway.id, { cancelled: true });
        ok(res);
      } catch (err) {
        serverError(res, "Failed to cancel giveaway");
      }
    },
  );

  router.use("/", giveawaysRouter);
}

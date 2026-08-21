import express, { NextFunction, Request, Response } from "express";
import { Configs } from "../../data/Configs.js";
import { GuildMessageTrackerChannelCounts } from "../../data/GuildMessageTrackerChannelCounts.js";
import { GuildMessageTrackerCounts, MessageCounts } from "../../data/GuildMessageTrackerCounts.js";
import { isValidSnowflake } from "../../utils.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import {
  getGuildMemberDisplayInfo,
  getGuildMemberRoleIds,
  resolveChannelNames,
  searchGuildMembersByUsername,
} from "./discordData.js";
import { clientError, serverError, unauthorized } from "../responses.js";

const MAX_LOOKUP_MATCHES = 10;
const MAX_ADJUST_AMOUNT = 2147483647; // matches MAX_COUNT_VALUE in GuildMessageTrackerCounts
const TOP_LIST_LIMIT = 10;
const TOP_CHANNELS_LIMIT = 10;
const PERIODS = ["daily", "weekly", "monthly", "allTime"] as const;
type Period = (typeof PERIODS)[number];

const configs = new Configs();

// Reads the same config the dashboard's YAML/Interface editor already reads and writes — same approach as
// getGiveawaysPluginConfig/getPluginConfig in giveaways.ts/economy.ts, no new config-reading machinery.
async function getMessageTrackerPluginConfig(guildId: string): Promise<any> {
  const activeConfig = await configs.getActiveByKey(`guild-${guildId}`);
  if (!activeConfig) return {};
  const parsed = loadYamlSafely(activeConfig.config);
  return parsed?.plugins?.message_tracker?.config ?? {};
}

async function getMessageTrackerManagerRoles(guildId: string): Promise<string[]> {
  const config = await getMessageTrackerPluginConfig(guildId);
  return Array.isArray(config.manager_roles) ? config.manager_roles.filter((id: unknown) => typeof id === "string") : [];
}

// Same rationale as Giveaways'/Economy's isXManager: swallows errors and denies access rather than propagating,
// since an unhandled rejection here would kill the whole API process.
async function isMessageTrackerManager(guildId: string, userId: string): Promise<boolean> {
  try {
    const managerRoles = await getMessageTrackerManagerRoles(guildId);
    if (managerRoles.length === 0) return false;
    const memberRoleIds = await getGuildMemberRoleIds(guildId, userId);
    return memberRoleIds?.some((roleId) => managerRoles.includes(roleId)) ?? false;
  } catch (err) {
    console.error("[MESSAGES API] isMessageTrackerManager failed:", err); // tslint:disable-line:no-console
    return false;
  }
}

function requireMessageTrackerManager() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(await isMessageTrackerManager(req.params.guildId, req.user!.userId))) {
      return unauthorized(res);
    }
    next();
  };
}

async function resolveTopList(
  guildId: string,
  entries: Array<{ userId: string; count: number }>,
): Promise<Array<{ userId: string; count: number; member: Awaited<ReturnType<typeof getGuildMemberDisplayInfo>> }>> {
  const members = await Promise.all(entries.map((e) => getGuildMemberDisplayInfo(guildId, e.userId)));
  return entries.map((e, i) => ({ ...e, member: members[i] }));
}

export function initGuildMessageTrackerAPI(router: express.Router) {
  const messagesRouter = express.Router();

  messagesRouter.get("/:guildId/messages/access", async (req: Request, res: Response) => {
    const isManager = await isMessageTrackerManager(req.params.guildId, req.user!.userId);
    res.json({ isManager });
  });

  // Resolves a typed ID or username/nickname into candidate guild members — same shape as Economy's /lookup and
  // Giveaways' /lookup, powers this tab's user picker too.
  messagesRouter.get("/:guildId/messages/lookup", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (!query) return res.json([]);

      if (isValidSnowflake(query)) {
        const member = await getGuildMemberDisplayInfo(req.params.guildId, query);
        return res.json(member ? [member] : []);
      }

      const ids = await searchGuildMembersByUsername(req.params.guildId, query, MAX_LOOKUP_MATCHES);
      const members = await Promise.all(ids.map((id) => getGuildMemberDisplayInfo(req.params.guildId, id)));
      res.json(members.filter((m) => m != null));
    } catch (err) {
      serverError(res, "Failed to look up members");
    }
  });

  // Just the three top stat cards (messages today/total messages/tracked users) — a plain DB read with no
  // Discord REST calls, unlike /messages/top-senders and /messages/top-channels (which resolve names/avatars).
  // Split into its own route so the dashboard can poll this one every second for a live-updating counter without
  // hammering Discord's API or re-resolving the top lists on every tick.
  messagesRouter.get("/:guildId/messages/summary", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const summary = await GuildMessageTrackerCounts.getGuildInstance(req.params.guildId).getSummary();
      res.json(summary);
    } catch (err) {
      serverError(res, "Failed to load message summary");
    }
  });

  messagesRouter.get(
    "/:guildId/messages/user/:userId",
    requireMessageTrackerManager(),
    async (req: Request, res: Response) => {
      try {
        const { guildId, userId } = req.params;
        if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

        const [counts, member] = await Promise.all([
          GuildMessageTrackerCounts.getGuildInstance(guildId).getForUser(userId),
          getGuildMemberDisplayInfo(guildId, userId),
        ]);

        res.json({ userId, member, counts });
      } catch (err) {
        serverError(res, "Failed to load message counts");
      }
    },
  );

  // Give/subtract/set act on whichever period the caller picks (defaulting to all-time, same as before this
  // took a `period` field at all — the dashboard's own default is still "All-time" too, so an old client that
  // never sends `period` keeps working exactly as it did). Reset with no period resets all four at once (the
  // dashboard's "Reset all" button); with one, it resets just that period.
  messagesRouter.post(
    "/:guildId/messages/user/:userId",
    requireMessageTrackerManager(),
    async (req: Request, res: Response) => {
      try {
        const { guildId, userId } = req.params;
        if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

        const action = req.body?.action;
        if (!["give", "subtract", "set", "reset"].includes(action)) {
          return clientError(res, "action must be one of: give, subtract, set, reset");
        }

        const rawPeriod = req.body?.period;
        if (rawPeriod !== undefined && !PERIODS.includes(rawPeriod)) {
          return clientError(res, "period must be one of: daily, weekly, monthly, allTime");
        }
        const period: Period = rawPeriod ?? "allTime";

        // Only meaningful for "give" — attributes the credited messages to a channel so that channel's own
        // leaderboard/top-channels stats (see GuildMessageTrackerChannelCounts, otherwise only ever touched by
        // real messages via recordMessage) stay consistent with a manual credit. Subtract/set/reset have no
        // sensible channel to apply to (subtracting doesn't know which channel the over-count came from; set/
        // reset are absolute, not additive), so this is silently ignored for those.
        const rawChannelId = req.body?.channelId;
        if (rawChannelId !== undefined && rawChannelId !== null && !isValidSnowflake(rawChannelId)) {
          return clientError(res, "channelId must be a valid channel ID");
        }

        const repo = GuildMessageTrackerCounts.getGuildInstance(guildId);

        if (action === "reset") {
          const periodsToReset = rawPeriod ? [period] : PERIODS;
          await Promise.all(periodsToReset.map((p) => repo.setCount(userId, p, 0)));
        } else {
          const amount = Number(req.body?.amount);
          if (!Number.isInteger(amount) || amount < 0 || amount > MAX_ADJUST_AMOUNT) {
            return clientError(res, "amount must be a non-negative whole number");
          }

          if (action === "set") {
            await repo.setCount(userId, period, amount);
          } else {
            const current = await repo.getForUser(userId);
            const newValue = action === "give" ? current[period] + amount : current[period] - amount;
            await repo.setCount(userId, period, newValue);
          }

          if (action === "give" && rawChannelId) {
            await GuildMessageTrackerChannelCounts.getGuildInstance(guildId).addCount(rawChannelId, userId, period, amount);
          }
        }

        const counts: MessageCounts = await repo.getForUser(userId);
        res.json({ counts });
      } catch (err) {
        serverError(res, "Failed to update message counts");
      }
    },
  );

  // Top senders within one specific channel — the per-channel counterpart to /messages/top-senders (see
  // GuildMessageTrackerChannelCounts.getTop, populated by real messages via recordMessage and by "Give ... to
  // channel" credits via addCount).
  messagesRouter.get(
    "/:guildId/messages/channel/:channelId",
    requireMessageTrackerManager(),
    async (req: Request, res: Response) => {
      try {
        const { guildId, channelId } = req.params;
        if (!isValidSnowflake(channelId)) return clientError(res, "Invalid channel ID");

        const rawPeriod = req.query.period;
        if (rawPeriod !== undefined && !PERIODS.includes(rawPeriod as Period)) {
          return clientError(res, "period must be one of: daily, weekly, monthly, allTime");
        }
        const period: Period = (rawPeriod as Period | undefined) ?? "allTime";

        const [topRaw, channelNames] = await Promise.all([
          GuildMessageTrackerChannelCounts.getGuildInstance(guildId).getTop(channelId, period, TOP_LIST_LIMIT, 0),
          resolveChannelNames(guildId, [channelId]),
        ]);
        const top = await resolveTopList(guildId, topRaw);

        res.json({
          channelId,
          period,
          top,
          name: channelNames[channelId]?.name ?? null,
          type: channelNames[channelId]?.type ?? null,
        });
      } catch (err) {
        serverError(res, "Failed to load channel stats");
      }
    },
  );

  function parsePeriodQuery(req: Request, res: Response): Period | undefined {
    const rawPeriod = req.query.period;
    if (rawPeriod !== undefined && !PERIODS.includes(rawPeriod as Period)) {
      clientError(res, "period must be one of: daily, weekly, monthly, allTime");
      return undefined;
    }
    return (rawPeriod as Period | undefined) ?? "daily";
  }

  // Top senders guild-wide, for whichever rolling period the dashboard's selector is on — independent of
  // /messages/top-channels' own period (see GuildMessagesPanel.vue, each list has its own selector).
  messagesRouter.get("/:guildId/messages/top-senders", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const period = parsePeriodQuery(req, res);
      if (!period) return;

      const topSendersRaw = await GuildMessageTrackerCounts.getGuildInstance(guildId).getTop(period, TOP_LIST_LIMIT, 0);
      const topSenders = await resolveTopList(guildId, topSendersRaw);

      res.json({ period, topSenders });
    } catch (err) {
      serverError(res, "Failed to load top senders");
    }
  });

  // Top channels guild-wide, for whichever rolling period the dashboard's selector is on — independent of
  // /messages/top-senders' own period.
  messagesRouter.get("/:guildId/messages/top-channels", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const period = parsePeriodQuery(req, res);
      if (!period) return;

      const topChannelsRaw = await GuildMessageTrackerChannelCounts.getGuildInstance(guildId).getTopChannels(period, TOP_CHANNELS_LIMIT);
      const channelNames = await resolveChannelNames(guildId, topChannelsRaw.map((c) => c.channelId));

      const topChannels = topChannelsRaw.map((c) => ({
        ...c,
        name: channelNames[c.channelId]?.name ?? null,
        type: channelNames[c.channelId]?.type ?? null,
      }));

      res.json({ period, topChannels });
    } catch (err) {
      serverError(res, "Failed to load top channels");
    }
  });

  router.use("/", messagesRouter);
}

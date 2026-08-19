import express, { NextFunction, Request, Response } from "express";
import moment from "moment-timezone";
import { Configs } from "../../data/Configs.js";
import { GuildCounters, MAX_COUNTER_VALUE, MIN_COUNTER_VALUE } from "../../data/GuildCounters.js";
import { GuildEconomyGameHistory } from "../../data/GuildEconomyGameHistory.js";
import { GuildEconomyShop } from "../../data/GuildEconomyShop.js";
import { TRANSACTION_GAME_TYPES } from "../../plugins/Economy/functions/gameHistory.js";
import { isValidSnowflake } from "../../utils.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import { getGuildMemberDisplayInfo, getGuildMemberRoleIds, searchGuildMembersByUsername } from "./discordData.js";
import { clientError, notFound, ok, serverError, unauthorized } from "../responses.js";

const MAX_LEADERBOARD_PAGE_SIZE = 50;
const DEFAULT_LEADERBOARD_PAGE_SIZE = 20;
const MAX_HISTORY_PAGE_SIZE = 50;
const DEFAULT_HISTORY_PAGE_SIZE = 20;
const MAX_LOOKUP_MATCHES = 10;
const MAX_ADJUST_AMOUNT = MAX_COUNTER_VALUE;

const configs = new Configs();

// Reads the same config the dashboard's YAML/Interface editor already reads and writes — same approach as
// getGiveawaysPluginConfig in giveaways.ts, no new config-reading machinery.
async function getPluginConfig(guildId: string, pluginName: string): Promise<any> {
  const activeConfig = await configs.getActiveByKey(`guild-${guildId}`);
  if (!activeConfig) return {};
  const parsed = loadYamlSafely(activeConfig.config);
  return parsed?.plugins?.[pluginName]?.config ?? {};
}

async function getEconomyManagerRoles(guildId: string): Promise<string[]> {
  const config = await getPluginConfig(guildId, "economy");
  return Array.isArray(config.manager_roles) ? config.manager_roles.filter((id: unknown) => typeof id === "string") : [];
}

// Same rationale as Giveaways' isGiveawayManager: swallows errors and denies access rather than propagating,
// since an unhandled rejection here would kill the whole API process (see api/index.ts's
// process.on("unhandledRejection", ...) -> process.exit(1)).
async function isEconomyManager(guildId: string, userId: string): Promise<boolean> {
  try {
    const managerRoles = await getEconomyManagerRoles(guildId);
    if (managerRoles.length === 0) return false;
    const memberRoleIds = await getGuildMemberRoleIds(guildId, userId);
    return memberRoleIds?.some((roleId) => managerRoles.includes(roleId)) ?? false;
  } catch (err) {
    console.error("[ECONOMY API] isEconomyManager failed:", err); // tslint:disable-line:no-console
    return false;
  }
}

function requireEconomyManager() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(await isEconomyManager(req.params.guildId, req.user!.userId))) {
      return unauthorized(res);
    }
    next();
  };
}

// A dashboard-triggered balance edit writes straight to counter_values, same as the bot's own
// Counters/functions/{set,change}CounterValue.ts — but this runs in the API process, which has no live
// pluginData/counterIds map, so it re-derives the counter row + max_value from the guild's own config instead
// (mirroring getPluginConfig above). Doesn't fire counter triggers (role rewards etc.) the way the bot-side
// functions do — those are a live-gateway feature with no equivalent here, same limitation as editing the DB
// directly. Returns null if the coins counter isn't configured under Counters' own `counters:` key yet (Economy
// only *names* a counter, per-counter settings like max_value live in Counters' config — see Economy/types.ts's
// counter_name comment).
async function getCoinsCounterSettings(guildId: string, counterName: string): Promise<{ maxValue: number } | null> {
  const countersConfig = await getPluginConfig(guildId, "counters");
  const counter = countersConfig?.counters?.[counterName];
  if (!counter) return null;
  const maxValue = typeof counter.max_value === "number" ? counter.max_value : MAX_COUNTER_VALUE;
  return { maxValue };
}

async function getCounterName(guildId: string): Promise<string> {
  const config = await getPluginConfig(guildId, "economy");
  return typeof config.counter_name === "string" && config.counter_name ? config.counter_name : "coins";
}

export function initGuildEconomyAPI(router: express.Router) {
  const economyRouter = express.Router();

  economyRouter.get("/:guildId/economy/access", async (req: Request, res: Response) => {
    const isManager = await isEconomyManager(req.params.guildId, req.user!.userId);
    res.json({ isManager });
  });

  economyRouter.get("/:guildId/economy/leaderboard", requireEconomyManager(), async (req: Request, res: Response) => {
    try {
      const limit = Math.min(MAX_LEADERBOARD_PAGE_SIZE, Math.max(1, Math.trunc(Number(req.query.limit)) || DEFAULT_LEADERBOARD_PAGE_SIZE));
      const offset = Math.max(0, Math.trunc(Number(req.query.offset)) || 0);

      const counterName = await getCounterName(req.params.guildId);
      const countersRepo = GuildCounters.getGuildInstance(req.params.guildId);
      const counter = await countersRepo.findCounterByName(counterName);
      if (!counter) {
        return res.json({ items: [], total: 0 });
      }

      const [values, total] = await Promise.all([
        countersRepo.getTopValues(counter.id, limit, offset),
        countersRepo.getValueCount(counter.id),
      ]);

      const members = await Promise.all(values.map((v) => getGuildMemberDisplayInfo(req.params.guildId, v.user_id)));
      const items = values.map((v, i) => ({
        userId: v.user_id,
        balance: v.value,
        member: members[i],
      }));

      res.json({ items, total });
    } catch (err) {
      serverError(res, "Failed to load the leaderboard");
    }
  });

  // Resolves a typed ID or username/nickname into candidate guild members — powers the admin panel's user
  // picker (give/subtract/set balance, and jumping to a user's history).
  economyRouter.get("/:guildId/economy/lookup", requireEconomyManager(), async (req: Request, res: Response) => {
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

  economyRouter.get("/:guildId/economy/user/:userId", requireEconomyManager(), async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

      const counterName = await getCounterName(guildId);
      const countersRepo = GuildCounters.getGuildInstance(guildId);
      const counter = await countersRepo.findCounterByName(counterName);
      const balance = counter ? ((await countersRepo.getCurrentValue(counter.id, null, userId)) ?? 0) : 0;

      const shopRepo = GuildEconomyShop.getGuildInstance(guildId);
      const [coinsBoost, activityBoost, member] = await Promise.all([
        shopRepo.getActiveBoost(userId, "coins"),
        shopRepo.getActiveBoost(userId, "activity"),
        getGuildMemberDisplayInfo(guildId, userId),
      ]);

      res.json({
        userId,
        member,
        balance,
        activeBoosts: [coinsBoost && { type: "coins", ...coinsBoost }, activityBoost && { type: "activity", ...activityBoost }].filter(Boolean),
      });
    } catch (err) {
      serverError(res, "Failed to load user info");
    }
  });

  economyRouter.get(
    "/:guildId/economy/user/:userId/history",
    requireEconomyManager(),
    async (req: Request, res: Response) => {
      try {
        const { guildId, userId } = req.params;
        if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

        const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
        const pageSize = Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(1, Math.trunc(Number(req.query.pageSize)) || DEFAULT_HISTORY_PAGE_SIZE));

        const repo = GuildEconomyGameHistory.getGuildInstance(guildId);
        const filter = { userId };
        const [items, total, summary] = await Promise.all([
          repo.getEntries(filter, pageSize, (page - 1) * pageSize),
          repo.getCount(filter),
          repo.getSummary(filter),
        ]);

        const opponentIds = [...new Set(items.map((e) => e.opponent_id).filter((id): id is string => !!id && id !== "bot"))];
        const opponents = await Promise.all(opponentIds.map((id) => getGuildMemberDisplayInfo(guildId, id)));
        const members = Object.fromEntries(opponentIds.map((id, i) => [id, opponents[i]]).filter(([, m]) => m != null));

        res.json({ items, total, page, pageSize, summary, members });
      } catch (err) {
        serverError(res, "Failed to load user history");
      }
    },
  );

  economyRouter.post(
    "/:guildId/economy/user/:userId/balance",
    requireEconomyManager(),
    async (req: Request, res: Response) => {
      try {
        const { guildId, userId } = req.params;
        if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

        const action = req.body?.action;
        const amount = Number(req.body?.amount);
        if (!["give", "subtract", "set"].includes(action)) {
          return clientError(res, "action must be one of: give, subtract, set");
        }
        if (!Number.isInteger(amount) || amount < 0 || amount > MAX_ADJUST_AMOUNT) {
          return clientError(res, "amount must be a non-negative whole number");
        }

        const counterName = await getCounterName(guildId);
        const counterSettings = await getCoinsCounterSettings(guildId, counterName);
        if (!counterSettings) {
          return clientError(res, `The "${counterName}" counter isn't configured under this server's Counters plugin yet.`);
        }

        const countersRepo = GuildCounters.getGuildInstance(guildId);
        const counter = await countersRepo.findOrCreateCounter(counterName, false, true);

        if (action === "set") {
          await countersRepo.setCounterValue(counter.id, null, userId, amount, counterSettings.maxValue);
        } else {
          const current = (await countersRepo.getCurrentValue(counter.id, null, userId)) ?? 0;
          const change = action === "give" ? amount : -amount;
          await countersRepo.changeCounterValue(counter.id, null, userId, change, current, counterSettings.maxValue);
        }

        const newBalance = Math.max(MIN_COUNTER_VALUE, (await countersRepo.getCurrentValue(counter.id, null, userId)) ?? 0);
        res.json({ balance: newBalance });
      } catch (err) {
        serverError(res, "Failed to update balance");
      }
    },
  );

  // Guild-wide totals for today (UTC) — restricted to actual games (excludes give/trade/tradeback, see
  // TRANSACTION_GAME_TYPES), since mixing in transfers would muddy "how much was won/lost" with money that just
  // moved between two players rather than being gained/lost against the house.
  economyRouter.get("/:guildId/economy/analytics", requireEconomyManager(), async (req: Request, res: Response) => {
    try {
      const since = moment.utc().startOf("day").toDate();
      const repo = GuildEconomyGameHistory.getGuildInstance(req.params.guildId);
      const summary = await repo.getSummary({ since, excludeGameTypes: TRANSACTION_GAME_TYPES });
      res.json(summary);
    } catch (err) {
      serverError(res, "Failed to load analytics");
    }
  });

  // Guild-wide give/trade/tradeback feed, most recent first — the dashboard equivalent of a user's own history,
  // but across everyone, so staff can audit transfer activity without looking up one user at a time.
  economyRouter.get("/:guildId/economy/transactions", requireEconomyManager(), async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
      const pageSize = Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(1, Math.trunc(Number(req.query.pageSize)) || DEFAULT_HISTORY_PAGE_SIZE));

      const repo = GuildEconomyGameHistory.getGuildInstance(req.params.guildId);
      const filter = { gameTypes: TRANSACTION_GAME_TYPES };
      const [items, total] = await Promise.all([
        repo.getEntries(filter, pageSize, (page - 1) * pageSize),
        repo.getCount(filter),
      ]);

      const memberIds = [...new Set(items.flatMap((e) => [e.user_id, ...(e.opponent_id && e.opponent_id !== "bot" ? [e.opponent_id] : [])]))];
      const members = await Promise.all(memberIds.map((id) => getGuildMemberDisplayInfo(req.params.guildId, id)));
      const memberById = Object.fromEntries(memberIds.map((id, i) => [id, members[i]]).filter(([, m]) => m != null));

      res.json({ items, total, page, pageSize, members: memberById });
    } catch (err) {
      serverError(res, "Failed to load transactions");
    }
  });

  router.use("/", economyRouter);
}

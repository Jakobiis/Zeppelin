import express, { Request, Response } from "express";
import { GuildCounters, MAX_COUNTER_VALUE, MIN_COUNTER_VALUE } from "../../data/GuildCounters.js";
import { isValidSnowflake } from "../../utils.js";
import { getGuildMemberDisplayInfo, searchGuildMembersByUsername } from "./discordData.js";
import { getCoinsCounterSettings } from "./economy.js";
import { requireMessageTrackerManager } from "./messageTracker.js";
import { clientError, serverError } from "../responses.js";

// Same hardcoded name the Counters plugin's !activity commands use (see Counters/commands/ActivityCmd.ts).
const ACTIVITY_COUNTER_NAME = "activity";
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;
const MAX_LOOKUP_MATCHES = 10;
const MAX_SEARCH_LENGTH = 200;

// Activity points are a plain Counters-plugin counter, so this mirrors economy.ts's leaderboard/balance routes against
// the "activity" counter. Access reuses Message Tracker's manager_roles (same staff audience as the Messages tab).
// ponytail: like the economy balance edit, changes here don't fire counter triggers (activity roles) until the bot's
// own next change/decay re-evaluates them.
export function initGuildActivityAPI(router: express.Router) {
  const activityRouter = express.Router();

  activityRouter.get("/:guildId/activity/leaderboard", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(req.query.limit)) || DEFAULT_PAGE_SIZE));
      const offset = Math.max(0, Math.trunc(Number(req.query.offset)) || 0);
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, MAX_SEARCH_LENGTH) : "";

      const countersRepo = GuildCounters.getGuildInstance(guildId);
      const counter = await countersRepo.findCounterByName(ACTIVITY_COUNTER_NAME);
      if (!counter) return res.json({ items: [], total: 0 });

      let userIds: string[] | undefined;
      if (search) {
        userIds = isValidSnowflake(search) ? [search] : [];
        for (const id of await searchGuildMembersByUsername(guildId, search, MAX_LOOKUP_MATCHES)) {
          if (!userIds.includes(id)) userIds.push(id);
        }
        if (userIds.length === 0) return res.json({ items: [], total: 0 });
      }

      const [values, total] = await Promise.all([
        countersRepo.getTopValues(counter.id, limit, offset, userIds),
        countersRepo.getValueCount(counter.id, userIds),
      ]);
      const members = await Promise.all(values.map((v) => getGuildMemberDisplayInfo(guildId, v.user_id)));
      res.json({
        items: values.map((v, i) => ({ userId: v.user_id, points: v.value, member: members[i] })),
        total,
      });
    } catch (err) {
      serverError(res, "Failed to load the activity leaderboard");
    }
  });

  activityRouter.get("/:guildId/activity/user/:userId", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

      const countersRepo = GuildCounters.getGuildInstance(guildId);
      const counter = await countersRepo.findCounterByName(ACTIVITY_COUNTER_NAME);
      const [points, member] = await Promise.all([
        counter ? countersRepo.getCurrentValue(counter.id, null, userId) : undefined,
        getGuildMemberDisplayInfo(guildId, userId),
      ]);
      res.json({ userId, member, points: points ?? 0 });
    } catch (err) {
      serverError(res, "Failed to load activity points");
    }
  });

  activityRouter.post("/:guildId/activity/user/:userId", requireMessageTrackerManager(), async (req: Request, res: Response) => {
    try {
      const { guildId, userId } = req.params;
      if (!isValidSnowflake(userId)) return clientError(res, "Invalid user ID");

      const action = req.body?.action;
      if (!["give", "subtract", "set", "reset"].includes(action)) {
        return clientError(res, "action must be one of: give, subtract, set, reset");
      }
      const amount = action === "reset" ? 0 : Number(req.body?.amount);
      if (!Number.isInteger(amount) || amount < 0 || amount > MAX_COUNTER_VALUE) {
        return clientError(res, "amount must be a non-negative whole number");
      }

      const settings = await getCoinsCounterSettings(guildId, ACTIVITY_COUNTER_NAME);
      if (!settings) {
        return clientError(res, `The "${ACTIVITY_COUNTER_NAME}" counter isn't configured under this server's Counters plugin yet.`);
      }

      const countersRepo = GuildCounters.getGuildInstance(guildId);
      const counter = await countersRepo.findOrCreateCounter(ACTIVITY_COUNTER_NAME, false, true);

      if (action === "set" || action === "reset") {
        await countersRepo.setCounterValue(counter.id, null, userId, amount, settings.maxValue);
      } else {
        const before = (await countersRepo.getCurrentValue(counter.id, null, userId)) ?? 0;
        await countersRepo.changeCounterValue(counter.id, null, userId, action === "give" ? amount : -amount, before, settings.maxValue);
      }

      const points = Math.max(MIN_COUNTER_VALUE, (await countersRepo.getCurrentValue(counter.id, null, userId)) ?? 0);
      res.json({ points });
    } catch (err) {
      serverError(res, "Failed to update activity points");
    }
  });

  router.use("/", activityRouter);
}

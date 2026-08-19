import express, { NextFunction, Request, Response } from "express";
import { GiveawayEntries } from "../../data/GiveawayEntries.js";
import { Configs } from "../../data/Configs.js";
import { GuildGiveaways } from "../../data/GuildGiveaways.js";
import { finalizeGiveaway, rerollGiveaway } from "../../plugins/Giveaways/functions/finalizeGiveaway.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import { getGuildMemberRoleIds } from "./discordData.js";
import { clientError, notFound, ok, serverError, unauthorized } from "../responses.js";

const RECENT_FINISHED_LIMIT = 20;

const configs = new Configs();
const giveawayEntries = new GiveawayEntries();

// Reads the same config the dashboard's YAML/Interface editor already reads and writes
// (see misc.ts / pluginConfigSchema.ts) — no new config-reading machinery.
async function getGiveawayManagerRoles(guildId: string): Promise<string[]> {
  const activeConfig = await configs.getActiveByKey(`guild-${guildId}`);
  if (!activeConfig) {
    return [];
  }
  const parsed = loadYamlSafely(activeConfig.config);
  return parsed?.plugins?.giveaways?.config?.manager_roles ?? [];
}

async function isGiveawayManager(guildId: string, userId: string): Promise<boolean> {
  const managerRoles = await getGiveawayManagerRoles(guildId);
  if (managerRoles.length === 0) {
    return false;
  }
  const memberRoleIds = await getGuildMemberRoleIds(guildId, userId);
  if (!memberRoleIds) {
    return false;
  }
  return memberRoleIds.some((roleId) => managerRoles.includes(roleId));
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

  giveawaysRouter.get("/:guildId/giveaways/access", async (req: Request, res: Response) => {
    const isManager = await isGiveawayManager(req.params.guildId, req.user!.userId);
    res.json({ isManager });
  });

  giveawaysRouter.get(
    "/:guildId/giveaways",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
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
    },
  );

  giveawaysRouter.post(
    "/:guildId/giveaways/:id/end",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      const giveaway = await GuildGiveaways.getGuildInstance(req.params.guildId).find(Number(req.params.id));
      if (!giveaway) return notFound(res);
      if (giveaway.status !== "running") return clientError(res, "Giveaway isn't running");

      try {
        await finalizeGiveaway(giveaway.id, { cancelled: false });
        ok(res);
      } catch {
        serverError(res, "Failed to end giveaway");
      }
    },
  );

  giveawaysRouter.post(
    "/:guildId/giveaways/:id/reroll",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      const giveaway = await GuildGiveaways.getGuildInstance(req.params.guildId).find(Number(req.params.id));
      if (!giveaway) return notFound(res);
      if (giveaway.status !== "ended") return clientError(res, "Giveaway hasn't ended yet");

      try {
        await rerollGiveaway(giveaway.id);
        ok(res);
      } catch {
        serverError(res, "Failed to reroll giveaway");
      }
    },
  );

  giveawaysRouter.post(
    "/:guildId/giveaways/:id/cancel",
    requireGiveawayManager(),
    async (req: Request, res: Response) => {
      const giveaway = await GuildGiveaways.getGuildInstance(req.params.guildId).find(Number(req.params.id));
      if (!giveaway) return notFound(res);
      if (giveaway.status !== "running") return clientError(res, "Giveaway isn't running");

      try {
        await finalizeGiveaway(giveaway.id, { cancelled: true });
        ok(res);
      } catch {
        serverError(res, "Failed to cancel giveaway");
      }
    },
  );

  router.use("/", giveawaysRouter);
}

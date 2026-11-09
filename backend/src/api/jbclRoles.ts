import { timingSafeEqual } from "crypto";
import express, { Request, Response } from "express";
import { z } from "zod";
import { Configs } from "../data/Configs.js";
import { env } from "../env.js";
import { JbclRoleMap, diffJbclRoles, formatVerifyLog } from "../plugins/JbclRoles/functions/jbclRoles.js";
import { loadYamlSafely } from "../utils/loadYamlSafely.js";
import { sendChannelMessage } from "../plugins/Giveaways/functions/discordRest.js";
import { setGuildMemberRole } from "./guilds/discordData.js";
import { clientError, serverError, unauthorized } from "./responses.js";

const configs = new Configs();

const zId = z.string().regex(/^\d{17,20}$/);

const zBody = z.object({
  user_id: zId,
  roles: z.object({
    owner: z.boolean(),
    valueteam: z.boolean(),
    websitemoderator: z.boolean(),
    premium: z.number().int().min(0).max(3),
    earlyadopter: z.boolean(),
  }),
});

function isAuthorized(header: string | undefined): boolean {
  const expected = env.BOT_SERVICE_TOKEN;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Push endpoint for the JBCL API: syncs one user's website roles in every guild with jbcl_roles configured. */
export function initJbclRoles(router: express.Router) {
  router.post("/jbcl/roles", async (req: Request, res: Response) => {
    if (!isAuthorized(req.headers.authorization)) return unauthorized(res);
    const parsed = zBody.safeParse(req.body);
    if (!parsed.success) return clientError(res, "Invalid body");
    const { user_id, roles } = parsed.data;

    for (const config of await configs.getActive()) {
      const guildId = config.key.match(/^guild-(.+)$/)?.[1];
      const map: JbclRoleMap | undefined = guildId ? loadYamlSafely(config.config)?.plugins?.jbcl_roles?.config?.roles : undefined;
      if (!guildId || !map) continue;

      // Uncached on purpose: discordData's 30s member cache could undo a back-to-back push.
      const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user_id}`, {
        headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
      });
      if (!memberRes.ok) continue; // not a member (404) or Discord error
      const current = ((await memberRes.json()) as { roles: string[] }).roles;
      const { add, remove } = diffJbclRoles(roles, map, current);
      for (const roleId of add) await setGuildMemberRole(guildId, user_id, roleId, true).catch(logErr);
      for (const roleId of remove) await setGuildMemberRole(guildId, user_id, roleId, false).catch(logErr);
    }
    res.json({ ok: true });
  });
}

const zVerifiedBody = z.object({
  user_id: zId,
  guild_id: zId,
  alts: z.array(z.object({ user_id: zId, matched_on: z.array(z.string()) })),
});

async function getJbclRolesConfig(guildId: string) {
  const config = await configs.getActiveByKey(`guild-${guildId}`);
  return config ? loadYamlSafely(config.config)?.plugins?.jbcl_roles?.config : undefined;
}

/**
 * Push endpoint for the JBCL API after a user verifies on the website. Responds 2xx only once the role is given,
 * since the website shows the user a retry on failure. Alts are only reported to mods, never acted on.
 */
export function initJbclVerified(router: express.Router) {
  router.post("/jbcl/verified", async (req: Request, res: Response) => {
    if (!isAuthorized(req.headers.authorization)) return unauthorized(res);
    const parsed = zVerifiedBody.safeParse(req.body);
    if (!parsed.success) return clientError(res, "Invalid body");
    const { user_id, guild_id, alts } = parsed.data;

    const cfg = await getJbclRolesConfig(guild_id);
    if (!cfg?.verified_role) return clientError(res, "Verification not configured for this guild");

    try {
      await setGuildMemberRole(guild_id, user_id, cfg.verified_role, true);
      if (cfg.unverified_role) await setGuildMemberRole(guild_id, user_id, cfg.unverified_role, false);
    } catch (err) {
      logErr(err);
      return serverError(res, "Failed to give verified role");
    }

    if (cfg.alt_log_channel) {
      await sendChannelMessage(cfg.alt_log_channel, {
        content: formatVerifyLog(user_id, alts),
        allowed_mentions: { parse: [] },
      }).catch(logErr);
    }
    res.json({ ok: true });
  });
}

function logErr(err: unknown) {
  console.error("[JBCL ROLES API]", err); // tslint:disable-line:no-console
}

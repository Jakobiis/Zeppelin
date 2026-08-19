import { Configs } from "../../data/Configs.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import { getGuildMemberRoleIds } from "./discordData.js";

const configs = new Configs();

async function getGiveawayManagerRoles(guildId: string): Promise<string[]> {
  const activeConfig = await configs.getActiveByKey(`guild-${guildId}`);
  if (!activeConfig) return [];

  const managerRoles = loadYamlSafely(activeConfig.config)?.plugins?.giveaways?.config?.manager_roles;
  return Array.isArray(managerRoles) ? managerRoles.filter((roleId): roleId is string => typeof roleId === "string") : [];
}

/** Whether a current guild member has a role allowed to manage that guild's giveaways. */
export async function isGiveawayManager(guildId: string, userId: string): Promise<boolean> {
  try {
    const managerRoles = await getGiveawayManagerRoles(guildId);
    if (managerRoles.length === 0) return false;

    const memberRoleIds = await getGuildMemberRoleIds(guildId, userId);
    return memberRoleIds?.some((roleId) => managerRoles.includes(roleId)) ?? false;
  } catch (err) {
    console.error("[GIVEAWAYS API] isGiveawayManager failed:", err); // tslint:disable-line:no-console
    return false;
  }
}

/** Guild IDs where a user can manage giveaways, including users without API dashboard permissions. */
export async function getGiveawayManagerGuildIds(userId: string): Promise<string[]> {
  const activeConfigs = await configs.getActive();
  const guildIds = activeConfigs
    .map((config) => config.key.match(/^guild-(.+)$/)?.[1])
    .filter((guildId): guildId is string => guildId != null);

  const access = await Promise.all(guildIds.map(async (guildId) => (await isGiveawayManager(guildId, userId) ? guildId : null)));
  return access.filter((guildId): guildId is string => guildId != null);
}

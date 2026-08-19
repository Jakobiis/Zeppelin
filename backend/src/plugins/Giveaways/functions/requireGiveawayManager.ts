import { GuildMember } from "discord.js";
import { GuildPluginData } from "vety";
import { GiveawaysPluginType } from "../types.js";

/**
 * Whether `member` has any of the guild's configured `manager_roles` — the entire permission model for this
 * plugin (see types.ts), checked the same way from bot commands (here) and from the dashboard API
 * (backend/src/api/guilds/giveaways.ts, which can't call this directly since it has no live GuildMember, but
 * performs the equivalent role-ID-intersection check).
 */
export function hasGiveawayManagerRole(pluginData: GuildPluginData<GiveawaysPluginType>, member: GuildMember): boolean {
  const config = pluginData.config.get();
  if (config.manager_roles.length === 0) {
    return false;
  }
  return member.roles.cache.some((role) => config.manager_roles.includes(role.id));
}

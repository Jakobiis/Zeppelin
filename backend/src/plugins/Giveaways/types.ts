import { BasePluginType, pluginUtils } from "vety";
import { z } from "zod";
import { GuildGiveaways } from "../../data/GuildGiveaways.js";
import { zBoundedCharacters, zBoundedRecord, zDelayString, zSnowflake } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";

const MAX_ROLES_PER_LIST = 20;
const MAX_EXTRA_ENTRY_ROLES = 20;
const MAX_TEMPLATES = 20;

const zGiveawayTemplate = z.strictObject({
  channel_id: zSnowflake.optional(),
  // Same validator as the top-level embed_color field (backend/src/types.ts) — a decimal or hex (0x...) number.
  embed_color: z.number().int().min(0).max(0xffffff).optional(),
  bypass_roles: z.array(zSnowflake).max(MAX_ROLES_PER_LIST).default([]),
  blacklisted_roles: z.array(zSnowflake).max(MAX_ROLES_PER_LIST).default([]),
  extra_entries: zBoundedRecord(z.record(zSnowflake, z.number().int().min(1).max(100)), 0, MAX_EXTRA_ENTRY_ROLES).default({}),
  // How long a winner has to click "Claim Prize" before they're automatically rerolled. Unset means no claim
  // requirement at all — the giveaway behaves exactly as before this was added.
  claim_time: zDelayString.optional(),
});

export const zGiveawaysConfig = z.strictObject({
  // The whole permission model for this plugin: a member managing giveaways (via chat commands or the
  // dashboard) just needs one of these role IDs — no level/override machinery like every other plugin, since
  // this same list is also checked from the API process for the dashboard's Giveaways page, which has no way
  // to evaluate a guild's full config-override tree. Empty by default: nobody can manage giveaways until a
  // server explicitly sets this.
  manager_roles: z.array(zSnowflake).max(MAX_ROLES_PER_LIST).default([]),
  // A role that marks someone as a "giveaway contributor" (e.g. a staff member/partner who's allowed to donate
  // or help source prizes) — purely a role ID this plugin hands off to Discord's own role-grant API on the
  // dashboard's "Giveaway contributor" card (see api/guilds/giveaways.ts); this plugin doesn't otherwise check
  // or care who holds it. Null (default) means the card is unavailable — nothing to grant/revoke.
  contributor_role_id: zSnowflake.nullable().default(null),
  // A role to grant alongside a giveaway ban (see functions/giveawayBans.ts) — purely cosmetic/optional, same
  // idea as contributor_role_id above. The ban itself is tracked independently in the giveaway_bans table
  // (GuildGiveawayBans) regardless of whether this is set, since enforcement (blocking entry, rerolling an
  // unclaimed win — see events/giveawayButtonInteraction.ts) can't depend on an optional role existing.
  ban_role_id: zSnowflake.nullable().default(null),
  templates: zBoundedRecord(z.record(zBoundedCharacters(1, 100), zGiveawayTemplate), 0, MAX_TEMPLATES).default({}),
  // Which Counters-plugin counter "activity points" requirements check — same idea as Economy's own
  // counter_name (default "coins"): there's no fixed/guaranteed counter name for this concept, so it's a
  // guild-wide setting here instead of asking staff to type it in on every giveaway.
  activity_counter_name: zBoundedCharacters(1, 100).default("activity"),
});

export interface GiveawaysPluginType extends BasePluginType {
  configSchema: typeof zGiveawaysConfig;
  state: {
    common: pluginUtils.PluginPublicInterface<typeof CommonPlugin>;
    giveaways: GuildGiveaways;
    unregisterGuildEventListeners?: Array<() => void>;
  };
}

import { guildPlugin } from "vety";
import { GuildGiveaways } from "../../data/GuildGiveaways.js";
import { onGuildEvent } from "../../data/GuildEvents.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { GiveawayCancelCmd } from "./commands/GiveawayCancelCmd.js";
import { GiveawayDashboardCmd } from "./commands/GiveawayDashboardCmd.js";
import { GiveawayEndCmd } from "./commands/GiveawayEndCmd.js";
import { GiveawayListCmd } from "./commands/GiveawayListCmd.js";
import { GiveawayRerollCmd } from "./commands/GiveawayRerollCmd.js";
import { GiveawayStartCmd } from "./commands/GiveawayStartCmd.js";
import { onGiveawayButtonInteraction } from "./events/giveawayButtonInteraction.js";
import { processExpiredClaims } from "./functions/claimGiveaway.js";
import { finalizeGiveaway } from "./functions/finalizeGiveaway.js";
import { GiveawaysPluginType, zGiveawaysConfig } from "./types.js";

/**
 * Giveaways with a persistent "Enter" button and restart-proof end scheduling — see
 * data/loops/upcomingGiveawaysLoop.ts (mirrors the ScheduledPosts/Reminders "poll due-soon, setTimeout,
 * re-arm" pattern) and events/giveawayButtonInteraction.ts (a plain interactionCreate listener, re-attached
 * every plugin load, resolving all state fresh from the DB — no createMessageComponentCollector, which
 * wouldn't survive a restart).
 *
 * Permissions are deliberately not vety's usual can_manage-boolean-plus-overrides: `manager_roles` (see
 * types.ts) is a plain role ID list, checked the same way here and from the dashboard API
 * (backend/src/api/guilds/giveaways.ts), which has no way to evaluate a guild's full config-override tree.
 */
export const GiveawaysPlugin = guildPlugin<GiveawaysPluginType>()({
  name: "giveaways",

  configSchema: zGiveawaysConfig,

  // prettier-ignore
  messageCommands: [
    GiveawayStartCmd,
    GiveawayEndCmd,
    GiveawayRerollCmd,
    GiveawayCancelCmd,
    GiveawayListCmd,
    GiveawayDashboardCmd,
  ],

  events: [onGiveawayButtonInteraction],

  beforeLoad(pluginData) {
    pluginData.state.giveaways = GuildGiveaways.getGuildInstance(pluginData.guild.id);
  },

  beforeStart(pluginData) {
    pluginData.state.common = pluginData.getPlugin(CommonPlugin);
  },

  afterLoad(pluginData) {
    const { state, guild } = pluginData;

    state.unregisterGuildEventListeners = [
      onGuildEvent(guild.id, "giveawayEnd", (giveaway) => {
        finalizeGiveaway(giveaway.id, { cancelled: false }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[GIVEAWAYS] Failed to finalize giveaway ${giveaway.id}:`, err);
        });
      }),
      onGuildEvent(guild.id, "giveawayClaimExpired", (giveaway) => {
        processExpiredClaims(giveaway.id).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[GIVEAWAYS] Failed to process expired claims for giveaway ${giveaway.id}:`, err);
        });
      }),
    ];
  },

  beforeUnload(pluginData) {
    pluginData.state.unregisterGuildEventListeners?.forEach((unregister) => unregister());
  },
});

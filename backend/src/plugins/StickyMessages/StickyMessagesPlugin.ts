import { guildPlugin } from "vety";
import { GuildStickyMessages } from "../../data/GuildStickyMessages.js";
import { convertDelayStringToMS } from "../../utils.js";
import { checkStickyMessage } from "./functions/checkStickyMessage.js";
import { StickyMessagesPluginType, zStickyMessagesConfig } from "./types.js";

/**
 * Keeps a configured message "stuck" to the bottom of a channel: on a per-entry interval, checks whether anything
 * new has been posted in the channel since we last sent the sticky message there, and if so, deletes the old one
 * and re-sends it. The currently-posted message ID is persisted in the DB (see GuildStickyMessages) so this
 * survives bot restarts and config reloads without re-posting unnecessarily.
 */
export const StickyMessagesPlugin = guildPlugin<StickyMessagesPluginType>()({
  name: "sticky_messages",

  configSchema: zStickyMessagesConfig,

  beforeLoad(pluginData) {
    const { state, guild } = pluginData;

    state.stickyMessages = new GuildStickyMessages(guild.id);
  },

  async afterLoad(pluginData) {
    const { state } = pluginData;
    const config = pluginData.config.get();

    await state.stickyMessages.deleteUnused(Object.keys(config.messages));

    state.checkTimers = [];
    for (const [name, stickyConfig] of Object.entries(config.messages)) {
      const intervalMs = convertDelayStringToMS(stickyConfig.check_interval);
      if (!intervalMs) {
        continue;
      }

      // Run an initial check right away so the sticky message appears/updates immediately on load or config reload,
      // rather than waiting out the first interval
      checkStickyMessage(pluginData, name, stickyConfig);

      state.checkTimers.push(
        setInterval(() => {
          checkStickyMessage(pluginData, name, stickyConfig);
        }, intervalMs),
      );
    }
  },

  beforeUnload(pluginData) {
    const { state } = pluginData;

    if (state.checkTimers) {
      for (const timer of state.checkTimers) {
        clearInterval(timer);
      }
    }
  },
});

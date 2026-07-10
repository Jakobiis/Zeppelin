import { guildPlugin } from "vety";
import { GuildAfkStatuses } from "../../data/GuildAfkStatuses.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { AfkCmd } from "./commands/AfkCmd.js";
import { CheckAfkMentionsEvt } from "./events/CheckAfkMentionsEvt.js";
import { AFKPluginType, zAfkConfig } from "./types.js";

export const AFKPlugin = guildPlugin<AFKPluginType>()({
  name: "afk",

  dependencies: () => [CommonPlugin],
  configSchema: zAfkConfig,
  defaultOverrides: [
    {
      level: ">=0",
      config: {
        can_use: true,
      },
    },
  ],

  // prettier-ignore
  messageCommands: [
    AfkCmd,
  ],

  // prettier-ignore
  events: [
    CheckAfkMentionsEvt,
  ],

  beforeLoad(pluginData) {
    const { state, guild } = pluginData;

    state.afk = GuildAfkStatuses.getGuildInstance(guild.id);
  },

  beforeStart(pluginData) {
    pluginData.state.common = pluginData.getPlugin(CommonPlugin);
  },
});

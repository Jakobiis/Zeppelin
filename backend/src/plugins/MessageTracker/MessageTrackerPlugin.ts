import { guildPlugin } from "vety";
import { GuildMessageTrackerCounts } from "../../data/GuildMessageTrackerCounts.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { MessagesCmd } from "./commands/MessagesCmd.js";
import { MessagesLeaderboardCmd } from "./commands/MessagesLeaderboardCmd.js";
import { MessagesSetCmd } from "./commands/MessagesSetCmd.js";
import { TrackMessageEvt } from "./events/TrackMessageEvt.js";
import { MessageTrackerPluginType, zMessageTrackerConfig } from "./types.js";

export const MessageTrackerPlugin = guildPlugin<MessageTrackerPluginType>()({
  name: "message_tracker",

  dependencies: () => [CommonPlugin],
  configSchema: zMessageTrackerConfig,

  // prettier-ignore
  messageCommands: [
    MessagesCmd,
    MessagesLeaderboardCmd,
    MessagesSetCmd,
  ],

  // prettier-ignore
  events: [
    TrackMessageEvt,
  ],

  beforeLoad(pluginData) {
    const { state, guild } = pluginData;

    state.counts = GuildMessageTrackerCounts.getGuildInstance(guild.id);
  },

  beforeStart(pluginData) {
    pluginData.state.common = pluginData.getPlugin(CommonPlugin);
  },
});

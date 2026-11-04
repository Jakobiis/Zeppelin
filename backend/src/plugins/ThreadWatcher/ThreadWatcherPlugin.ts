import { AnyThreadChannel, ThreadAutoArchiveDuration } from "discord.js";
import { GuildPluginData, guildPlugin } from "vety";
import { noop } from "../../utils.js";
import { ThreadWatcherPluginType, threadWatcherEvt, zThreadWatcherConfig } from "./types.js";

const CHECK_INTERVAL = 60 * 60 * 1000;

async function keepAlive(thread: AnyThreadChannel) {
  if (thread.archived) {
    await thread.setArchived(false, "Thread watcher").catch(noop);
  }
  // Longest Discord allows, so we have to step in as rarely as possible
  if (thread.autoArchiveDuration !== ThreadAutoArchiveDuration.OneWeek) {
    await thread.setAutoArchiveDuration(ThreadAutoArchiveDuration.OneWeek, "Thread watcher").catch(noop);
  }
}

async function checkAll(pluginData: GuildPluginData<ThreadWatcherPluginType>) {
  for (const id of pluginData.config.get().threads) {
    // fetch() also finds archived threads, which aren't in the cache
    const thread = await pluginData.guild.channels.fetch(id).catch(() => null);
    if (thread?.isThread()) {
      await keepAlive(thread);
    }
  }
}

const UnarchiveWatchedThreadEvt = threadWatcherEvt({
  event: "threadUpdate",
  async listener({ pluginData, args: { newThread } }) {
    if (newThread.archived && pluginData.config.get().threads.includes(newThread.id)) {
      await keepAlive(newThread);
    }
  },
});

export const ThreadWatcherPlugin = guildPlugin<ThreadWatcherPluginType>()({
  name: "thread_watcher",
  configSchema: zThreadWatcherConfig,

  // prettier-ignore
  events: [
    UnarchiveWatchedThreadEvt,
  ],

  afterLoad(pluginData) {
    checkAll(pluginData);
    pluginData.state.checkTimer = setInterval(() => checkAll(pluginData), CHECK_INTERVAL);
  },

  beforeUnload(pluginData) {
    clearInterval(pluginData.state.checkTimer);
  },
});

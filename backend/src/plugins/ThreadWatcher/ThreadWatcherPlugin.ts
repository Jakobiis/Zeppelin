import { AnyThreadChannel, ThreadAutoArchiveDuration } from "discord.js";
import { GuildPluginData, guildPlugin } from "vety";
import { noop } from "../../utils.js";
import { ThreadWatcherPluginType, threadWatcherEvt, zThreadWatcherConfig } from "./types.js";

const CHECK_INTERVAL = 60 * 60 * 1000;
const THREAD_MEMBER_PAGE = 100;

async function keepAlive(thread: AnyThreadChannel) {
  if (thread.archived) {
    await thread.setArchived(false, "Thread watcher").catch(noop);
  }
  // Longest Discord allows, so we have to step in as rarely as possible
  if (thread.autoArchiveDuration !== ThreadAutoArchiveDuration.OneWeek) {
    await thread.setAutoArchiveDuration(ThreadAutoArchiveDuration.OneWeek, "Thread watcher").catch(noop);
  }
}

async function fetchThread(pluginData: GuildPluginData<ThreadWatcherPluginType>, id: string) {
  // fetch() also finds archived threads, which aren't in the cache
  const channel = await pluginData.guild.channels.fetch(id).catch(() => null);
  return channel?.isThread() ? channel : null;
}

async function checkAll(pluginData: GuildPluginData<ThreadWatcherPluginType>) {
  for (const id of Object.keys(pluginData.config.get().threads)) {
    const thread = await fetchThread(pluginData, id);
    if (thread) await keepAlive(thread);
  }
}

/**
 * Adds every member who has one of a watched thread's roles but isn't in the thread yet.
 * Runs on load (i.e. on startup and every config change), which also covers role changes missed while offline.
 */
async function backfillAll(pluginData: GuildPluginData<ThreadWatcherPluginType>) {
  const entries = Object.entries(pluginData.config.get().threads).filter(([, t]) => t.roles.length);
  if (!entries.length) return;

  const members = await pluginData.guild.members.fetch().catch(() => null);
  if (!members) return;

  for (const [id, { roles }] of entries) {
    const thread = await fetchThread(pluginData, id);
    if (!thread) continue;
    await keepAlive(thread); // can't add members to an archived thread

    const inThread = new Set<string>();
    let after: string | undefined;
    for (;;) {
      // Discord only paginates thread members when with_member is set
      const page = await thread.members
        .fetch({ withMember: true, after, limit: THREAD_MEMBER_PAGE, cache: false })
        .catch(() => null);
      if (!page) break;
      for (const userId of page.keys()) inThread.add(userId);
      if (page.size < THREAD_MEMBER_PAGE) break;
      after = page.lastKey();
    }

    for (const member of members.values()) {
      if (member.user.bot || inThread.has(member.id)) continue;
      if (roles.some((r) => member.roles.cache.has(r))) {
        // ponytail: sequential adds, discord.js queues for rate limits; big roles (1000s) take a while
        await thread.members.add(member.id, "Thread watcher").catch(noop);
      }
    }
  }
}

const UnarchiveWatchedThreadEvt = threadWatcherEvt({
  event: "threadUpdate",
  async listener({ pluginData, args: { newThread } }) {
    if (newThread.archived && pluginData.config.get().threads[newThread.id]) {
      await keepAlive(newThread);
    }
  },
});

const AddRoleMembersToThreadsEvt = threadWatcherEvt({
  event: "guildMemberUpdate",
  async listener({ pluginData, args: { oldMember, newMember } }) {
    if (newMember.user.bot) return;
    // If oldMember wasn't cached, every role counts as new; adding someone already in the thread is a no-op
    const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    if (!addedRoles.size) return;

    for (const [id, { roles }] of Object.entries(pluginData.config.get().threads)) {
      if (!roles.some((r) => addedRoles.has(r))) continue;
      const thread = await fetchThread(pluginData, id);
      if (!thread) continue;
      await keepAlive(thread);
      await thread.members.add(newMember.id, "Thread watcher").catch(noop);
    }
  },
});

export const ThreadWatcherPlugin = guildPlugin<ThreadWatcherPluginType>()({
  name: "thread_watcher",
  configSchema: zThreadWatcherConfig,

  // prettier-ignore
  events: [
    UnarchiveWatchedThreadEvt,
    AddRoleMembersToThreadsEvt,
  ],

  afterLoad(pluginData) {
    checkAll(pluginData).then(() => backfillAll(pluginData));
    pluginData.state.checkTimer = setInterval(() => checkAll(pluginData), CHECK_INTERVAL);
  },

  beforeUnload(pluginData) {
    clearInterval(pluginData.state.checkTimer);
  },
});

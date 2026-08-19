import { ChannelType, EmbedBuilder, MessageFlags, Snowflake, ThreadChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";
import { getOrFetchGuildMember } from "../../../utils/getOrFetchGuildMember.js";
import { buildGiveawayThreadActionRows } from "./buildGiveawayMessage.js";
import { GiveawaysPluginType } from "../types.js";

/**
 * Creates a private thread for one specific winner + the host, on demand from the "Claim Prize" button on the
 * winner announcement (still namespaced "giveawayThread" internally — see buildWinnerAnnouncementButtons). Each winner gets their own — they never share one, since prize coordination (shipping
 * address, account details, etc.) is winner-specific. Manager-role holders aren't added as thread members here —
 * a "manage giveaways" role is expected to already have Manage Threads on the channel, which is enough for its
 * holders to see/join the private thread. They do get a heads-up (see the silent role-ping message below), just
 * not a loud one.
 *
 * Opening this thread is the winner's entire "claim" action when the giveaway has a claim requirement — it
 * pauses their reroll deadline (see giveawayButtonInteraction.ts, which calls claimGiveaway.ts's
 * pauseClaimDeadline right after this succeeds). Actually confirming the prize was received is a separate,
 * host/holder-only step from inside the thread (see buildGiveawayThreadActionRows' "Confirm Claimed" button).
 */
export interface CreateGiveawayThreadResult {
  thread: ThreadChannel;
  // Set when the thread itself (and its member access) was created fine but the opening info message failed to
  // send — the caller still has a usable thread, just one worth surfacing this to the winner/host about instead
  // of silently swallowing (see the console.error right below where this is set).
  sendError: string | null;
}

export async function createGiveawayThread(pluginData: GuildPluginData<GiveawaysPluginType>, giveaway: Giveaway, winnerId: string): Promise<CreateGiveawayThreadResult> {
  // Private threads are a GuildText-only feature — Discord doesn't support them in announcement/forum/etc.
  // channels, so unlike the rest of this codebase's channel handling there's no broader "text-based" check here.
  const channel = pluginData.guild.channels.cache.get(giveaway.channel_id as Snowflake);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("The giveaway's channel no longer exists or doesn't support private threads");
  }

  const winnerMember = await getOrFetchGuildMember(pluginData.guild, winnerId);
  const winnerName = winnerMember?.displayName ?? winnerMember?.user.username ?? winnerId;

  const thread = await channel.threads.create({
    name: `${giveaway.prize} - ${winnerName}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Giveaway #${giveaway.id} winner thread for ${winnerId}`,
  });

  // Host + this one winner always get in explicitly so they're guaranteed access even if they don't otherwise
  // have Manage Threads on the channel. The holder (if this giveaway is staff-held) joins them, since they're
  // the one who'll actually be handing the prize over. Deduped — the host/holder/winner aren't guaranteed to be
  // distinct people (e.g. a host who also entered and won their own giveaway), and a duplicate ID in
  // allowed_mentions.users makes Discord reject the whole request with a 400 (Invalid Form Body).
  const memberIds = [...new Set(giveaway.holder_id ? [giveaway.host_id, giveaway.holder_id, winnerId] : [giveaway.host_id, winnerId])];
  for (const userId of memberIds) {
    await thread.members.add(userId).catch(() => null);
  }

  const pingMentions = memberIds.map((id) => `<@${id}>`).join(" ");
  const descriptionLines = [`This private thread is for sorting out **${giveaway.prize}**.`, `Host: <@${giveaway.host_id}>`];
  if (giveaway.holder_id) {
    descriptionLines.push(`Holder: <@${giveaway.holder_id}>`);
  }
  descriptionLines.push(`Winner: <@${winnerId}>`);

  // Embed titles are capped at 256 characters by Discord — prize names are allowed up to 512 (see the API/chat
  // command's own validation), so an uncapped title here could throw and, since this runs after the thread (and
  // its member adds) already exist, would otherwise surface as a misleading "couldn't create the thread" error
  // on a thread that in fact already exists.
  const infoEmbed = new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(`Giveaway thread — ${giveaway.prize}`.slice(0, 256))
    .setDescription(descriptionLines.join("\n"));

  // Best-effort: the thread itself (and who can access it) is already fully set up by this point, so a failure
  // sending its opening message shouldn't make the whole operation look like it failed to the caller — but it's
  // still surfaced back (see sendError) rather than only logged, since a silent failure here would otherwise
  // just look like a normal empty thread with no obvious explanation.
  let sendError: string | null = null;
  await thread
    .send({
      content: pingMentions,
      embeds: [infoEmbed],
      components: buildGiveawayThreadActionRows(giveaway.id, winnerId, giveaway.claim_time_ms != null),
      allowedMentions: { users: memberIds },
    })
    .catch((err) => {
      console.error(`[GIVEAWAYS] Failed to send opening message in thread ${thread.id}:`, err);
      sendError = err instanceof Error ? err.message : String(err);
    });

  // A separate, silent (MessageFlags.SuppressNotifications — the same thing as typing "@silent" in the client)
  // heads-up for the manager role(s), kept apart from the message above so it doesn't dampen the host/winner's
  // own ping, which should stay a normal, attention-grabbing notification. Silent still means visible: the
  // mention renders and stays in the thread for anyone who checks, it just doesn't push/toast anyone. Private
  // threads don't grant access from a mention either way (that's membership-only — see the comment above), so
  // this is purely a courtesy notice for a role that's expected to already have Manage Threads on the channel.
  const config = pluginData.config.get();
  if (config.manager_roles.length > 0) {
    await thread
      .send({
        content: config.manager_roles.map((roleId) => `<@&${roleId}>`).join(" "),
        allowedMentions: { roles: config.manager_roles },
        flags: MessageFlags.SuppressNotifications,
      })
      .catch(() => null);
  }

  return { thread, sendError };
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from "discord.js";
import { guildPluginEventListener } from "vety";
import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { GuildMessageTrackerCounts } from "../../../data/GuildMessageTrackerCounts.js";
import { buildCustomId } from "../../../utils/buildCustomId.js";
import { getCustomIdNamespace, parseCustomId } from "../../../utils/parseCustomId.js";
import { buildGiveawayButtons, buildGiveawayThreadActionRows } from "../functions/buildGiveawayMessage.js";
import { buildParticipantsEmbed } from "../functions/buildParticipantsEmbed.js";
import { checkEntryRequirements } from "../functions/checkEntryRequirements.js";
import { confirmWinnerClaimed, pauseClaimDeadline } from "../functions/claimGiveaway.js";
import { computeEntryWeight } from "../functions/computeEntryWeight.js";
import { getCoinsValueForUser, getNamedCounterValueForUser } from "../functions/counterRequirements.js";
import { editChannelMessage } from "../functions/discordRest.js";
import { isUserBannedFromGiveaways } from "../functions/giveawayBans.js";
import { createGiveawayThread } from "../functions/giveawayThread.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

const giveawayEntries = new GiveawayEntries();

const BUTTON_NAMESPACES = [
  "giveaway",
  "giveawayLeave",
  "giveawayParticipants",
  "giveawayThread",
  "giveawayThreadDelete",
  "giveawayThreadConfirmClaim",
];

// Restart-proof by construction: this listener is re-attached every time the plugin loads (every bot boot,
// same as every other guildPluginEventListener), and everything it needs — the giveaway row, the clicking
// member's current roles, their message counts — is looked up fresh from the DB/live guild state on every
// click, not from anything held in memory. See RoleButtons/events/buttonInteraction.ts for the same pattern.
export const onGiveawayButtonInteraction = guildPluginEventListener<GiveawaysPluginType>()({
  event: "interactionCreate",
  async listener({ pluginData, args }) {
    if (!args.interaction.isButton()) {
      return;
    }

    // Cheap namespace-only check first — every button click bot-wide reaches this listener, including ones from
    // features that don't use this codebase's JSON custom-id convention at all, and parseCustomId logs a debug
    // warning if it tries to JSON-parse one of those (see its comment).
    if (!BUTTON_NAMESPACES.includes(getCustomIdNamespace(args.interaction.customId))) {
      return;
    }

    const { namespace, data } = parseCustomId(args.interaction.customId);
    const giveawayId: number | undefined = data?.id;
    if (giveawayId == null) {
      return;
    }

    const giveaway = await pluginData.state.giveaways.find(giveawayId);
    if (!giveaway) {
      await args.interaction.reply({ ephemeral: true, content: "This giveaway no longer exists." }).catch(() => null);
      return;
    }

    const member = args.interaction.member as GuildMember;

    if (namespace === "giveawayParticipants") {
      const embed = await buildParticipantsEmbed(giveaway);
      await args.interaction.reply({ ephemeral: true, embeds: [embed] }).catch(() => null);
      return;
    }

    if (namespace === "giveawayLeave") {
      if (giveaway.status !== "running") {
        await args.interaction.reply({ ephemeral: true, content: "This giveaway has already ended." }).catch(() => null);
        return;
      }

      const existingEntry = await giveawayEntries.getForUser(giveaway.id, member.id);
      if (!existingEntry) {
        await args.interaction.reply({ ephemeral: true, content: "You're not entered in this giveaway." }).catch(() => null);
        return;
      }

      await giveawayEntries.remove(giveaway.id, member.id);
      await args.interaction.reply({ ephemeral: true, content: "You've left the giveaway." }).catch(() => null);

      // This click happened on the ephemeral "already entered" follow-up, not the giveaway's own message, so
      // the entry-count button on the public message needs a separate fetch-by-ID edit rather than
      // interaction.message.edit() (see the Enter path below, which *is* on that message).
      if (giveaway.message_id) {
        const newCount = await giveawayEntries.count(giveaway.id);
        await editChannelMessage(giveaway.channel_id, giveaway.message_id, {
          components: [buildGiveawayButtons(giveaway.id, newCount).toJSON()],
        }).catch(() => null);
      }
      return;
    }

    if (namespace === "giveawayThread") {
      // winner_ids is append-only history (see entity comment) — expired_winner_ids excludes anyone whose
      // claim window ran out and was rerolled, so they don't still count as a current winner here.
      const isCurrentWinner = giveaway.winner_ids.includes(member.id) && !giveaway.expired_winner_ids.includes(member.id);
      if (!isCurrentWinner) {
        await args.interaction.reply({ ephemeral: true, content: "Only a current winner of this giveaway can create their prize thread." }).catch(() => null);
        return;
      }

      // A confirmed claim (via "Confirm Claimed" — see winner_thread_closed_ids' entity comment) means the
      // handoff is done, full stop — unlike a thread that's merely missing for some other reason (checked
      // below, including a manager deleting it without ever confirming the claim), this doesn't get a
      // replacement.
      if (giveaway.winner_thread_closed_ids.includes(member.id)) {
        await args.interaction.reply({ ephemeral: true, content: "Your prize claim has already been confirmed — this giveaway's handoff is complete." }).catch(() => null);
        return;
      }

      let winnerThreadIds = giveaway.winner_thread_ids;
      const existingThreadId = winnerThreadIds[member.id];
      if (existingThreadId) {
        const existingThread = await pluginData.guild.channels.fetch(existingThreadId).catch(() => null);
        if (existingThread) {
          await args.interaction.reply({ ephemeral: true, content: `You already have a thread: <#${existingThreadId}>` }).catch(() => null);
          return;
        }
        // The recorded thread is gone for some other reason (manually deleted outside the bot, channel purge,
        // etc.) rather than a deliberate close (ruled out above) — drop the stale record instead of permanently
        // telling the winner they already have a thread that no longer exists, and fall through to create them
        // a new one below.
        winnerThreadIds = Object.fromEntries(Object.entries(winnerThreadIds).filter(([winnerId]) => winnerId !== member.id));
        await pluginData.state.giveaways.update(giveaway.id, { winner_thread_ids: winnerThreadIds });
      }

      await args.interaction.deferReply({ ephemeral: true }).catch(() => null);

      let thread;
      let sendError: string | null;
      try {
        ({ thread, sendError } = await createGiveawayThread(pluginData, giveaway, member.id));
      } catch (err) {
        console.error(`[GIVEAWAYS] Failed to create winner thread for giveaway ${giveaway.id}, winner ${member.id}:`, err);
        await args.interaction.editReply({ content: "Couldn't create the thread — the giveaway's channel may no longer exist or the bot may be missing permissions." }).catch(() => null);
        return;
      }

      await pluginData.state.giveaways.update(giveaway.id, {
        winner_thread_ids: { ...winnerThreadIds, [member.id]: thread.id },
      });
      // Opening the thread is the winner's whole claim action — pauses their reroll deadline (if this giveaway
      // has one) right here, well before the host/holder ever gets around to confirming the handoff itself.
      await pauseClaimDeadline(giveaway.id, member.id);

      const reply = sendError
        ? `Thread created: <#${thread.id}> — but I couldn't post the opening message in it (${sendError}).`
        : `Thread created: <#${thread.id}>`;
      await args.interaction.editReply({ content: reply }).catch(() => null);
      return;
    }

    if (namespace === "giveawayThreadConfirmClaim") {
      const winnerId: string | undefined = data?.winner;
      if (!winnerId) {
        return;
      }

      // Whoever's actually responsible for handing the prize over — not the general manager_roles list, which
      // is reserved for reviewing/deleting the thread afterward (see "giveawayThreadDelete" below).
      const isHostOrHolder = member.id === giveaway.host_id || (giveaway.holder_id != null && member.id === giveaway.holder_id);
      if (!isHostOrHolder) {
        await args.interaction.reply({ ephemeral: true, content: "Only the giveaway host or the person holding this prize can confirm the claim." }).catch(() => null);
        return;
      }

      const confirmed = await confirmWinnerClaimed(giveaway.id, winnerId);
      if (!confirmed) {
        await args.interaction.reply({ ephemeral: true, content: "This claim was already confirmed, or that user isn't a current winner here." }).catch(() => null);
        return;
      }

      await args.interaction.update({ components: buildGiveawayThreadActionRows(giveaway.id, winnerId, false) }).catch(() => null);
      await args.interaction.followUp({ ephemeral: true, content: `✅ Marked <@${winnerId}> as claimed.` }).catch(() => null);
      return;
    }

    if (namespace === "giveawayThreadDelete") {
      if (!hasGiveawayManagerRole(pluginData, member)) {
        await args.interaction.reply({ ephemeral: true, content: "Only giveaway managers can delete this thread." }).catch(() => null);
        return;
      }

      const winnerId: string | undefined = data?.winner;
      await args.interaction.reply({ ephemeral: true, content: "Deleting thread…" }).catch(() => null);

      if (winnerId) {
        const nextThreadIds = { ...giveaway.winner_thread_ids };
        delete nextThreadIds[winnerId];
        await pluginData.state.giveaways.update(giveaway.id, { winner_thread_ids: nextThreadIds }).catch(() => null);
      }

      const channel = args.interaction.channel;
      if (channel?.isThread()) {
        await channel.delete().catch(() => null);
      }
      return;
    }

    // namespace === "giveaway" (Enter button) from here on.

    if (giveaway.status !== "running") {
      await args.interaction.reply({ ephemeral: true, content: "This giveaway has already ended." }).catch(() => null);
      return;
    }

    const existingEntry = await giveawayEntries.getForUser(giveaway.id, member.id);
    if (existingEntry) {
      const leaveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🚪")
          .setLabel("Leave Giveaway")
          .setCustomId(buildCustomId("giveawayLeave", { id: giveaway.id })),
      );
      await args.interaction
        .reply({ ephemeral: true, content: "You've already entered this giveaway! 🎉", components: [leaveRow] })
        .catch(() => null);
      return;
    }

    if (await isUserBannedFromGiveaways(pluginData.guild.id, member.id)) {
      await args.interaction.reply({ ephemeral: true, content: "You're banned from entering giveaways in this server." }).catch(() => null);
      return;
    }

    const memberRoleIds = member.roles.cache.map((role) => role.id);

    const messageCounts = giveaway.message_requirement
      ? await GuildMessageTrackerCounts.getGuildInstance(pluginData.guild.id).getForUser(member.id)
      : null;

    const counterValue = giveaway.counter_requirement
      ? await getNamedCounterValueForUser(pluginData.guild.id, giveaway.counter_requirement.counter_name, member.id)
      : null;

    const coinsValue = giveaway.coins_requirement != null ? await getCoinsValueForUser(pluginData, member.id) : null;

    const check = checkEntryRequirements(giveaway, memberRoleIds, messageCounts, counterValue, coinsValue);
    if (!check.allowed) {
      await args.interaction.reply({ ephemeral: true, content: check.reason }).catch(() => null);
      return;
    }

    const weight = computeEntryWeight(giveaway.extra_entries, memberRoleIds);
    await giveawayEntries.add(giveaway.id, member.id, weight);

    await args.interaction
      .reply({ ephemeral: true, content: "You're in! Good luck! 🎉" })
      .catch(() => null);

    // The ephemeral reply above already used up this interaction's one response, so the button label is
    // updated with a separate, ordinary message edit rather than interaction.update().
    const newCount = await giveawayEntries.count(giveaway.id);
    await args.interaction.message.edit({ components: [buildGiveawayButtons(giveaway.id, newCount)] }).catch(() => null);
  },
});

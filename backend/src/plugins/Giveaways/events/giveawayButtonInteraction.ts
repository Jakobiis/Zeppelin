import { GuildMember } from "discord.js";
import { guildPluginEventListener } from "vety";
import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { GuildMessageTrackerCounts } from "../../../data/GuildMessageTrackerCounts.js";
import { parseCustomId } from "../../../utils/parseCustomId.js";
import { buildGiveawayButtons } from "../functions/buildGiveawayMessage.js";
import { buildParticipantsEmbed } from "../functions/buildParticipantsEmbed.js";
import { checkEntryRequirements } from "../functions/checkEntryRequirements.js";
import { markWinnerClaimed } from "../functions/claimGiveaway.js";
import { computeEntryWeight } from "../functions/computeEntryWeight.js";
import { getCoinsValueForUser, getNamedCounterValueForUser } from "../functions/counterRequirements.js";
import { createGiveawayThread } from "../functions/giveawayThread.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

const giveawayEntries = new GiveawayEntries();

const BUTTON_NAMESPACES = ["giveaway", "giveawayParticipants", "giveawayThread", "giveawayThreadDelete", "giveawayClaim"];

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

    const { namespace, data } = parseCustomId(args.interaction.customId);
    if (!BUTTON_NAMESPACES.includes(namespace)) {
      return;
    }

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

    if (namespace === "giveawayClaim") {
      const claimed = await markWinnerClaimed(giveawayId, member.id);
      if (claimed) {
        await args.interaction.reply({ ephemeral: true, content: "🎉 Claimed! Talk to the host to sort out your prize." }).catch(() => null);
      } else if (giveaway.claimed_winner_ids.includes(member.id)) {
        await args.interaction.reply({ ephemeral: true, content: "You've already claimed this prize." }).catch(() => null);
      } else if (giveaway.expired_winner_ids.includes(member.id)) {
        await args.interaction.reply({ ephemeral: true, content: "Your claim window already expired and you were rerolled." }).catch(() => null);
      } else {
        await args.interaction.reply({ ephemeral: true, content: "You don't have a prize to claim here." }).catch(() => null);
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

      const existingThreadId = giveaway.winner_thread_ids[member.id];
      if (existingThreadId) {
        await args.interaction.reply({ ephemeral: true, content: `You already have a thread: <#${existingThreadId}>` }).catch(() => null);
        return;
      }

      await args.interaction.deferReply({ ephemeral: true }).catch(() => null);

      let thread;
      try {
        thread = await createGiveawayThread(pluginData, giveaway, member.id);
      } catch (err) {
        await args.interaction.editReply({ content: "Couldn't create the thread — the giveaway's channel may no longer exist or the bot may be missing permissions." }).catch(() => null);
        return;
      }

      await pluginData.state.giveaways.update(giveaway.id, {
        winner_thread_ids: { ...giveaway.winner_thread_ids, [member.id]: thread.id },
      });
      await args.interaction.editReply({ content: `Thread created: <#${thread.id}>` }).catch(() => null);
      return;
    }

    if (namespace === "giveawayThreadDelete") {
      if (!hasGiveawayManagerRole(pluginData, member)) {
        await args.interaction.reply({ ephemeral: true, content: "Only giveaway managers can delete this thread." }).catch(() => null);
        return;
      }

      const winnerId: string | undefined = data?.winner;
      await args.interaction.reply({ ephemeral: true, content: "Deleting thread…" }).catch(() => null);

      if (winnerId && giveaway.winner_thread_ids[winnerId]) {
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
      await args.interaction.reply({ ephemeral: true, content: "You've already entered this giveaway! 🎉" }).catch(() => null);
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

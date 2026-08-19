import { GuildMember } from "discord.js";
import { guildPluginEventListener } from "vety";
import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { GuildMessageTrackerCounts } from "../../../data/GuildMessageTrackerCounts.js";
import { parseCustomId } from "../../../utils/parseCustomId.js";
import { buildGiveawayButtons } from "../functions/buildGiveawayMessage.js";
import { checkEntryRequirements } from "../functions/checkEntryRequirements.js";
import { computeEntryWeight } from "../functions/computeEntryWeight.js";
import { GiveawaysPluginType } from "../types.js";

const giveawayEntries = new GiveawayEntries();

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
    if (namespace !== "giveaway") {
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

    if (giveaway.status !== "running") {
      await args.interaction.reply({ ephemeral: true, content: "This giveaway has already ended." }).catch(() => null);
      return;
    }

    const member = args.interaction.member as GuildMember;
    const existingEntry = await giveawayEntries.getForUser(giveaway.id, member.id);
    if (existingEntry) {
      await args.interaction.reply({ ephemeral: true, content: "You've already entered this giveaway! 🎉" }).catch(() => null);
      return;
    }

    const memberRoleIds = member.roles.cache.map((role) => role.id);

    const messageCounts = giveaway.message_requirement
      ? await GuildMessageTrackerCounts.getGuildInstance(pluginData.guild.id).getForUser(member.id)
      : null;

    const check = checkEntryRequirements(giveaway, memberRoleIds, messageCounts);
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

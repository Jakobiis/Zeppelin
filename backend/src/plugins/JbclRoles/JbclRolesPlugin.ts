import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { GuildPluginData, guildPlugin } from "vety";
import { commandTypeHelpers as ct } from "../../commandTypes.js";
import { HOURS, resolveUser } from "../../utils.js";
import {
  JbclRoles,
  VERIFY_URL,
  checkQuickVerify,
  diffJbclRoles,
  fetchJbclAlts,
  fetchJbclRoles,
  formatVerifyLog,
} from "./functions/jbclRoles.js";
import { JbclRolesPluginType, jbclRolesEvt, jbclRolesMsgCmd, jbclRolesSlashCmd, zJbclRolesConfig } from "./types.js";

type PluginData = GuildPluginData<JbclRolesPluginType>;

const VERIFY_BUTTON_ID = "jbcl_verify";
const PANEL_REPOST_DELAY_MS = 5000;

function logErr(context: string) {
  // eslint-disable-next-line no-console
  return (err: unknown) => console.error(`[JBCL ROLES] ${context}:`, err);
}

async function syncMember(pluginData: PluginData, member: GuildMember, roles: JbclRoles) {
  const { add, remove } = diffJbclRoles(roles, pluginData.config.get().roles, member.roles.cache.keys());
  if (add.length) await member.roles.add(add, "JBCL role sync");
  if (remove.length) await member.roles.remove(remove, "JBCL role sync");
  return add.length + remove.length;
}

// ponytail: sequential full-guild pass; fine for tens of thousands of members, chunk/stagger if it gets slow
async function reconcile(pluginData: PluginData) {
  const members = await pluginData.guild.members.fetch();
  const humans = [...members.values()].filter((m) => !m.user.bot);
  const roles = await fetchJbclRoles(humans.map((m) => m.id));
  for (const member of humans) {
    await syncMember(pluginData, member, roles.get(member.id)!).catch(logErr(`Failed to sync ${member.id}`));
  }
}

/** Gives the verified role straight away if the user logged in on the website within 24h. */
async function quickVerify(pluginData: PluginData, member: GuildMember): Promise<"already" | "verified" | "website"> {
  const { verified_role, unverified_role, alt_log_channel } = pluginData.config.get();
  if (!verified_role) return "website";
  const dropUnverified = async () => {
    if (unverified_role && member.roles.cache.has(unverified_role)) {
      await member.roles.remove(unverified_role, "JBCL verification");
    }
  };
  if (member.roles.cache.has(verified_role)) {
    await dropUnverified();
    return "already";
  }

  const alts = await checkQuickVerify(member.id);
  if (!alts) return "website";

  await member.roles.add(verified_role, "JBCL verification (recent website login)");
  await dropUnverified();
  const logChannel = alt_log_channel ? pluginData.guild.channels.cache.get(alt_log_channel) : null;
  if (logChannel?.isTextBased()) {
    await logChannel
      .send({ content: formatVerifyLog(member.id, alts), allowedMentions: { parse: [] } })
      .catch(logErr("Failed to post verify log"));
  }
  return "verified";
}

async function handleVerifyInteraction(
  pluginData: PluginData,
  interaction: ButtonInteraction | ChatInputCommandInteraction,
) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const member = await pluginData.guild.members.fetch(interaction.user.id);
    const result = await quickVerify(pluginData, member);
    if (result === "already") {
      await interaction.editReply("You're already verified.");
    } else if (result === "verified") {
      await interaction.editReply("You're verified!");
    } else {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Verify on website").setURL(VERIFY_URL),
      );
      await interaction.editReply({ content: "Log in on the website to finish verifying:", components: [row] });
    }
  } catch (err) {
    logErr("Verify failed")(err);
    await interaction.editReply("Couldn't verify you right now, try again later.").catch(() => null);
  }
}

const SYNC_BUTTON_ID = "jbcl_sync_roles";

const PANELS = [
  {
    channelKey: "verify_channel",
    buttonId: VERIFY_BUTTON_ID,
    label: "Verify",
    content: "Click below to verify with your Jailbreak Changelogs account.",
  },
  {
    channelKey: "sync_roles_channel",
    buttonId: SYNC_BUTTON_ID,
    label: "Sync roles",
    content: "Click below to sync your Jailbreak Changelogs website roles.",
  },
] as const;
type Panel = (typeof PANELS)[number];

/** Keeps a button panel as the last message in its channel, replacing any older copies we posted. */
async function repostPanel(pluginData: PluginData, panel: Panel) {
  const channelId = pluginData.config.get()[panel.channelKey];
  const channel = channelId ? pluginData.guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased()) return;

  const botId = pluginData.client.user!.id;
  const isPanel = (m: { author: { id: string }; components: unknown[] }) =>
    m.author.id === botId && JSON.stringify(m.components).includes(panel.buttonId);

  const recent = await channel.messages.fetch({ limit: 50 });
  const newest = recent.first();
  if (newest && isPanel(newest)) return; // already at the bottom

  for (const m of recent.values()) {
    if (isPanel(m)) await m.delete().catch(() => null);
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel(panel.label).setCustomId(panel.buttonId),
  );
  await channel.send({ content: panel.content, components: [row] });
}

async function handleSyncInteraction(
  pluginData: PluginData,
  interaction: ButtonInteraction | ChatInputCommandInteraction,
) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const member = await pluginData.guild.members.fetch(interaction.user.id);
    const roles = await fetchJbclRoles([member.id]);
    const changed = await syncMember(pluginData, member, roles.get(member.id)!);
    await interaction.editReply(changed ? "Your roles have been synced." : "Your roles are already up to date.");
  } catch (err) {
    logErr("Role sync failed")(err);
    await interaction.editReply("Couldn't sync your roles right now, try again later.").catch(() => null);
  }
}

const OnJoinEvt = jbclRolesEvt({
  event: "guildMemberAdd",
  async listener({ pluginData, args: { member } }) {
    if (member.user.bot) return;
    fetchJbclRoles([member.id])
      .then((roles) => syncMember(pluginData, member, roles.get(member.id)!))
      .catch(logErr(`Join sync failed for ${member.id}`));
    quickVerify(pluginData, member).catch(logErr(`Auto-verify failed for ${member.id}`));
  },
});

const ButtonEvt = jbclRolesEvt({
  event: "interactionCreate",
  async listener({ pluginData, args: { interaction } }) {
    if (!interaction.isButton()) return;
    if (interaction.customId === VERIFY_BUTTON_ID) await handleVerifyInteraction(pluginData, interaction);
    if (interaction.customId === SYNC_BUTTON_ID) await handleSyncInteraction(pluginData, interaction);
  },
});

const PanelStickyEvt = jbclRolesEvt({
  event: "messageCreate",
  async listener({ pluginData, args: { message } }) {
    if (message.author.id === pluginData.client.user!.id) return;
    const config = pluginData.config.get();
    for (const panel of PANELS) {
      if (message.channelId !== config[panel.channelKey]) continue;
      clearTimeout(pluginData.state.panelTimers[panel.buttonId]);
      pluginData.state.panelTimers[panel.buttonId] = setTimeout(
        () => repostPanel(pluginData, panel).catch(logErr("Panel repost failed")),
        PANEL_REPOST_DELAY_MS,
      );
    }
  },
});

const SyncRolesSlashCmd = jbclRolesSlashCmd({
  name: "sync-roles",
  description: "Sync your Jailbreak Changelogs website roles",
  allowDms: false,
  signature: [],
  async run({ interaction, pluginData }) {
    await handleSyncInteraction(pluginData, interaction);
  },
});

const VerifySlashCmd = jbclRolesSlashCmd({
  name: "verify",
  description: "Verify through your Jailbreak Changelogs account",
  allowDms: false,
  signature: [],
  async run({ interaction, pluginData }) {
    await handleVerifyInteraction(pluginData, interaction);
  },
});

async function altsReply(userId: string): Promise<string> {
  try {
    const alts = await fetchJbclAlts(userId);
    const content = alts.length
      ? `**Possible alts of <@${userId}>** (\`${userId}\`):\n${alts.map((alt) => `- <@${alt.user_id}> (\`${alt.user_id}\`)`).join("\n")}`
      : `No linked accounts found for <@${userId}>.`;
    return content.slice(0, 2000);
  } catch (err) {
    logErr("Alts lookup failed")(err);
    return "Couldn't look up alts right now, try again later.";
  }
}

const AltsMsgCmd = jbclRolesMsgCmd({
  trigger: "alts",
  permission: "can_view_alts",
  description: "Show accounts the website links to a user",
  signature: { user: ct.string() },
  async run({ pluginData, message, args }) {
    const user = await resolveUser(pluginData.client, args.user, "JbclRoles:AltsMsgCmd");
    const content = user.id ? await altsReply(user.id) : "User not found.";
    await message.channel.send({ content, allowedMentions: { parse: [] } });
  },
});

export const JbclRolesPlugin = guildPlugin<JbclRolesPluginType>()({
  name: "jbcl_roles",

  configSchema: zJbclRolesConfig,

  events: [OnJoinEvt, ButtonEvt, PanelStickyEvt],
  slashCommands: [SyncRolesSlashCmd, VerifySlashCmd],
  messageCommands: [AltsMsgCmd],

  defaultOverrides: [
    {
      level: ">=50",
      config: { can_view_alts: true },
    },
  ],

  afterLoad(pluginData) {
    const run = () => reconcile(pluginData).catch(logErr("Reconcile failed"));
    void run(); // also serves as the initial backfill
    pluginData.state.reconcileInterval = setInterval(run, 12 * HOURS);
    pluginData.state.panelTimers = {};
    for (const panel of PANELS) repostPanel(pluginData, panel).catch(logErr("Panel post failed"));
  },

  beforeUnload(pluginData) {
    clearInterval(pluginData.state.reconcileInterval);
    Object.values(pluginData.state.panelTimers ?? {}).forEach(clearTimeout);
  },
});

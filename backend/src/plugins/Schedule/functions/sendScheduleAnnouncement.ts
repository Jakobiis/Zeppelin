import { PermissionsBitField, Snowflake, TextChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { TemplateParseError, TemplateSafeValueContainer, renderTemplate } from "../../../templateFormatter.js";
import { MessageContent, createChunkedMessage, renderRecursively, verboseChannelMention } from "../../../utils.js";
import { hasDiscordPermissions } from "../../../utils/hasDiscordPermissions.js";
import { LogsPlugin } from "../../Logs/LogsPlugin.js";
import { SchedulePluginType } from "../types.js";

/**
 * Shared by announceScheduleChange (fire/reverse) and announceScheduleReminder (recurring reminder while active) —
 * renders the given message with the given template values and sends it to the given channels.
 */
export async function sendScheduleAnnouncement(
  pluginData: GuildPluginData<SchedulePluginType>,
  name: string,
  kind: string,
  channels: string[],
  message: MessageContent,
  templateValues: TemplateSafeValueContainer,
) {
  const renderMessageText = (str: string) => renderTemplate(str, templateValues);

  let formatted: MessageContent;
  try {
    formatted =
      typeof message === "string"
        ? await renderMessageText(message)
        : ((await renderRecursively(message, renderMessageText)) as MessageContent);
  } catch (e) {
    if (e instanceof TemplateParseError) {
      pluginData.getPlugin(LogsPlugin).logBotAlert({
        body: `Error formatting ${kind} message for schedule \`${name}\`: ${e.message}`,
      });
      return;
    }
    throw e;
  }

  for (const channelId of channels) {
    const channel = pluginData.guild.channels.cache.get(channelId as Snowflake);
    if (!channel || !(channel instanceof TextChannel)) {
      continue;
    }

    if (
      !hasDiscordPermissions(
        channel.permissionsFor(pluginData.client.user!.id),
        PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.ViewChannel,
      )
    ) {
      pluginData.getPlugin(LogsPlugin).logBotAlert({
        body: `Missing permissions to send schedule \`${name}\` announcement in ${verboseChannelMention(channel)}`,
      });
      continue;
    }

    if (
      typeof formatted === "object" &&
      formatted.embeds &&
      formatted.embeds.length > 0 &&
      !hasDiscordPermissions(channel.permissionsFor(pluginData.client.user!.id), PermissionsBitField.Flags.EmbedLinks)
    ) {
      pluginData.getPlugin(LogsPlugin).logBotAlert({
        body: `Missing permissions to send schedule \`${name}\` announcement **with embeds** in ${verboseChannelMention(channel)}`,
      });
      continue;
    }

    try {
      if (typeof formatted === "string") {
        await createChunkedMessage(channel, formatted, { parse: [] });
      } else {
        await channel.send({
          ...formatted,
          allowedMentions: { parse: [] },
        });
      }
    } catch {
      pluginData.getPlugin(LogsPlugin).logBotAlert({
        body: `Failed to send schedule \`${name}\` announcement to ${verboseChannelMention(channel)}`,
      });
    }
  }
}

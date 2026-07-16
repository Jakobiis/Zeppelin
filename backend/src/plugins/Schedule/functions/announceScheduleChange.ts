import { PermissionsBitField, Snowflake, TextChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { TemplateParseError, TemplateSafeValueContainer, renderTemplate } from "../../../templateFormatter.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { MessageContent, createChunkedMessage, renderRecursively, verboseChannelMention } from "../../../utils.js";
import { hasDiscordPermissions } from "../../../utils/hasDiscordPermissions.js";
import { LogsPlugin } from "../../Logs/LogsPlugin.js";
import { ScheduleRuntimeState, SchedulePluginType, zScheduledMultiplier } from "../types.js";

type ScheduledMultiplier = z.infer<typeof zScheduledMultiplier>;

export async function announceScheduleChange(
  pluginData: GuildPluginData<SchedulePluginType>,
  name: string,
  entry: ScheduledMultiplier,
  active: boolean,
  runtime: ScheduleRuntimeState,
) {
  const message = active ? entry.announce?.fire_message : entry.announce?.reverse_message;
  const channels = entry.announce?.channels;
  if (!message || !channels?.length) {
    return;
  }

  const templateValues = new TemplateSafeValueContainer({
    schedule: name,
    multiplier: entry.multiplier,
    // Unix seconds — admin wraps it themselves as e.g. <t:{ends}:f> to get per-viewer local-time rendering
    ends: runtime.activeUntil != null ? Math.floor(runtime.activeUntil / 1000) : null,
    // random only — the humanized duration actually rolled for this window (e.g. "10m")
    duration: runtime.lastDurationMs != null ? humanizeDuration(runtime.lastDurationMs) : null,
  });
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
        body: `Error formatting ${active ? "fire" : "reverse"} message for schedule \`${name}\`: ${e.message}`,
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

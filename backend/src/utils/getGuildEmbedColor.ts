import { GuildPluginData } from "vety";

// The bot's informal "brand" color, already reused as a hardcoded literal across several plugins' embeds —
// used as the fallback when a guild hasn't set its own embed_color.
export const DEFAULT_EMBED_COLOR = 0x0159b2;

export function getGuildEmbedColor(pluginData: GuildPluginData<any>): number {
  return pluginData.fullConfig.embed_color ?? DEFAULT_EMBED_COLOR;
}

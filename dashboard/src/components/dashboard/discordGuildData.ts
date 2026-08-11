// Fetches + caches a guild's roles/channels/emojis for the role/channel/emoji picker fields. Cached per
// guildId+resource for the lifetime of the page load and de-duped so multiple picker fields on the same form
// (e.g. several role fields in one plugin's config) share one request instead of firing one each.
import { get } from "../../api";

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
}

export interface DiscordEmoji {
  id: string;
  name: string;
  animated: boolean;
}

const cache = new Map<string, Promise<any>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    cache.set(
      key,
      load().catch((err) => {
        cache.delete(key); // don't cache failures — allow a retry on next access
        throw err;
      }),
    );
  }
  return cache.get(key)!;
}

export function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  return cached(`roles:${guildId}`, () => get(`guilds/${guildId}/discord-data/roles`));
}

export function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  return cached(`channels:${guildId}`, () => get(`guilds/${guildId}/discord-data/channels`));
}

export function getGuildEmojis(guildId: string): Promise<DiscordEmoji[]> {
  return cached(`emojis:${guildId}`, () => get(`guilds/${guildId}/discord-data/emojis`));
}

// Discord channel type codes we care about labeling (discord-api-types ChannelType enum)
const CHANNEL_TYPE_LABELS: Record<number, string> = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  13: "stage",
  15: "forum",
};

export function channelTypeLabel(type: number): string {
  return CHANNEL_TYPE_LABELS[type] ?? `type ${type}`;
}

export function emojiMarkdown(emoji: DiscordEmoji): string {
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
}

export function emojiImageUrl(emoji: DiscordEmoji): string {
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=32`;
}

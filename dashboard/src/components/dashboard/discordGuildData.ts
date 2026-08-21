// Fetches + caches a guild's roles/channels/emojis for the role/channel/emoji picker fields. Cached per
// guildId+resource for the lifetime of the page load and de-duped so multiple picker fields on the same form
// (e.g. several role fields in one plugin's config) share one request instead of firing one each.
import { reactive } from "vue";
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
        cache.delete(key);
        throw err;
      }),
    );
  }
  return cache.get(key)!;
}

// id -> name, keyed "kind:guildId:id" — reactive so anything reading it via getCachedName (e.g. a collapsed
// override's summary line) re-renders once the name resolves, even though the fetch that resolves it was kicked
// off by an unrelated picker field elsewhere in the same form.
const resolvedNames = reactive<Record<string, string>>({});

function cacheNames(kind: "role" | "channel", guildId: string, items: { id: string; name: string }[]) {
  for (const item of items) {
    resolvedNames[`${kind}:${guildId}:${item.id}`] = item.name;
  }
}

// Synchronous best-effort name lookup for an already-fetched role/channel — returns null if that guild's list
// hasn't been fetched yet (or the id isn't in it), in which case the caller should fall back to showing the raw
// id instead of blocking on a fetch of its own.
export function getCachedName(kind: "role" | "channel", guildId: string, id: string): string | null {
  return resolvedNames[`${kind}:${guildId}:${id}`] ?? null;
}

export function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  return cached(`roles:${guildId}`, () =>
    get(`guilds/${guildId}/discord-data/roles`).then((data: DiscordRole[]) => {
      cacheNames("role", guildId, data);
      return data;
    }),
  );
}

export function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  return cached(`channels:${guildId}`, () =>
    get(`guilds/${guildId}/discord-data/channels`).then((data: DiscordChannel[]) => {
      cacheNames("channel", guildId, data);
      return data;
    }),
  );
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
  10: "announcement thread",
  11: "thread",
  12: "private thread",
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

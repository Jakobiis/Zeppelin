import { env } from "../../../env.js";

// Plain bot-token REST calls, deliberately not going through discord.js's gateway Client — this module is
// shared between the bot process (which has a live Client) and the API process (which doesn't, see
// backend/src/api/guilds/discordData.ts), so it can't depend on one being present.
const DISCORD_API_URL = "https://discord.com/api/v10";

async function discordBotRequest(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${DISCORD_API_URL}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord API error ${res.status}: ${body}`);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export function sendChannelMessage(channelId: string, payload: unknown): Promise<any> {
  return discordBotRequest(`channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function editChannelMessage(channelId: string, messageId: string, payload: unknown): Promise<any> {
  return discordBotRequest(`channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteChannel(channelId: string): Promise<void> {
  return discordBotRequest(`channels/${channelId}`, { method: "DELETE" }).then(() => undefined);
}

export function deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
  return discordBotRequest(`channels/${channelId}/messages/${messageId}`, { method: "DELETE" }).then(() => undefined);
}

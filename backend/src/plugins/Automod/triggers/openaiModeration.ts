import { z } from "zod";
import { env } from "../../../env.js";
import { zSnowflake } from "../../../utils.js";
import { automodTrigger } from "../helpers.js";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // keeps the re-upload under Discord's bot upload limit
const REQUEST_TIMEOUT_MS = 10_000;

interface MatchResultType {
  category: string;
  score: number;
}

interface FlaggedImage {
  name: string;
  data: Buffer;
  category: string;
  score: number;
}

async function moderateImage(
  url: string,
  name: string,
  contentType: string,
  categories: string[],
  threshold: number,
): Promise<FlaggedImage | null> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  // Download ourselves: the bytes are needed for the log anyway, since the CDN link dies once the message is deleted
  const imageRes = await fetch(url, { signal });
  if (!imageRes.ok) return null;
  const data = Buffer.from(await imageRes.arrayBuffer());

  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: `data:${contentType};base64,${data.toString("base64")}` } }],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI moderation request failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { results: Array<{ category_scores: Record<string, number> }> };
  const scores = body.results[0].category_scores;
  const [category, score] = categories
    .map((c) => [c, scores[c] ?? 0] as const)
    .reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  return score >= threshold ? { name, data, category, score } : null;
}

export const OpenAIModerationTrigger = automodTrigger<MatchResultType>()({
  configSchema: z.strictObject({
    channels: z.array(zSnowflake).default([]), // empty = all channels; threads count as their parent channel
    categories: z.array(z.string()).min(1).default(["sexual", "sexual/minors", "violence/graphic"]),
    threshold: z.number().min(0).max(1).default(0.9),
  }),

  async match({ pluginData, context, triggerConfig }) {
    if (!context.message || !env.OPENAI_API_KEY) return;

    if (triggerConfig.channels.length) {
      const channel = pluginData.guild.channels.cache.get(context.message.channel_id);
      const ids = [context.message.channel_id, channel?.isThread() ? channel.parentId : null];
      if (!ids.some((id) => id && triggerConfig.channels.includes(id))) return;
    }

    const images = (context.message.data.attachments ?? [])
      .filter((a) => a.contentType?.startsWith("image/") && a.size <= MAX_IMAGE_BYTES)
      .slice(0, MAX_IMAGES);
    if (!images.length) return;

    // ponytail: runs inside automod's per-guild queue, so each image-bearing message can delay
    // other automod checks by up to REQUEST_TIMEOUT_MS; prefetch outside the queue if that bites
    const results = await Promise.allSettled(
      images.map((a) =>
        moderateImage(a.url, a.name ?? "image.png", a.contentType!, triggerConfig.categories, triggerConfig.threshold),
      ),
    );
    for (const r of results) {
      if (r.status === "rejected") console.error(`[openai_moderation] ${r.reason}`);
    }

    const flagged = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    if (!flagged.length) return;

    const worst = flagged.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      files: flagged.map((f) => ({ name: f.name, data: f.data })),
      extra: { category: worst.category, score: worst.score },
    };
  },

  renderMatchInformation({ matchResult }) {
    const { category, score } = matchResult.extra;
    return `Image flagged by OpenAI moderation: \`${category}\` (${(score * 100).toFixed(1)}%)`;
  },
});

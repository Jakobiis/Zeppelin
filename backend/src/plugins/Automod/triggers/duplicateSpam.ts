import { z } from "zod";
import { SavedMessage } from "../../../data/entities/SavedMessage.js";
import { humanizeDurationShort } from "../../../humanizeDuration.js";
import { getBaseUrl } from "../../../pluginUtils.js";
import { convertDelayStringToMS, sorter, zDelayString } from "../../../utils.js";
import { RecentActionType } from "../constants.js";
import { findRecentSpam } from "../functions/findRecentSpam.js";
import { getMatchingRecentActions } from "../functions/getMatchingRecentActions.js";
import { getMessageSpamIdentifier } from "../functions/getSpamIdentifier.js";
import { automodTrigger } from "../helpers.js";

// Character trigram sets: repeating a phrase ("Ban prosionBan prosion...") yields nearly the same set as the phrase itself
export function trigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  if (normalized.length < 3) {
    if (normalized) result.add(normalized);
    return result;
  }
  for (let i = 0; i <= normalized.length - 3; i++) {
    result.add(normalized.slice(i, i + 3));
  }
  return result;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / (a.size + b.size - shared);
}

export const DuplicateSpamTrigger = automodTrigger<{ archiveId: string }>()({
  configSchema: z.strictObject({
    amount: z.number().int(),
    within: zDelayString,
    per_channel: z.boolean().nullable().default(false),
    similarity: z.number().min(0).max(1).default(0.8),
  }),

  async match({ pluginData, context, triggerConfig }) {
    const content = context.message?.data.content;
    if (!context.message || !content) {
      return;
    }

    const spamIdentifier = getMessageSpamIdentifier(context.message, Boolean(triggerConfig.per_channel));

    const recentSpam = findRecentSpam(pluginData, RecentActionType.DuplicateMessage, spamIdentifier);
    if (recentSpam) {
      if (recentSpam.archiveId) {
        await pluginData.state.archives.addSavedMessagesToArchive(
          recentSpam.archiveId,
          [context.message],
          pluginData.guild,
        );
      }
      return { silentClean: true, extra: { archiveId: "" } };
    }

    const within = convertDelayStringToMS(triggerConfig.within) ?? 0;
    const to = context.timestamp;
    const target = trigrams(content);
    const similarActions = getMatchingRecentActions(
      pluginData,
      RecentActionType.Message,
      spamIdentifier,
      to - within,
      to,
    ).filter((action) => {
      const otherContent = action.context.message?.data.content;
      return otherContent && similarity(target, trigrams(otherContent)) >= triggerConfig.similarity;
    });

    if (similarActions.length < triggerConfig.amount) {
      return;
    }

    const messages = similarActions
      .map((action) => action.context.message)
      .filter(Boolean)
      .sort(sorter("posted_at")) as SavedMessage[];
    const archiveId = await pluginData.state.archives.createFromSavedMessages(messages, pluginData.guild);

    pluginData.state.recentSpam.push({
      type: RecentActionType.DuplicateMessage,
      identifiers: [spamIdentifier],
      archiveId,
      timestamp: Date.now(),
    });

    return {
      extraContexts: similarActions.map((action) => action.context).filter((_context) => _context !== context),
      extra: { archiveId },
    };
  },

  renderMatchInformation({ pluginData, matchResult, triggerConfig }) {
    const archiveUrl = pluginData.state.archives.getUrl(getBaseUrl(pluginData), matchResult.extra.archiveId);
    const withinStr = humanizeDurationShort(convertDelayStringToMS(triggerConfig.within));
    return `Matched duplicate message spam (${triggerConfig.amount} similar in ${withinStr}): ${archiveUrl}`;
  },
});

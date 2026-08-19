import { logger } from "../logger.js";

const customIdFormat = /^([^:]+):\d+:(.*)$/;

/**
 * Cheap namespace extraction with no JSON parsing — every guildPluginEventListener for "interactionCreate" fires
 * on every button click bot-wide, including ones from features that don't use this codebase's
 * `namespace:timestamp:JSON` custom ID convention at all (e.g. Economy's tic-tac-toe minigame, which just
 * appends a raw cell index after its own timestamp and reads it back itself via its own collector — it was
 * never meant to go through parseCustomId). Call this first and bail out on a namespace that isn't yours, before
 * calling parseCustomId — which assumes the JSON convention and logs if a custom id merely happens to *look*
 * like it (e.g. "pvpBotTtt:<channelId>:<timestamp>:<cellIndex>" matches the regex up to the JSON part, since a
 * channel ID is numeric, but its trailing ":<cellIndex>" isn't valid JSON).
 */
export function getCustomIdNamespace(customId: string): string {
  return customId.match(customIdFormat)?.[1] ?? "";
}

export function parseCustomId(customId: string): { namespace: string; data: any } {
  const parts = customId.match(customIdFormat);
  if (!parts) {
    return {
      namespace: "",
      data: null,
    };
  }

  let parsedData: any;
  try {
    parsedData = JSON.parse(parts[2]);
  } catch (err) {
    logger.debug(`Error while parsing custom id data (custom id: ${customId}): ${String(err)}`);
    return {
      namespace: "",
      data: null,
    };
  }

  return {
    namespace: parts[1],
    // Skipping timestamp
    data: parsedData,
  };
}

import { GlobalPluginBlueprint, GuildPluginBlueprint } from "vety";
import { z } from "zod";
import { zSnowflake } from "./utils.js";

export const zZeppelinGuildConfig = z.strictObject({
  // From BaseConfig
  prefix: z
    .string()
    .optional()
    .describe("Command prefix for text commands (e.g. \"!\"). Leave unset to use the bot's default prefix."),
  // Default color for embeds the bot sends that don't specify their own color (e.g. log embeds) — a decimal or
  // hex (0x...) number, same format as any other embed "color" field
  embed_color: z
    .number()
    .int()
    .min(0)
    .max(0xffffff)
    .optional()
    .describe("Default color for embeds the bot sends that don't specify their own (e.g. log embeds). A decimal or hex (0x...) number, same as any Discord embed color field. Leave unset to use the bot's default color."),
  levels: z
    .record(zSnowflake, z.number())
    .optional()
    .describe(
      "Maps role or user IDs to a numeric permission level, used by plugin overrides' \"level\" criteria (e.g. \"level: >=50\") and by staff-only commands like ban. A member's level is the highest level among their own user ID and all of their roles' IDs, or 0 if none of those are listed here.",
    ),
  plugins: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Wrapper for the string type that indicates the text will be parsed as Markdown later
 */
export type TMarkdown = string;

export interface ZeppelinGuildPluginInfo {
  plugin: GuildPluginBlueprint<any, any>;
  docs: ZeppelinPluginDocs;
  autoload?: boolean;
}

export interface ZeppelinGlobalPluginInfo {
  plugin: GlobalPluginBlueprint<any, any>;
  docs: ZeppelinPluginDocs;
}

export type DocsPluginType = "stable" | "legacy" | "internal";

export interface ZeppelinPluginDocs {
  type: DocsPluginType;
  configSchema: z.ZodType;

  prettyName?: string;
  description?: TMarkdown;
  usageGuide?: TMarkdown;
  configurationGuide?: TMarkdown;
}

export interface CommandInfo {
  description?: TMarkdown;
  basicUsage?: TMarkdown;
  examples?: TMarkdown;
  usageGuide?: TMarkdown;
  parameterDescriptions?: {
    [key: string]: TMarkdown;
  };
  optionDescriptions?: {
    [key: string]: TMarkdown;
  };
}

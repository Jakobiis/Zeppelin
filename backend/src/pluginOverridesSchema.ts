import { z } from "zod";
import { deepPartial } from "./utils/zodDeepPartial.js";

// Extracted from exportSchemas.ts so both that offline script and the live plugin-config-schema API route build
// the exact same override shape — a plugin override is a set of match criteria (channel/role/level/etc, with
// recursive all/any/not composition) plus a `config` block that's a deep-partial of the plugin's normal config
// (only the keys being overridden need to be present).
export const basePluginOverrideCriteriaSchema = z.strictObject({
  channel: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .describe("Only apply this override in this channel (or one of these channels)"),
  category: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .describe("Only apply this override within this channel category"),
  level: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .describe('Only apply this override for this permission level, e.g. ">=50"'),
  user: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .describe("Only apply this override for this user ID (or one of these user IDs)"),
  role: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .describe("Only apply this override for users with this role (or one of these roles)"),
  thread: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .describe("Only apply this override within this specific thread"),
  is_thread: z
    .boolean()
    .nullable()
    .optional()
    .describe("Only apply within any thread (true), or only outside threads (false)"),
  thread_type: z
    .literal(["public", "private"])
    .nullable()
    .optional()
    .describe("Only apply within public or private threads specifically"),
  extra: z.any().optional().describe("Plugin-specific extra matching criteria — rarely needed"),
});

export const pluginOverrideCriteriaSchema = basePluginOverrideCriteriaSchema
  .extend({
    get zzz_dummy_property_do_not_use() {
      return pluginOverrideCriteriaSchema.optional();
    },
    get all() {
      return z
        .array(pluginOverrideCriteriaSchema)
        .optional()
        .describe("This override only applies if ALL of these criteria sets match");
    },
    get any() {
      return z
        .array(pluginOverrideCriteriaSchema)
        .optional()
        .describe("This override applies if ANY of these criteria sets match");
    },
    get not() {
      return pluginOverrideCriteriaSchema.optional().describe("This override only applies if this criteria set does NOT match");
    },
  })
  .meta({
    id: "overrideCriteria",
  });

const partialConfigs = new Map<any, z.ZodType>();
function getPartialConfig(configSchema: z.ZodType) {
  if (!partialConfigs.has(configSchema)) {
    partialConfigs.set(configSchema, deepPartial(configSchema));
  }
  return partialConfigs.get(configSchema)!;
}

export function buildOverrideSchema(configSchema: z.ZodType): z.ZodType {
  const partialConfig = getPartialConfig(configSchema);
  return pluginOverrideCriteriaSchema.extend({
    config: partialConfig,
  });
}

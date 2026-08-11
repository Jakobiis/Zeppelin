import fs from "node:fs";
import { z } from "zod";
import { availableGuildPlugins } from "./plugins/availablePlugins.js";
import { buildOverrideSchema } from "./pluginOverridesSchema.js";
import { zZeppelinGuildConfig } from "./types.js";

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Output path required");
  process.exit(1);
}

const pluginSchemaMap = availableGuildPlugins.reduce((map, pluginInfo) => {
  map[pluginInfo.plugin.name] = z.object({
    config: pluginInfo.docs.configSchema.optional(),
    overrides: z.array(buildOverrideSchema(pluginInfo.docs.configSchema)).optional(),
  });
  return map;
}, {});

const fullSchema = zZeppelinGuildConfig.omit({ plugins: true }).extend({
  plugins: z.strictObject(pluginSchemaMap).partial().optional(),
});

const jsonSchema = z.toJSONSchema(fullSchema, { io: "input", cycles: "ref" });

fs.writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2), { encoding: "utf8" });

process.exit(0);

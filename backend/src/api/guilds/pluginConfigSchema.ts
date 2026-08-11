import { ApiPermissions } from "@zeppelinbot/shared/apiPermissions.js";
import express, { Request, Response } from "express";
import yaml from "js-yaml";
import { z } from "zod";
import { validateGuildConfig } from "../../configValidator.js";
import { Configs } from "../../data/Configs.js";
import { availableGuildPlugins } from "../../plugins/availablePlugins.js";
import { buildOverrideSchema } from "../../pluginOverridesSchema.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import { requireGuildPermission } from "../permissions.js";
import { clientError, ok } from "../responses.js";

/**
 * Serves a single plugin's config (+ overrides) as JSON Schema + the guild's current value, and accepts writes
 * back — a structured alternative to hand-editing the whole guild's raw YAML for plugins the dashboard knows how
 * to render as a form. Storage is still the same YAML config document under the hood (this just reads/writes the
 * `plugins.<name>.config` / `plugins.<name>.overrides` keys of it) so it stays fully compatible with the existing
 * raw YAML editor.
 *
 * Pilot scope: any plugin's schema/value can technically be fetched here, but the dashboard frontend currently
 * only builds a form for `welcome_message` — everything else still goes through the YAML editor.
 */
export function initGuildPluginConfigSchemaAPI(router: express.Router) {
  const configs = new Configs();
  const pluginConfigRouter = express.Router();

  function findPlugin(pluginName: string) {
    return availableGuildPlugins.find((p) => p.plugin.name === pluginName) ?? null;
  }

  // config + overrides together, so the dashboard's generic form renderer can render both from one schema/value
  // pair without needing to know anything plugin-specific.
  function buildCombinedSchema(configSchema: z.ZodType) {
    return z.object({
      config: configSchema,
      overrides: z
        .array(buildOverrideSchema(configSchema))
        .default([])
        .describe(
          "Applies different config values for specific channels, categories, roles, permission levels, users, or threads. Each override's own config only needs to list the values it changes — everything else keeps using the base config above.",
        ),
    });
  }

  pluginConfigRouter.get(
    "/:guildId/config-schema/:pluginName",
    requireGuildPermission(ApiPermissions.ReadConfig),
    async (req: Request, res: Response) => {
      const pluginInfo = findPlugin(req.params.pluginName);
      if (!pluginInfo) {
        return clientError(res, "Unknown plugin");
      }

      const combinedSchema = buildCombinedSchema(pluginInfo.docs.configSchema);
      const schema = z.toJSONSchema(combinedSchema, { io: "input", cycles: "ref" });

      const currentConfig = await configs.getActiveByKey(`guild-${req.params.guildId}`);
      const parsedYaml = currentConfig ? loadYamlSafely(currentConfig.config) : {};
      const rawPluginEntry = parsedYaml?.plugins?.[req.params.pluginName] ?? {};

      const parseResult = combinedSchema.safeParse({
        config: rawPluginEntry.config ?? {},
        overrides: rawPluginEntry.overrides ?? [],
      });
      const value = parseResult.success ? parseResult.data : combinedSchema.parse({ config: {}, overrides: [] });

      res.json({ schema, value });
    },
  );

  pluginConfigRouter.post(
    "/:guildId/config-schema/:pluginName",
    requireGuildPermission(ApiPermissions.EditConfig),
    async (req: Request, res: Response) => {
      const pluginInfo = findPlugin(req.params.pluginName);
      if (!pluginInfo) {
        return clientError(res, "Unknown plugin");
      }

      const combinedSchema = buildCombinedSchema(pluginInfo.docs.configSchema);
      const parseResult = combinedSchema.safeParse(req.body.value);
      if (!parseResult.success) {
        return res.status(422).json({ errors: parseResult.error.issues.map((issue) => issue.message) });
      }

      const currentConfig = await configs.getActiveByKey(`guild-${req.params.guildId}`);
      const parsedYaml = currentConfig ? loadYamlSafely(currentConfig.config) : {};

      if (parsedYaml.plugins == null || typeof parsedYaml.plugins !== "object") {
        parsedYaml.plugins = {};
      }
      if (
        parsedYaml.plugins[req.params.pluginName] == null ||
        typeof parsedYaml.plugins[req.params.pluginName] !== "object"
      ) {
        parsedYaml.plugins[req.params.pluginName] = {};
      }

      // Only touches the config/overrides keys — any other sibling key on this plugin's entry (e.g.
      // replaceDefaultOverrides) is left untouched.
      parsedYaml.plugins[req.params.pluginName].config = parseResult.data.config;
      if (parseResult.data.overrides && parseResult.data.overrides.length > 0) {
        parsedYaml.plugins[req.params.pluginName].overrides = parseResult.data.overrides;
      } else {
        delete parsedYaml.plugins[req.params.pluginName].overrides;
      }

      // Re-validated as a full guild config (not just this plugin in isolation) since plugin configs can have
      // cross-plugin implications — same safety net the raw YAML editor's save path uses.
      const error = await validateGuildConfig(parsedYaml);
      if (error) {
        return res.status(422).json({ errors: [error] });
      }

      const newYamlString = yaml.dump(parsedYaml);
      await configs.saveNewRevision(`guild-${req.params.guildId}`, newYamlString, req.user!.userId);

      ok(res);
    },
  );

  router.use("/", pluginConfigRouter);
}

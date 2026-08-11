import { ApiPermissions } from "@zeppelinbot/shared/apiPermissions.js";
import express, { Request, Response } from "express";
import yaml from "js-yaml";
import { z } from "zod";
import { validateGuildConfig } from "../../configValidator.js";
import { Configs } from "../../data/Configs.js";
import { availableGuildPlugins } from "../../plugins/availablePlugins.js";
import { loadYamlSafely } from "../../utils/loadYamlSafely.js";
import { requireGuildPermission } from "../permissions.js";
import { clientError, ok } from "../responses.js";

/**
 * Serves a single plugin's config as JSON Schema + the guild's current value for that plugin, and accepts writes
 * back — a structured alternative to hand-editing the whole guild's raw YAML for plugins the dashboard knows how
 * to render as a form. Storage is still the same YAML config document under the hood (this just reads/writes one
 * `plugins.<name>.config` key of it) so it stays fully compatible with the existing raw YAML editor.
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

  pluginConfigRouter.get(
    "/:guildId/config-schema/:pluginName",
    requireGuildPermission(ApiPermissions.ReadConfig),
    async (req: Request, res: Response) => {
      const pluginInfo = findPlugin(req.params.pluginName);
      if (!pluginInfo) {
        return clientError(res, "Unknown plugin");
      }

      const schema = z.toJSONSchema(pluginInfo.docs.configSchema, { io: "input", cycles: "ref" });

      const currentConfig = await configs.getActiveByKey(`guild-${req.params.guildId}`);
      const parsedYaml = currentConfig ? loadYamlSafely(currentConfig.config) : {};
      const rawPluginConfig = parsedYaml?.plugins?.[req.params.pluginName]?.config ?? {};

      const parseResult = pluginInfo.docs.configSchema.safeParse(rawPluginConfig);
      const value = parseResult.success ? parseResult.data : pluginInfo.docs.configSchema.parse({});

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

      const parseResult = pluginInfo.docs.configSchema.safeParse(req.body.value);
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
      parsedYaml.plugins[req.params.pluginName].config = parseResult.data;

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

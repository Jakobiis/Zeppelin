import { ApiPermissions } from "@zeppelinbot/shared/apiPermissions.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import { zZeppelinGuildConfig } from "../../types.js";
import { requireGuildPermission } from "../permissions.js";

/**
 * Serves the guild config's top-level, non-plugin fields (prefix, embed_color, levels) as JSON Schema, for the
 * dashboard's Interface tab to render a form for — same idea as pluginConfigSchema.ts's per-plugin schema, just
 * for the handful of fields that live outside `plugins`. Unlike that endpoint, this one only ever needs to hand
 * back the shape: the dashboard already has the full guild config loaded (for the raw YAML editor) and derives/
 * saves this value from/to that same document client-side, so there's no separate value-fetch or write route
 * here.
 */
export function initGuildGeneralConfigSchemaAPI(router: express.Router) {
  const generalConfigRouter = express.Router();

  // Same fields as zZeppelinGuildConfig, minus `plugins` — that key has its own dedicated schema/editor per
  // plugin and isn't meant to be edited as one big blob here.
  const generalConfigSchema = zZeppelinGuildConfig.omit({ plugins: true });

  generalConfigRouter.get(
    "/:guildId/general-config-schema",
    requireGuildPermission(ApiPermissions.ReadConfig),
    async (_req: Request, res: Response) => {
      const schema = z.toJSONSchema(generalConfigSchema, { io: "input" });
      res.json({ schema });
    },
  );

  router.use("/", generalConfigRouter);
}

import express from "express";
import { apiTokenAuthHandlers } from "../auth.js";
import { initGuildsImportExportAPI } from "./importExport.js";
import { initGuildsMiscAPI } from "./misc.js";
import { initGuildPluginConfigSchemaAPI } from "./pluginConfigSchema.js";

export function initGuildsAPI(router: express.Router) {
  const guildRouter = express.Router();
  guildRouter.use(...apiTokenAuthHandlers());

  initGuildsMiscAPI(guildRouter);
  initGuildsImportExportAPI(guildRouter);
  initGuildPluginConfigSchemaAPI(guildRouter);

  router.use("/guilds", guildRouter);
}

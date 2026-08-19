import express from "express";
import { apiTokenAuthHandlers } from "../auth.js";
import { initGuildDiscordDataAPI } from "./discordData.js";
import { initGuildEconomyAPI } from "./economy.js";
import { initGuildGeneralConfigSchemaAPI } from "./generalConfigSchema.js";
import { initGuildGiveawaysAPI } from "./giveaways.js";
import { initGuildsImportExportAPI } from "./importExport.js";
import { initGuildsMiscAPI } from "./misc.js";
import { initGuildPluginConfigSchemaAPI } from "./pluginConfigSchema.js";

export function initGuildsAPI(router: express.Router) {
  const guildRouter = express.Router();
  guildRouter.use(...apiTokenAuthHandlers());

  initGuildsMiscAPI(guildRouter);
  initGuildsImportExportAPI(guildRouter);
  initGuildPluginConfigSchemaAPI(guildRouter);
  initGuildGeneralConfigSchemaAPI(guildRouter);
  initGuildDiscordDataAPI(guildRouter);
  initGuildGiveawaysAPI(guildRouter);
  initGuildEconomyAPI(guildRouter);

  router.use("/guilds", guildRouter);
}

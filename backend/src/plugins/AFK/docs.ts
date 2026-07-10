import { ZeppelinPluginDocs } from "../../types.js";
import { zAfkConfig } from "./types.js";

export const afkPluginDocs: ZeppelinPluginDocs = {
  prettyName: "AFK",
  configSchema: zAfkConfig,
  type: "stable",
};

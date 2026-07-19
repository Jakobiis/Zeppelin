import { ZeppelinPluginDocs } from "../../types.js";
import { zStickyMessagesConfig } from "./types.js";

export const stickyMessagesPluginDocs: ZeppelinPluginDocs = {
  prettyName: "Sticky messages",
  configSchema: zStickyMessagesConfig,
  type: "stable",
};

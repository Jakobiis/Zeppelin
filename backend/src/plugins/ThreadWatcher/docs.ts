import { ZeppelinPluginDocs } from "../../types.js";
import { trimPluginDescription } from "../../utils.js";
import { zThreadWatcherConfig } from "./types.js";

export const threadWatcherPluginDocs: ZeppelinPluginDocs = {
  prettyName: "Thread watcher",
  type: "stable",
  configSchema: zThreadWatcherConfig,
  description: trimPluginDescription(`
    Keeps the listed threads from being auto-archived (hidden) by Discord.
    Whenever a watched thread is archived, it is unarchived right away.
    Watched threads are also re-checked on load and once an hour.

    Optionally, give a thread a list of roles: anyone who gets one of those roles is added to the thread,
    and everyone who already has one is added when the plugin loads.
  `),
  configurationGuide: trimPluginDescription(`
    ~~~yml
    thread_watcher:
      config:
        threads:
          "123456789012345678": {}  # just keep it from archiving
          "234567890123456789":
            roles: ["345678901234567890"]
    ~~~
  `),
};

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
  `),
  configurationGuide: trimPluginDescription(`
    ~~~yml
    thread_watcher:
      config:
        threads:
          - "123456789012345678"
          - "234567890123456789"
    ~~~
  `),
};

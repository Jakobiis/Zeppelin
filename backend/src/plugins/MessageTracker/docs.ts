import { ZeppelinPluginDocs } from "../../types.js";
import { zMessageTrackerConfig } from "./types.js";

export const messageTrackerPluginDocs: ZeppelinPluginDocs = {
  prettyName: "Message Tracker",
  configSchema: zMessageTrackerConfig,
  type: "stable",
  description:
    "Tracks how many messages each member sends (today, this week, this month, and all-time) and offers a leaderboard. Check your own (or someone else's) stats with `-messages`/`-m`, or see the leaderboard with `-messages leaderboard`/`-m lb` (add `today`/`week`/`month` to see a specific period instead of all-time).",
};

import { ZeppelinPluginDocs } from "../../types.js";
import { zGiveawaysConfig } from "./types.js";

export const giveawaysPluginDocs: ZeppelinPluginDocs = {
  prettyName: "Giveaways",
  configSchema: zGiveawaysConfig,
  type: "stable",
  description:
    "Run giveaways with a persistent \"Enter\" button (survives bot restarts) and optional entry requirements — required/bypass/blacklisted roles and a message-count minimum. Start one with `-giveaway start <duration> <prize> -winners <n> -channel #channel` (e.g. `-giveaway start 1d Nitro -winners 2`), end one early with `-giveaway end <id>`, reroll winners with `-giveaway reroll <id>`, cancel with `-giveaway cancel <id>`, and see active/recent giveaways with `-giveaway list`. Set `manager_roles` in this plugin's config to the role ID(s) allowed to manage giveaways — that's the entire permission model here, used both for these commands and for who can see the dashboard's Giveaways page. Configure reusable `templates` (channel, embed color, bypass/blacklisted roles, extra entries per role) and apply one with `-template <name>` when starting a giveaway.",
};

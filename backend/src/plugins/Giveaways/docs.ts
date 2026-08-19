import { ZeppelinPluginDocs } from "../../types.js";
import { zGiveawaysConfig } from "./types.js";

export const giveawaysPluginDocs: ZeppelinPluginDocs = {
  prettyName: "Giveaways",
  configSchema: zGiveawaysConfig,
  type: "stable",
  description:
    "Run giveaways with a persistent \"Enter\" button (survives bot restarts) and optional entry requirements — required/bypass/blacklisted roles, a message-count minimum (`-messages <period>:<count>`), a minimum value on any named Counters-plugin counter such as activity points (`-activity <counter name>:<count>`), and a minimum Economy coin balance (`-coins <count>`, read from whatever counter Economy is actually configured to use). Start one with `-giveaway start <duration> <prize> -winners <n> -channel #channel` (e.g. `-giveaway start 1d Nitro -winners 2`), end one early with `-giveaway end <id>`, cancel with `-giveaway cancel <id>`, and see active/recent giveaways with `-giveaway list`. Reroll winners with `-giveaway reroll <message id> [-amount n]` (default 1), where `<message id>` is the giveaway's own announcement message. Set `manager_roles` in this plugin's config to the role ID(s) allowed to manage giveaways — that's the entire permission model here, used both for these commands and for who can see the dashboard's Giveaways page. Configure reusable `templates` (channel, embed color, bypass/blacklisted roles, extra entries per role, claim time) and apply one with `-template <name>` when starting a giveaway, or name one `default` to have it apply automatically. Set `-claim <duration>` (or a template's `claim_time`) to require winners to click \"Claim Prize\" within that window or be automatically rerolled. Winners also get \"Create Thread\" (a private thread with just that winner, the host, and giveaway managers — each winner gets their own, they're never shared) and \"Participants\" (an ephemeral list of who's entered and how many entries they have) buttons.",
};

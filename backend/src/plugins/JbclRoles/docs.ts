import { ZeppelinPluginDocs } from "../../types.js";
import { zJbclRolesConfig } from "./types.js";

export const jbclRolesPluginDocs: ZeppelinPluginDocs = {
  type: "stable",
  prettyName: "JBCL roles",
  description:
    "Keeps Jailbreak Changelogs website roles (owner, value team, website moderator, premium tiers, early adopter) in sync. " +
    "Synced on join, on `/sync-roles` or the sticky Sync roles button in `sync_roles_channel`, when the website pushes a change, and every 12 hours. " +
    "Verification: members who logged in on the website within 24h are verified automatically on join, or by `/verify` " +
    "or the sticky Verify button in `verify_channel`; everyone else gets a link to the website. Verified members get " +
    "`verified_role` and possible alts are posted to `alt_log_channel`.",
  configSchema: zJbclRolesConfig,
};

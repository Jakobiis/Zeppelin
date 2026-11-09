import { BasePluginType, guildPluginEventListener, guildPluginSlashCommand } from "vety";
import { z } from "zod";
import { zSnowflake } from "../../utils.js";

// Read raw from YAML by the API's /jbcl/roles webhook too (api/jbclRoles.ts), so overrides don't apply to `roles`.
export const zJbclRolesConfig = z.strictObject({
  roles: z
    .strictObject({
      owner: zSnowflake.optional(),
      valueteam: zSnowflake.optional(),
      websitemoderator: zSnowflake.optional(),
      earlyadopter: zSnowflake.optional(),
      premium_1: zSnowflake.optional(),
      premium_2: zSnowflake.optional(),
      premium_3: zSnowflake.optional(),
    })
    .default({}),
  verified_role: zSnowflake.nullable().default(null),
  alt_log_channel: zSnowflake.nullable().default(null),
  // Channel kept with a sticky "Verify" button panel at the bottom
  verify_channel: zSnowflake.nullable().default(null),
  // Channel kept with a sticky "Sync roles" button panel at the bottom
  sync_roles_channel: zSnowflake.nullable().default(null),
  can_view_alts: z.boolean().default(false),
});

export interface JbclRolesPluginType extends BasePluginType {
  configSchema: typeof zJbclRolesConfig;
  state: {
    reconcileInterval?: NodeJS.Timeout;
    panelTimers: Record<string, NodeJS.Timeout>;
  };
}

export const jbclRolesEvt = guildPluginEventListener<JbclRolesPluginType>();
export const jbclRolesSlashCmd = guildPluginSlashCommand<JbclRolesPluginType>();

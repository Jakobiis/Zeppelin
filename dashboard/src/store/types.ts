import { ApiPermissions } from "@zeppelinbot/shared/apiPermissions.js";

export enum LoadStatus {
  None = 1,
  Loading,
  Done,
}

export type TimeoutType = ReturnType<typeof setTimeout>;
export type IntervalType = ReturnType<typeof setInterval>;

export interface AuthState {
  apiKey: string | null;
  loadedInitialAuth: boolean;
  authRefreshInterval: IntervalType | null;
  userId: string | null;
}

export interface GuildPermissionAssignment {
  type: string;
  target_id: string;
  permissions: Set<ApiPermissions>;
  expires_at: string | null;
}

export interface GiveawayApiItem {
  id: number;
  channel_id: string;
  message_id: string | null;
  host_id: string;
  prize: string;
  winner_count: number;
  ends_at: string;
  ended_at: string | null;
  status: "running" | "ended" | "cancelled";
  // Append-only full history (every reroll adds to it, never removes) — expired_winner_ids/claimed_winner_ids
  // are subsets of it. Filter those out of winner_ids for "who currently has the prize" display.
  winner_ids: string[];
  expired_winner_ids: string[];
  claimed_winner_ids: string[];
  entry_count: number;
}

export interface GiveawayTemplate {
  name: string;
  channel_id: string | null;
  embed_color: number | null;
  bypass_roles: string[];
  blacklisted_roles: string[];
  extra_entries: Record<string, number>;
}

export interface GiveawayMemberInfo {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface GiveawayAnalytics {
  totalGiveaways: number;
  claimedPrizes: number;
  totalEntries: number;
}

export interface GuildState {
  availableGuildsLoadStatus: LoadStatus;
  available: Map<
    string,
    {
      id: string;
      name: string;
      icon: string | null;
    }
  >;
  configs: {
    [key: string]: string;
  };
  guildPermissionAssignments: {
    [guildId: string]: GuildPermissionAssignment[];
  };
  giveawayAccess: {
    [guildId: string]: boolean;
  };
  giveawayAnalytics: {
    [guildId: string]: GiveawayAnalytics;
  };
  giveaways: {
    [guildId: string]: GiveawayApiItem[];
  };
  giveawayTemplates: {
    [guildId: string]: GiveawayTemplate[];
  };
  giveawayMemberNames: {
    [guildId: string]: { [userId: string]: GiveawayMemberInfo };
  };
}

export interface StaffState {
  isStaff: boolean;
}

export interface ThinDocsPlugin {
  name: string;
  info: {
    type?: string;
    prettyName?: string;
    description?: string;
    usageGuide?: string;
    configurationGuide?: string;
  };
}

export interface DocsPlugin extends ThinDocsPlugin {
  messageCommands: any[];
  slashCommands: any[];
  defaultOptions: any;
  configSchema?: string;
}

export interface DocsState {
  allPlugins: ThinDocsPlugin[];
  loadingAllPlugins: boolean;

  plugins: {
    [key: string]: DocsPlugin;
  };
}

export type RootState = {
  auth: AuthState;
  guilds: GuildState;
  docs: DocsState;
  staff: StaffState;
};

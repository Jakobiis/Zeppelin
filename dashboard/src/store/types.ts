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
  holder_id: string | null;
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
  claim_time: string | null;
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

export interface GiveawayTopHoster {
  hostId: string;
  count: number;
}

export interface GiveawayContributorStatus {
  userId: string;
  member: GiveawayMemberInfo | null;
  // False when no contributor_role_id is configured for this server — the card shows a "not set up" state
  // rather than an error.
  configured: boolean;
  hasRole: boolean;
}

export interface GiveawayBanStatus {
  userId: string;
  member: GiveawayMemberInfo | null;
  banned: boolean;
  reason: string | null;
  bannedAt: string | null;
  // null = permanent ban.
  expiresAt: string | null;
  // Whether ban_role_id is configured — unlike GiveawayContributorStatus's "configured", a ban can still be
  // applied/enforced with no role set (the role is purely an optional cosmetic add-on here), so this only
  // affects whether hasRole means anything.
  roleConfigured: boolean;
  hasRole: boolean;
}

export interface FinishedGiveawaysPage {
  items: GiveawayApiItem[];
  total: number;
  page: number;
  pageSize: number;
  // Echoes the search that produced this page — lets the component tell whether a still-in-flight request's
  // result belongs to the search box's *current* value or a since-superseded one (see loadFinishedGiveaways).
  search: string;
}

export interface EconomyMemberInfo {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface EconomyLeaderboardEntry {
  userId: string;
  balance: number;
  member: EconomyMemberInfo | null;
}

export interface EconomyLeaderboardPage {
  items: EconomyLeaderboardEntry[];
  total: number;
}

export interface EconomyActiveBoost {
  type: "coins" | "activity";
  boostKey: string;
  multiplier: number;
  expiresAt: string;
}

export interface EconomyUserInfo {
  userId: string;
  member: EconomyMemberInfo | null;
  balance: number;
  activeBoosts: EconomyActiveBoost[];
}

export interface EconomyHistoryEntry {
  id: number;
  user_id: string;
  game_name: string;
  game_type: string;
  outcome: string;
  bet_amount: number;
  amount_changed: number;
  balance_after: number;
  opponent_id: string | null;
  created_at: string;
}

export interface EconomyHistorySummary {
  totalEntries: number;
  totalWagered: number;
  net: number;
  totalWon: number;
  // Sum of every negative amount_changed — i.e. <= 0, not a positive magnitude.
  totalLost: number;
}

export interface EconomyTopGameEntry {
  gameName: string;
  plays: number;
  net: number;
}

export interface EconomyAnalytics extends EconomyHistorySummary {
  topGames: EconomyTopGameEntry[];
}

export interface EconomyUserHistoryPage {
  items: EconomyHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  summary: EconomyHistorySummary;
  members: { [userId: string]: EconomyMemberInfo };
}

export interface EconomyTransactionsPage {
  items: EconomyHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  members: { [userId: string]: EconomyMemberInfo };
}

export interface MessagesMemberInfo {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface MessageCounts {
  daily: number;
  weekly: number;
  monthly: number;
  allTime: number;
}

export interface MessagesUserInfo {
  userId: string;
  member: MessagesMemberInfo | null;
  counts: MessageCounts;
}

export interface MessagesTopEntry {
  userId: string;
  count: number;
  member: MessagesMemberInfo | null;
}

export interface MessagesTopChannelEntry {
  channelId: string;
  count: number;
  name: string | null;
  type: number | null;
}

export interface MessagesAnalytics {
  totalTrackedUsers: number;
  totalAllTimeMessages: number;
  totalToday: number;
  topToday: MessagesTopEntry[];
  topAllTime: MessagesTopEntry[];
  topChannelsToday: MessagesTopChannelEntry[];
}

export interface MessagesChannelStats {
  channelId: string;
  period: "daily" | "weekly" | "monthly" | "allTime";
  top: MessagesTopEntry[];
  name: string | null;
  type: number | null;
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
  giveawayTopHosters: {
    [guildId: string]: GiveawayTopHoster[];
  };
  giveaways: {
    [guildId: string]: GiveawayApiItem[];
  };
  finishedGiveaways: {
    [guildId: string]: FinishedGiveawaysPage;
  };
  giveawayTemplates: {
    [guildId: string]: GiveawayTemplate[];
  };
  giveawayMemberNames: {
    [guildId: string]: { [userId: string]: GiveawayMemberInfo };
  };
  economyAccess: {
    [guildId: string]: boolean;
  };
  economyLeaderboard: {
    [guildId: string]: EconomyLeaderboardPage;
  };
  economyAnalytics: {
    [guildId: string]: EconomyAnalytics;
  };
  economyUser: {
    [guildId: string]: EconomyUserInfo | null;
  };
  economyUserHistory: {
    [guildId: string]: EconomyUserHistoryPage | null;
  };
  economyTransactions: {
    [guildId: string]: EconomyTransactionsPage | null;
  };
  giveawayContributor: {
    [guildId: string]: GiveawayContributorStatus | null;
  };
  giveawayBan: {
    [guildId: string]: GiveawayBanStatus | null;
  };
  messagesAccess: {
    [guildId: string]: boolean;
  };
  messagesUser: {
    [guildId: string]: MessagesUserInfo | null;
  };
  messagesAnalytics: {
    [guildId: string]: MessagesAnalytics | null;
  };
  messagesChannelStats: {
    [guildId: string]: MessagesChannelStats | null;
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

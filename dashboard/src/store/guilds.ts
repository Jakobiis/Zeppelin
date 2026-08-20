import { Module } from "vuex";
import { get, post } from "../api";
import { GuildState, LoadStatus, RootState } from "./types";

export const GuildStore: Module<GuildState, RootState> = {
  namespaced: true,

  state: {
    availableGuildsLoadStatus: LoadStatus.None,
    available: new Map(),
    configs: {},
    guildPermissionAssignments: {},
    giveawayAccess: {},
    giveawayAnalytics: {},
    giveawayTopHosters: {},
    giveaways: {},
    finishedGiveaways: {},
    giveawayTemplates: {},
    giveawayMemberNames: {},
    economyAccess: {},
    economyLeaderboard: {},
    economyAnalytics: {},
    economyUser: {},
    economyUserHistory: {},
    economyTransactions: {},
    giveawayContributor: {},
    giveawayBan: {},
    messagesAccess: {},
    messagesUser: {},
    messagesAnalytics: {},
  },

  actions: {
    async loadAvailableGuilds({ dispatch, commit, state }) {
      if (state.availableGuildsLoadStatus !== LoadStatus.None) return;
      commit("setAvailableGuildsLoadStatus", LoadStatus.Loading);

      const availableGuilds = await get("guilds/available");
      for (const guild of availableGuilds) {
        commit("addGuild", guild);
      }

      commit("setAvailableGuildsLoadStatus", LoadStatus.Done);
    },

    async loadGuild({ commit, state }, guildId) {
      if (state.available.has(guildId)) {
        return;
      }

      const guild = await get(`guilds/${guildId}`);
      if (guild) {
        commit("addGuild", guild);
      }
    },

    async loadConfig({ commit }, guildId) {
      const result = await get(`guilds/${guildId}/config`);
      commit("setConfig", { guildId, config: result.config });
    },

    async saveConfig({ commit }, { guildId, config }) {
      await post(`guilds/${guildId}/config`, { config });
    },

    async loadMyPermissionAssignments({ commit }) {
      const myPermissionAssignments = await get(`guilds/my-permissions`);
      for (const permissionAssignment of myPermissionAssignments) {
        commit("setGuildPermissionAssignments", {
          guildId: permissionAssignment.guild_id,
          permissionAssignments: [permissionAssignment],
        });
      }
    },

    async loadGuildPermissionAssignments({ commit }, guildId) {
      const permissionAssignments = await get(`guilds/${guildId}/permissions`);
      commit("setGuildPermissionAssignments", { guildId, permissionAssignments });
    },

    async setTargetPermissions({ commit }, { guildId, targetId, type, permissions, expiresAt }) {
      await post(`guilds/${guildId}/set-target-permissions`, { guildId, targetId, type, permissions, expiresAt });
      commit("setTargetPermissions", { guildId, targetId, type, permissions, expiresAt });
    },

    async importData({ commit }, { guildId, data, caseHandlingMode }) {
      return post(`guilds/${guildId}/import`, {
        data,
        caseHandlingMode,
      });
    },

    async exportData({ commit }, { guildId }) {
      return post(`guilds/${guildId}/export`);
    },

    async loadGiveawayAccess({ commit }, guildId) {
      const result = await get(`guilds/${guildId}/giveaways/access`);
      commit("setGiveawayAccess", { guildId, isManager: result.isManager });
      return result.isManager;
    },

    async loadGiveaways({ commit }, guildId) {
      const giveaways = await get(`guilds/${guildId}/giveaways`);
      commit("setGiveaways", { guildId, giveaways });
    },

    // Separate from loadGiveaways (running only) — this is its own paginated/searchable request against the
    // guild's entire finished history, not just whatever's currently in state.
    async loadFinishedGiveaways({ commit }, { guildId, search, page, pageSize }) {
      const result = await get(`guilds/${guildId}/giveaways/finished`, { search: search || "", page, pageSize });
      commit("setFinishedGiveaways", { guildId, page: { ...result, search: search || "" } });
    },

    async loadGiveawayAnalytics({ commit }, guildId) {
      const analytics = await get(`guilds/${guildId}/giveaways/analytics`);
      commit("setGiveawayAnalytics", { guildId, analytics });
    },

    async loadGiveawayTopHosters({ commit }, guildId) {
      const topHosters = await get(`guilds/${guildId}/giveaways/top-hosters`);
      commit("setGiveawayTopHosters", { guildId, topHosters });
    },

    async endGiveaway({ dispatch }, { guildId, giveawayId }) {
      await post(`guilds/${guildId}/giveaways/${giveawayId}/end`);
      await dispatch("loadGiveaways", guildId);
      await dispatch("loadGiveawayAnalytics", guildId);
    },

    async rerollGiveaway({ dispatch }, { guildId, giveawayId, replaceWinnerIds }) {
      const result = await post(`guilds/${guildId}/giveaways/${giveawayId}/reroll`, { replaceWinnerIds });
      await dispatch("loadGiveaways", guildId);
      await dispatch("loadGiveawayAnalytics", guildId);
      return result;
    },

    async cancelGiveaway({ dispatch }, { guildId, giveawayId }) {
      await post(`guilds/${guildId}/giveaways/${giveawayId}/cancel`);
      await dispatch("loadGiveaways", guildId);
      await dispatch("loadGiveawayAnalytics", guildId);
    },

    async loadGiveawayTemplates({ commit }, guildId) {
      const templates = await get(`guilds/${guildId}/giveaways/templates`);
      commit("setGiveawayTemplates", { guildId, templates });
    },

    async createGiveaway({ dispatch }, { guildId, giveaway }) {
      await post(`guilds/${guildId}/giveaways`, giveaway);
      await dispatch("loadGiveaways", guildId);
      await dispatch("loadGiveawayAnalytics", guildId);
      await dispatch("loadGiveawayTopHosters", guildId);
    },

    async loadGiveawayMemberNames({ commit }, { guildId, ids }) {
      const uniqueIds = [...new Set(ids)];
      if (!uniqueIds.length) return;
      const members = await get(`guilds/${guildId}/giveaways/members`, { ids: uniqueIds.join(",") });
      commit("setGiveawayMemberNames", { guildId, members });
    },

    async loadEconomyAccess({ commit }, guildId) {
      const result = await get(`guilds/${guildId}/economy/access`);
      commit("setEconomyAccess", { guildId, isManager: result.isManager });
      return result.isManager;
    },

    async loadEconomyLeaderboard({ commit }, { guildId, limit, offset, search }) {
      const page = await get(`guilds/${guildId}/economy/leaderboard`, { limit, offset, search: search || "" });
      commit("setEconomyLeaderboard", { guildId, page });
    },

    // Resolves a typed ID or username/nickname into candidate members — doesn't touch shared state, the
    // component just wants the list back directly for its picker.
    lookupEconomyMembers(_ctx, { guildId, query }) {
      return get(`guilds/${guildId}/economy/lookup`, { query });
    },

    async loadEconomyUser({ commit }, { guildId, userId }) {
      const user = await get(`guilds/${guildId}/economy/user/${userId}`);
      commit("setEconomyUser", { guildId, user });
    },

    async loadEconomyUserHistory({ commit }, { guildId, userId, page, pageSize }) {
      const result = await get(`guilds/${guildId}/economy/user/${userId}/history`, { page, pageSize });
      commit("setEconomyUserHistory", { guildId, page: result });
    },

    async adjustEconomyBalance(_ctx, { guildId, userId, action, amount }) {
      const result = await post(`guilds/${guildId}/economy/user/${userId}/balance`, { action, amount });
      return result.balance;
    },

    async loadEconomyAnalytics({ commit }, guildId) {
      const analytics = await get(`guilds/${guildId}/economy/analytics`);
      commit("setEconomyAnalytics", { guildId, analytics });
    },

    async loadEconomyTransactions({ commit }, { guildId, page, pageSize }) {
      const result = await get(`guilds/${guildId}/economy/transactions`, { page, pageSize });
      commit("setEconomyTransactions", { guildId, page: result });
    },

    lookupGiveawayMembers(_ctx, { guildId, query }) {
      return get(`guilds/${guildId}/giveaways/lookup`, { query });
    },

    async loadGiveawayContributorStatus({ commit }, { guildId, userId }) {
      const status = await get(`guilds/${guildId}/giveaways/contributor/${userId}`);
      commit("setGiveawayContributor", { guildId, status: { userId, ...status } });
    },

    async setGiveawayContributorRole({ commit }, { guildId, userId, member, grant }) {
      const result = await post(`guilds/${guildId}/giveaways/contributor/${userId}`, { grant });
      commit("setGiveawayContributor", { guildId, status: { userId, member, configured: true, hasRole: result.hasRole } });
    },

    async loadGiveawayBanStatus({ commit }, { guildId, userId }) {
      const status = await get(`guilds/${guildId}/giveaways/ban/${userId}`);
      commit("setGiveawayBan", { guildId, status: { userId, ...status } });
    },

    // Returns the raw result (removedFromRunning/rerolledFromGiveawayIds on a ban) so the component can surface
    // it in a toast — loadGiveawayBanStatus is dispatched separately afterward to refresh the full card state.
    setGiveawayBanned(_ctx, { guildId, userId, ban, reason }) {
      return post(`guilds/${guildId}/giveaways/ban/${userId}`, { ban, reason });
    },

    async loadMessagesAccess({ commit }, guildId) {
      const result = await get(`guilds/${guildId}/messages/access`);
      commit("setMessagesAccess", { guildId, isManager: result.isManager });
      return result.isManager;
    },

    lookupMessagesMembers(_ctx, { guildId, query }) {
      return get(`guilds/${guildId}/messages/lookup`, { query });
    },

    async loadMessagesUser({ commit }, { guildId, userId }) {
      const user = await get(`guilds/${guildId}/messages/user/${userId}`);
      commit("setMessagesUser", { guildId, user });
    },

    async adjustMessagesCount(_ctx, { guildId, userId, action, amount, period, channelId }) {
      return post(`guilds/${guildId}/messages/user/${userId}`, { action, amount, period, channelId });
    },

    async loadMessagesAnalytics({ commit }, guildId) {
      const analytics = await get(`guilds/${guildId}/messages/analytics`);
      commit("setMessagesAnalytics", { guildId, analytics });
    },
  },

  mutations: {
    setAvailableGuildsLoadStatus(state: GuildState, status: LoadStatus) {
      state.availableGuildsLoadStatus = status;
    },

    addGuild(state: GuildState, guild) {
      state.available.set(guild.id, guild);
      state.available = state.available;
    },

    setConfig(state: GuildState, { guildId, config }) {
      state.configs[guildId] = config;
    },

    setGuildPermissionAssignments(state: GuildState, { guildId, permissionAssignments }) {
      if (!state.guildPermissionAssignments) {
        state.guildPermissionAssignments = {};
      }

      state.guildPermissionAssignments[guildId] = permissionAssignments.map((p) => ({
        ...p,
        permissions: new Set(p.permissions),
      }));
    },

    setTargetPermissions(state: GuildState, { guildId, targetId, type, permissions, expiresAt }) {
      const guildPermissionAssignments = state.guildPermissionAssignments[guildId] || [];
      if (permissions.length === 0) {
        // No permissions -> remove permission assignment
        guildPermissionAssignments.splice(
          guildPermissionAssignments.findIndex((p) => p.target_id === targetId && p.type === type),
          1,
        );
      } else {
        // Update/add permission assignment
        const itemToEdit = guildPermissionAssignments.find((p) => p.target_id === targetId && p.type === type);
        if (itemToEdit) {
          itemToEdit.permissions = new Set(permissions);
        } else {
          state.guildPermissionAssignments[guildId].push({
            type,
            target_id: targetId,
            permissions: new Set(permissions),
            expires_at: expiresAt,
          });
        }
      }

      state.guildPermissionAssignments = { ...state.guildPermissionAssignments };
    },

    setGiveawayAccess(state: GuildState, { guildId, isManager }) {
      state.giveawayAccess = { ...state.giveawayAccess, [guildId]: isManager };
    },

    setGiveawayAnalytics(state: GuildState, { guildId, analytics }) {
      state.giveawayAnalytics = { ...state.giveawayAnalytics, [guildId]: analytics };
    },

    setGiveawayTopHosters(state: GuildState, { guildId, topHosters }) {
      state.giveawayTopHosters = { ...state.giveawayTopHosters, [guildId]: topHosters };
    },

    setGiveaways(state: GuildState, { guildId, giveaways }) {
      state.giveaways = { ...state.giveaways, [guildId]: giveaways };
    },

    setFinishedGiveaways(state: GuildState, { guildId, page }) {
      state.finishedGiveaways = { ...state.finishedGiveaways, [guildId]: page };
    },

    setGiveawayTemplates(state: GuildState, { guildId, templates }) {
      state.giveawayTemplates = { ...state.giveawayTemplates, [guildId]: templates };
    },

    setGiveawayMemberNames(state: GuildState, { guildId, members }) {
      const existing = state.giveawayMemberNames[guildId] || {};
      const next = { ...existing };
      for (const member of members) {
        next[member.id] = member;
      }
      state.giveawayMemberNames = { ...state.giveawayMemberNames, [guildId]: next };
    },

    setEconomyAccess(state: GuildState, { guildId, isManager }) {
      state.economyAccess = { ...state.economyAccess, [guildId]: isManager };
    },

    setEconomyLeaderboard(state: GuildState, { guildId, page }) {
      state.economyLeaderboard = { ...state.economyLeaderboard, [guildId]: page };
    },

    setEconomyUser(state: GuildState, { guildId, user }) {
      state.economyUser = { ...state.economyUser, [guildId]: user };
    },

    setEconomyUserHistory(state: GuildState, { guildId, page }) {
      state.economyUserHistory = { ...state.economyUserHistory, [guildId]: page };
    },

    setEconomyAnalytics(state: GuildState, { guildId, analytics }) {
      state.economyAnalytics = { ...state.economyAnalytics, [guildId]: analytics };
    },

    setEconomyTransactions(state: GuildState, { guildId, page }) {
      state.economyTransactions = { ...state.economyTransactions, [guildId]: page };
    },

    setGiveawayContributor(state: GuildState, { guildId, status }) {
      state.giveawayContributor = { ...state.giveawayContributor, [guildId]: status };
    },

    setGiveawayBan(state: GuildState, { guildId, status }) {
      state.giveawayBan = { ...state.giveawayBan, [guildId]: status };
    },

    setMessagesAccess(state: GuildState, { guildId, isManager }) {
      state.messagesAccess = { ...state.messagesAccess, [guildId]: isManager };
    },

    setMessagesUser(state: GuildState, { guildId, user }) {
      state.messagesUser = { ...state.messagesUser, [guildId]: user };
    },

    setMessagesAnalytics(state: GuildState, { guildId, analytics }) {
      state.messagesAnalytics = { ...state.messagesAnalytics, [guildId]: analytics };
    },
  },
};

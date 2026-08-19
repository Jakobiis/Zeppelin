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
    giveaways: {},
    giveawayTemplates: {},
    giveawayMemberNames: {},
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

    async endGiveaway({ dispatch }, { guildId, giveawayId }) {
      await post(`guilds/${guildId}/giveaways/${giveawayId}/end`);
      await dispatch("loadGiveaways", guildId);
    },

    async rerollGiveaway({ dispatch }, { guildId, giveawayId, amount }) {
      const result = await post(`guilds/${guildId}/giveaways/${giveawayId}/reroll`, { amount });
      await dispatch("loadGiveaways", guildId);
      return result;
    },

    async cancelGiveaway({ dispatch }, { guildId, giveawayId }) {
      await post(`guilds/${guildId}/giveaways/${giveawayId}/cancel`);
      await dispatch("loadGiveaways", guildId);
    },

    async loadGiveawayTemplates({ commit }, guildId) {
      const templates = await get(`guilds/${guildId}/giveaways/templates`);
      commit("setGiveawayTemplates", { guildId, templates });
    },

    async createGiveaway({ dispatch }, { guildId, giveaway }) {
      await post(`guilds/${guildId}/giveaways`, giveaway);
      await dispatch("loadGiveaways", guildId);
    },

    async loadGiveawayMemberNames({ commit }, { guildId, ids }) {
      const uniqueIds = [...new Set(ids)];
      if (!uniqueIds.length) return;
      const members = await get(`guilds/${guildId}/giveaways/members`, { ids: uniqueIds.join(",") });
      commit("setGiveawayMemberNames", { guildId, members });
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

    setGiveaways(state: GuildState, { guildId, giveaways }) {
      state.giveaways = { ...state.giveaways, [guildId]: giveaways };
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
  },
};

<template>
  <div class="dashboard w-full px-2 py-2 md:px-6 md:py-6">
    <Title title="Zeppelin - Dashboard" />

    <nav class="flex items-stretch flex-wrap pl-4 pr-2 py-1 border border-border rounded-lg bg-card shadow-xl mb-8">
      <div class="flex-full md:flex-initial flex items-center">
        <img class="w-10 mr-5" src="/img/logo.png" alt="" aria-hidden="true">

        <router-link to="/dashboard">
          <h1 class="font-semibold">Zeppelin Dashboard</h1>
        </router-link>
      </div>

      <div class="flex-1 flex items-center flex-wrap">
        <ul class="dashboard-nav list-none flex md:ml-8">
          <router-link class="flex-auto mr-4" to="/dashboard">Guilds</router-link>
          <a href="javascript:void(0)" class="navbar-item hover:text-destructive mr-2" v-on:click="logout()">Log out</a>
        </ul>

        <div v-if="activeGuild" class="flex-1 flex items-center justify-end gap-3">
          <h3 class="min-w-0 truncate">{{ activeGuild.name }}</h3>
          <button v-if="isConfigPage && canEditConfig" class="flex-none btn-primary" :disabled="configSaving" @click="saveConfig">
            <span v-if="configSaving">Saving...</span>
            <span v-else-if="configSaved">Saved!</span>
            <span v-else>Save</span>
          </button>
        </div>
      </div>
    </nav>

    <div class="main-content">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="activeRoute" @config-save-state="configSaveState = $event" />
      </router-view>
    </div>
  </div>
</template>

<style scoped>
  .dashboard-nav a {
    &:hover {
      @apply underline;
    }
  }

  .dashboard-nav .router-link-exact-active {
    @apply underline;
  }
</style>

<script>
  import { ApiPermissions, hasPermission } from "@zeppelinbot/shared/apiPermissions.js";
  import Title from "../Title.vue";

  export default {
    components: {
      Title,
    },
    data() {
      return {
        configSaveState: { saving: false, saved: false },
      };
    },
    computed: {
      activeGuild() {
        const guildId = this.$route.params.guildId;
        return guildId ? this.$store.state.guilds.available.get(guildId) : null;
      },
      isConfigPage() {
        return /^\/dashboard\/guilds\/[^/]+\/config$/.test(this.$route.path);
      },
      canEditConfig() {
        const guildId = this.$route.params.guildId;
        const assignments = this.$store.state.guilds.guildPermissionAssignments[guildId] || [];
        const mine = assignments.find((assignment) => assignment.type === "USER" && assignment.target_id === this.$store.state.auth.userId);
        return mine && hasPermission(mine.permissions, ApiPermissions.EditConfig);
      },
      configSaving() {
        return this.configSaveState.saving;
      },
      configSaved() {
        return this.configSaveState.saved;
      },
    },
    methods: {
      saveConfig() {
        this.$refs.activeRoute?.save();
      },
      async logout() {
        await this.$store.dispatch("auth/logout");
        window.location.pathname = '/';
      }
    },
  };
</script>

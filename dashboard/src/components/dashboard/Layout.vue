<template>
  <div class="min-h-screen flex bg-background">
    <Title title="Zeppelin - Dashboard" />

    <!-- Mobile-only top bar (the sidebar itself is off-canvas below lg — see aside below) — a hamburger to open
         it plus the wordmark, since neither is reachable otherwise once the sidebar's off-screen. -->
    <div class="lg:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-sidebar-border bg-card text-sidebar-foreground">
      <button type="button" class="text-sidebar-foreground" aria-label="Open menu" @click="mobileMenuOpen = true">
        <Menu :size="24" fillColor="currentColor" />
      </button>
      <img class="w-7 h-7 shrink-0" src="/img/logo.png" alt="" aria-hidden="true">
      <span class="font-semibold truncate">Zeppelin</span>
    </div>

    <!-- Backdrop for the mobile drawer — clicking outside the sidebar closes it, same as any other overlay in
         this app (see ConfirmModal). Only ever present below lg, where the sidebar is off-canvas at all. -->
    <div v-if="mobileMenuOpen" class="lg:hidden fixed inset-0 z-40 bg-black/50" @click="mobileMenuOpen = false"></div>

    <!-- App-wide nav. Below lg it's an off-canvas drawer (fixed, slides in via translate-x, toggled by the
         mobile top bar above) since a permanent 256px column would eat most of a phone screen; at lg+ it's back
         to the normal sticky column, pinned to exactly the viewport height (not just min-height) so a long
         plugin list can't inflate the sidebar past the screen and drag the whole page down with it — the nav
         list below is the only part that scrolls internally when it doesn't fit, while the header/footer
         sections stay put. -->
    <aside
      class="w-64 shrink-0 flex flex-col border-r border-sidebar-border bg-card text-sidebar-foreground fixed top-0 left-0 bottom-0 z-50 transition-transform duration-200 lg:sticky lg:left-auto lg:bottom-auto lg:self-start lg:h-screen lg:translate-x-0"
      :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <router-link to="/dashboard" class="flex items-center gap-3 px-5 py-5 shrink-0" @click="mobileMenuOpen = false">
        <img class="w-8 h-8 shrink-0" src="/img/logo.png" alt="" aria-hidden="true">
        <span class="font-semibold truncate">Zeppelin</span>
      </router-link>

      <nav class="flex-1 min-h-0 px-3 pb-3 space-y-1 overflow-y-auto">
        <router-link to="/dashboard" class="sidebar-link" exact-active-class="sidebar-link-active" @click="mobileMenuOpen = false">
          <ViewDashboard :size="18" fillColor="currentColor" />
          Guilds
        </router-link>

        <!-- Filled via Teleport by GuildConfigEditor (its YAML/Interface/Giveaways/etc. section tabs, plus the
             plugin list while Interface is open) — empty everywhere else, so a guild's config navigation lives
             in this one app-wide sidebar instead of a separate page-header tab strip. -->
        <div id="config-nav-slot" @click="mobileMenuOpen = false"></div>
      </nav>

      <!-- Filled via Teleport by GuildConfigEditor with the plugin search box while Interface is open — pinned
           here above "Current server" (not scrolling away with the plugin list it filters, up in #config-nav-slot)
           so it stays reachable no matter how far you've scrolled the list. -->
      <div id="plugin-search-slot" class="shrink-0 empty:hidden px-3 py-3"></div>

      <!-- Only shown once a guild's been loaded (see activeGuild below) — the Save button in particular only
           makes sense on that guild's own config page (see isConfigPage/canEditConfig). -->
      <div v-if="activeGuild" class="shrink-0 px-3 pb-3 pt-3 border-t border-sidebar-border">
        <p class="px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50 mb-1.5">Current server</p>
        <p class="px-3 text-sm font-medium truncate mb-3">{{ activeGuild.name }}</p>
        <button v-if="isConfigPage && canEditConfig" class="w-full btn-primary" :disabled="configSaving" @click="saveConfig">
          <span v-if="configSaving">Saving...</span>
          <span v-else-if="configSaved">Saved!</span>
          <span v-else>Save</span>
        </button>
      </div>

      <div class="shrink-0 px-3 pb-4 pt-3 border-t border-sidebar-border">
        <a href="javascript:void(0)" class="sidebar-link hover:text-destructive hover:bg-destructive/10" v-on:click="logout()">
          <Logout :size="18" fillColor="currentColor" />
          Log out
        </a>
      </div>
    </aside>

    <div class="dashboard flex-1 min-w-0 px-2 pb-2 pt-16 md:px-6 md:pb-6 lg:pt-6">
      <div class="main-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" ref="activeRoute" @config-save-state="configSaveState = $event" />
        </router-view>
      </div>
    </div>
  </div>
</template>

<script>
  import { ApiPermissions, hasPermission } from "@zeppelinbot/shared/apiPermissions.js";
  import Logout from "vue-material-design-icons/Logout.vue";
  import Menu from "vue-material-design-icons/Menu.vue";
  import ViewDashboard from "vue-material-design-icons/ViewDashboard.vue";
  import Title from "../Title.vue";

  export default {
    components: {
      Title,
      Menu,
      ViewDashboard,
      Logout,
    },
    data() {
      return {
        configSaveState: { saving: false, saved: false },
        mobileMenuOpen: false,
      };
    },
    watch: {
      // Belt-and-suspenders alongside the @click handlers already on each nav link/router-link — catches
      // navigation that doesn't go through one of those (e.g. a plugin link inside #config-nav-slot before its
      // own @click was wired up, or a future one that forgets to).
      "$route.fullPath"() {
        this.mobileMenuOpen = false;
      },
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

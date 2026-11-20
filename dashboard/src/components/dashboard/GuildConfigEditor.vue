<template>
  <div v-if="loading" class="flex items-center justify-center py-24 text-muted-foreground text-sm">
    Loading…
  </div>
  <div v-else>
    <div v-if="errors.length" class="bg-card border border-destructive/40 border-l-4 border-l-destructive py-3 px-4 rounded-3xl shadow-md mb-4">
      <div class="font-semibold text-destructive mb-1">Errors</div>
      <pre v-for="error in errors" class="text-sm whitespace-pre-wrap font-mono text-foreground/90">{{ error }}</pre>
    </div>

    <!-- Teleported into the app-wide sidebar (see Layout.vue's #config-nav-slot) instead of rendered as a page
         header tab strip — same .sidebar-link treatment as Guilds/Log out (a real background on hover/active,
         which the old underlined-text tab strip never had) so switching sections of this guild's config reads as
         navigation, not a content-area tab control. -->
    <Teleport to="#config-nav-slot">
      <div class="border-t border-sidebar-border pt-3 mt-3 space-y-0.5">
        <a v-if="canReadConfig" href="javascript:void(0)" class="sidebar-link" :class="mode === 'yaml' ? 'sidebar-link-active' : ''" v-on:click="setMode('yaml')">YAML</a>
        <a v-if="isGiveawayManager" href="javascript:void(0)" class="sidebar-link" :class="mode === 'giveaways' ? 'sidebar-link-active' : ''" v-on:click="setMode('giveaways')">Giveaways</a>
        <a v-if="isEconomyManager" href="javascript:void(0)" class="sidebar-link" :class="mode === 'economy' ? 'sidebar-link-active' : ''" v-on:click="setMode('economy')">Economy</a>
        <a v-if="isMessageTrackerManager" href="javascript:void(0)" class="sidebar-link" :class="mode === 'messages' ? 'sidebar-link-active' : ''" v-on:click="setMode('messages')">Messages</a>
        <a v-if="isMessageTrackerManager" href="javascript:void(0)" class="sidebar-link" :class="mode === 'activity' ? 'sidebar-link-active' : ''" v-on:click="setMode('activity')">Activity</a>
        <!-- Always last in the tab order (not second, right after YAML) — kept below every other tab regardless
             of which of them happen to be available for this guild, so its own plugin sub-nav (right below) has
             a stable position instead of jumping around depending on isGiveawayManager/isEconomyManager/etc. -->
        <a v-if="canReadConfig" href="javascript:void(0)" class="sidebar-link" :class="mode === 'interface' ? 'sidebar-link-active' : ''" v-on:click="setMode('interface')">Interface</a>

        <!-- Plugin picker, only while the Interface tab is actually open — indented under it (a left border, like
             a tree) so it reads as "Interface"'s own sub-nav rather than another top-level section. The search
             box that filters this list lives separately, pinned above "Current server" — see #plugin-search-slot
             below — so it doesn't scroll away along with the list itself. -->
        <div v-if="canReadConfig && mode === 'interface'" class="ml-3 pl-3 mt-1 space-y-0.5 border-l border-sidebar-border">
          <a href="javascript:void(0)"
             v-if="generalMatchesSearch"
             class="sidebar-link"
             :class="selectedPlugin === GENERAL ? 'sidebar-link-active' : ''"
             v-on:click="selectPlugin(GENERAL)">
            General
          </a>
          <a href="javascript:void(0)"
             v-for="plugin in searchedFormPlugins"
             :key="plugin.name"
             class="sidebar-link"
             :class="selectedPlugin === plugin.name ? 'sidebar-link-active' : ''"
             v-on:click="selectPlugin(plugin.name)">
            {{ plugin.info.prettyName || plugin.name }}
          </a>
          <p v-if="interfaceSearchQuery && !generalMatchesSearch && !searchedFormPlugins.length" class="text-sm text-sidebar-foreground/50 italic px-3 py-1.5">
            No plugins match.
          </p>
        </div>
      </div>
    </Teleport>

    <Teleport to="#plugin-search-slot" v-if="canReadConfig && mode === 'interface'">
      <input
        ref="pluginSearchInput"
        type="text"
        class="field-input"
        placeholder="Search plugins"
        v-model="interfaceSearchQuery"
      />
    </Teleport>

    <div v-if="canReadConfig" v-show="mode === 'yaml'">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <div class="flex-1 min-w-0 truncate text-sm font-mono text-muted-foreground" :title="breadcrumb">{{ breadcrumb || " " }}</div>
        <button type="button" class="btn-secondary btn-sm" v-on:click="runEditorCommand('foldall')">Collapse all</button>
        <button type="button" class="btn-secondary btn-sm" v-on:click="runEditorCommand('unfoldall')">Expand all</button>
        <button type="button" class="btn-primary btn-sm" v-on:click="openInsert">Insert YAML</button>
      </div>
      <div class="flex gap-3">
        <aside class="hidden md:flex flex-col w-64 shrink-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden" :style="{ height: editorHeight + 'px' }">
          <input type="text" class="field-input m-2 !w-auto" placeholder="Jump to… (e.g. automod)" v-model="outlineQuery" />
          <div class="flex-1 overflow-y-auto pb-2 text-sm font-mono">
            <div v-for="row in outlineRows"
                 :key="row.node.path"
                 class="flex items-center gap-1 pr-2 py-0.5 cursor-pointer hover:bg-muted"
                 :class="row.node === activeNode ? 'bg-muted text-foreground' : 'text-muted-foreground'"
                 :style="{ paddingLeft: row.node.depth * 12 + 4 + 'px' }"
                 :title="row.node.path.split('/').join(' › ')"
                 v-on:click="jumpToNode(row.node)">
              <span class="w-4 shrink-0 text-center" v-on:click.stop="toggleOutlineNode(row.node)">{{ row.node.children.length ? (row.expanded ? "▾" : "▸") : "" }}</span>
              <span class="truncate">{{ row.node.label }}</span>
            </div>
            <p v-if="outlineQuery && !outlineRows.length" class="px-3 py-1.5 italic text-muted-foreground">No matches.</p>
          </div>
        </aside>
        <div class="flex-1 min-w-0">
    <v-ace-editor class="rounded-lg shadow-lg border border-border"
               v-model:value="editableConfig"
               @init="editorInit"
               lang="yaml"
               theme="tomorrow_night"
               ref="aceEditor"
               :options="{
                  useSoftTabs: true,
                  tabSize: 2,
                  showPrintMargin: false
                }"
                :style="{
                  width: editorWidth + 'px',
                  height: editorHeight + 'px',
                }" />
        </div>
      </div>
    </div>

    <div v-if="insertOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" v-on:click.self="insertOpen = false">
      <div class="bg-card border border-border rounded-3xl shadow-lg max-w-2xl w-full p-5">
        <h3 class="font-semibold mb-1">Insert YAML</h3>
        <p class="text-sm text-muted-foreground mb-3">
          Paste a snippet, either from the top (<code>plugins:</code>) or starting at a plugin name (<code>automod:</code>).
          New keys are added, existing values are replaced, and overrides with the same role/channel/level are combined.
        </p>
        <textarea ref="insertTextarea" v-model="insertText" class="field-input font-mono text-sm h-64" spellcheck="false" placeholder="plugins:&#10;  automod:&#10;    config:&#10;      rules: …"></textarea>
        <div class="mt-3 text-sm max-h-40 overflow-y-auto">
          <p v-if="insertPreview.error" class="text-destructive whitespace-pre-wrap">{{ insertPreview.error }}</p>
          <ul v-else-if="insertPreview.changes.length" class="space-y-0.5 font-mono">
            <li v-for="change in insertPreview.changes" :key="change.path">
              <span :class="change.kind === 'added' ? 'text-primary' : 'text-destructive'">{{ change.kind === "added" ? "+ add" : "~ replace" }}</span>
              {{ change.path.split("/").join(" › ") }}
            </li>
          </ul>
          <p v-else-if="insertText.trim()" class="text-muted-foreground">Nothing would change.</p>
        </div>
        <p v-if="configHasComments" class="text-sm text-muted-foreground mt-2">Inserting re-formats the YAML, which removes its comments.</p>
        <div class="flex justify-end gap-2 mt-5">
          <button type="button" class="btn-secondary" v-on:click="insertOpen = false">Cancel</button>
          <button type="button" class="btn-primary" :disabled="!insertPreview.changes.length" v-on:click="applyInsert">Insert</button>
        </div>
      </div>
    </div>

    <div v-if="canReadConfig && mode === 'interface'" class="mt-4 min-w-0">
      <div v-if="pluginLoading" class="bg-card border border-border rounded-3xl shadow-md p-6 text-muted-foreground text-sm">
        Loading…
      </div>
      <GeneralConfigForm
        v-else-if="selectedPlugin === GENERAL && generalSchema && generalValue"
        :schema="generalSchema"
        :model-value="generalValue"
        @update:model-value="generalValue = $event"
      />
      <PluginConfigForm
        v-else-if="selectedPlugin && selectedPlugin !== GENERAL && pluginSchema && pluginValue"
        :guild-id="String($route.params.guildId)"
        :schema="pluginSchema"
        :model-value="pluginValue"
        :plugin-title="selectedPluginInfo ? (selectedPluginInfo.prettyName || selectedPlugin) : selectedPlugin"
        :plugin-description="selectedPluginInfo ? selectedPluginInfo.description : null"
        @update:model-value="pluginValue = $event"
      />
      <div v-else class="bg-card border border-border rounded-3xl shadow-md p-6 text-muted-foreground text-sm">
        Select a plugin from the sidebar.
      </div>
    </div>

    <GuildGiveawaysPanel
      v-if="mode === 'giveaways' && isGiveawayManager"
      class="mt-4"
      :guild-id="String($route.params.guildId)"
      :can-edit-config="canEditConfig"
    />
    <GuildEconomyPanel v-if="mode === 'economy' && isEconomyManager" class="mt-4" :guild-id="String($route.params.guildId)" />
    <GuildMessagesPanel v-if="mode === 'messages' && isMessageTrackerManager" class="mt-4" :guild-id="String($route.params.guildId)" />
    <GuildActivityPanel v-if="mode === 'activity' && isMessageTrackerManager" class="mt-4" :guild-id="String($route.params.guildId)" />
  </div>
</template>

<script lang="ts">
  import yaml from "js-yaml";
  import { computed } from "vue";
  import {mapState} from "vuex";
  import {ApiError, get, post} from "../../api";
  import { ApiPermissions, hasPermission } from "@zeppelinbot/shared/apiPermissions.js";
  import { DocsState, GuildState, RootState } from "../../store/types";

  import { VAceEditor } from "vue3-ace-editor";

  import "ace-builds/src-noconflict/ext-language_tools";
  import 'ace-builds/src-noconflict/ext-searchbox';
  import "ace-builds/src-noconflict/mode-yaml";
  import "ace-builds/src-noconflict/theme-tomorrow_night";

  import GeneralConfigForm from "./GeneralConfigForm.vue";
  import GuildActivityPanel from "./GuildActivityPanel.vue";
  import GuildEconomyPanel from "./GuildEconomyPanel.vue";
  import GuildGiveawaysPanel from "./GuildGiveawaysPanel.vue";
  import GuildMessagesPanel from "./GuildMessagesPanel.vue";
  import PluginConfigForm from "./PluginConfigForm.vue";
  import { dereferenceSchema, fillDefaults } from "./pluginConfigSchema";
  import { buildOutline, findNodeByPath, mergeSnippet, nodeAtLine } from "./yamlTools";

  let editorKeybindListener;
  let windowResizeListener;

  // non-plugin fields) so it can share the same selectedPlugin/sync machinery as a real plugin name would.
  const GENERAL = "__general__";

  export default {
    components: {
      VAceEditor,
      GeneralConfigForm,
      PluginConfigForm,
      GuildGiveawaysPanel,
      GuildEconomyPanel,
      GuildMessagesPanel,
      GuildActivityPanel,
    },
    // Reactive provide (Options API needs an explicit computed() to keep it reactive for injecting descendants)
    // so the search bar above the Interface tab can reach every PluginConfigField in the tree without threading
    // it through as a prop at every level.
    provide() {
      return {
        pluginConfigSearchQuery: computed(() => this.interfaceSearchQuery),
      };
    },
    async mounted() {
      try {
        await this.$store.dispatch("guilds/loadGuild", this.$route.params.guildId);
      } catch (err) {
        if (err instanceof ApiError) {
          this.$router.push('/dashboard');
          return;
        }

        throw err;
      }

      if (this.guild == null) {
        this.$router.push('/dashboard');
        return;
      }

      await this.$store.dispatch("guilds/loadGuildPermissionAssignments", this.$route.params.guildId).catch(() => {});

      // Fetch the full plugin list so we know what to offer in the Interface tab's sidebar — the same registry
      // the docs pages use, reused here instead of hardcoding a plugin name.

      // Whether to offer the Giveaways tab at all — same manager_roles check the standalone giveaways API
      // guards itself with, so the tab only appears for someone who could actually use it.
      this.isGiveawayManager = await this.$store
        .dispatch("guilds/loadGiveawayAccess", this.$route.params.guildId)
        .catch(() => false);

      // Same idea as isGiveawayManager above, but for Economy's own manager_roles (see Economy/types.ts) — the
      // tab only appears for someone who could actually use it.
      this.isEconomyManager = await this.$store
        .dispatch("guilds/loadEconomyAccess", this.$route.params.guildId)
        .catch(() => false);

      // Same idea again, for MessageTracker's own manager_roles (see MessageTracker/types.ts).
      this.isMessageTrackerManager = await this.$store
        .dispatch("guilds/loadMessagesAccess", this.$route.params.guildId)
        .catch(() => false);

      this.canReadConfig = await post(`guilds/${this.$route.params.guildId}/check-permission`, { permission: ApiPermissions.ReadConfig })
        .then((result) => result.result)
        .catch(() => false);

      if (this.canReadConfig) {
        await this.$store.dispatch("guilds/loadConfig", this.$route.params.guildId);
        this.editableConfig = this.config || "";
        await this.$store.dispatch("docs/loadAllPlugins");
      }

      // Restores which tab/plugin was open from the URL (see updateUrlQuery) so a shared link opens straight to
      // the same spot instead of always landing on Raw YAML / General. Both are resolved before either is
      // assigned so updateUrlQuery (called explicitly, not reactively — see selectPlugin/setMode) never runs
      // with only one of the two updated yet, which would otherwise write a half-restored URL over the real one.
      const queryPlugin = typeof this.$route.query.plugin === "string" ? this.$route.query.plugin : null;
      const validPluginNames = new Set([this.GENERAL, ...this.formPlugins.map((p) => p.name)]);
      this.selectedPlugin = queryPlugin && validPluginNames.has(queryPlugin) ? queryPlugin : this.GENERAL;
      const queryMode = this.$route.query.mode;
      this.mode =
        queryMode === "giveaways" && this.isGiveawayManager
          ? "giveaways"
          : queryMode === "economy" && this.isEconomyManager
            ? "economy"
            : queryMode === "messages" && this.isMessageTrackerManager
              ? "messages"
              : queryMode === "activity" && this.isMessageTrackerManager
                ? "activity"
              : this.canReadConfig && queryMode === "interface"
                ? "interface"
                : this.canReadConfig
                  ? "yaml"
                  : this.isGiveawayManager
                    ? "giveaways"
                    : this.isEconomyManager
                      ? "economy"
                      : "messages";

      this.loading = false;

      if (this.mode === "interface") {
        await this.loadSelectionIntoInterface(this.selectedPlugin);
      }
      this.updateUrlQuery();
    },
    beforeRouteLeave(to, from, next) {
      if (editorKeybindListener) {
        window.removeEventListener("keydown", editorKeybindListener);
        editorKeybindListener = null;
      }

      if (windowResizeListener) {
        window.removeEventListener("resize", windowResizeListener);
        windowResizeListener = null;
      }

      next();
    },
    data() {
      return {
        loading: true,
        saving: false,
        saved: false,
        editableConfig: null,
        errors: [],
        editorWidth: 900,
        editorHeight: 600,
        savedTimeout: null,
        mode: "yaml",
        isGiveawayManager: false,
        isEconomyManager: false,
        isMessageTrackerManager: false,
        canReadConfig: false,
        selectedPlugin: null,
        GENERAL,
        // Interface-tab-wide search — filters/auto-expands the current plugin's whole field tree, not just one
        // record/array at a time. Provided reactively to descendants (see provide() above) rather than passed
        // down as a prop through every layer.
        interfaceSearchQuery: "",
        // Per-plugin dereferenced schema, fetched once and cached — schemas don't change based on user edits.
        pluginSchemas: {},
        // { config, overrides } for the currently selected plugin, derived live from editableConfig whenever the
        // Interface tab becomes active. This is the single piece of state PluginConfigForm edits; it's folded
        // back into editableConfig on save or whenever switching away, so the YAML and Interface tabs never
        // drift out of sync with each other.
        pluginValue: null,
        pluginLoading: false,
        // Schema for the guild config's top-level, non-plugin fields (prefix/embed_color/levels), fetched once,
        // and { prefix, embed_color, levels } derived live from editableConfig the same way pluginValue is.
        generalSchema: null,
        generalValue: null,
        // YAML tab outline + insert dialog
        cursorLine: 1,
        outlineQuery: "",
        // Paths whose expanded state was flipped from the default (top level expanded, everything else collapsed)
        outlineToggled: new Set<string>(),
        insertOpen: false,
        insertText: "",
      };
    },
    computed: {
      ...mapState("guilds", {
        guild(guilds: GuildState) {
          return guilds.available.get(this.$route.params.guildId);
        },
        config(guilds: GuildState) {
          return guilds.configs[this.$route.params.guildId];
        },
      }),
      ...mapState({
        canEditConfig(state: RootState): boolean {
          const guildPermissions = state.guilds.guildPermissionAssignments[this.$route.params.guildId] || [];
          const myPermissions = guildPermissions.find(p => p.type === "USER" && p.target_id === state.auth.userId) || null;
          return myPermissions && hasPermission(myPermissions.permissions, ApiPermissions.EditConfig);
        },
      }),
      ...mapState("docs", {
        formPlugins(docs: DocsState) {
          return [...docs.allPlugins].sort((a, b) => {
            const aName = (a.info.prettyName || a.name).toLowerCase();
            const bName = (b.info.prettyName || b.name).toLowerCase();
            return aName < bName ? -1 : aName > bName ? 1 : 0;
          });
        },
      }),
      pluginSchema() {
        return this.selectedPlugin && this.selectedPlugin !== GENERAL ? this.pluginSchemas[this.selectedPlugin] ?? null : null;
      },
      selectedPluginInfo() {
        if (!this.selectedPlugin || this.selectedPlugin === GENERAL) return null;
        return this.formPlugins.find((p) => p.name === this.selectedPlugin)?.info ?? null;
      },
      // The search bar also filters the sidebar itself by plugin name, not just the currently-open plugin's
      // fields — so e.g. typing "economy" finds the plugin even if you're not already looking at it.
      generalMatchesSearch() {
        const q = this.interfaceSearchQuery.trim().toLowerCase();
        return !q || "general".includes(q);
      },
      outline() {
        return buildOutline(this.editableConfig || "");
      },
      activeNode() {
        return nodeAtLine(this.outline, this.cursorLine);
      },
      breadcrumb() {
        const parts = [];
        for (let n = this.activeNode; n; n = n.parent) parts.unshift(n.label);
        return parts.join(" › ");
      },
      outlineRows() {
        const rows = [];
        const q = this.outlineQuery.trim().toLowerCase();
        if (q) {
          // Matches plus their ancestors, everything shown expanded
          const keep = new Set();
          const visit = (nodes) => {
            for (const n of nodes) {
              if (n.label.toLowerCase().includes(q)) {
                for (let a = n; a && !keep.has(a); a = a.parent) keep.add(a);
              }
              visit(n.children);
            }
          };
          visit(this.outline);
          const walk = (nodes) => {
            for (const n of nodes) {
              if (!keep.has(n)) continue;
              rows.push({ node: n, expanded: true });
              walk(n.children);
            }
          };
          walk(this.outline);
          return rows;
        }
        const walk = (nodes) => {
          for (const n of nodes) {
            const expanded = (n.depth === 0) !== this.outlineToggled.has(n.path);
            rows.push({ node: n, expanded });
            if (expanded) walk(n.children);
          }
        };
        walk(this.outline);
        return rows;
      },
      configHasComments() {
        return /(^|\s)#/m.test(this.editableConfig || "");
      },
      insertPreview() {
        if (!this.insertText.trim()) return { changes: [], result: null, error: null };
        let config;
        try {
          config = yaml.load(this.editableConfig || "") || {};
        } catch {
          return { changes: [], result: null, error: "The config in the editor has YAML errors. Fix those first." };
        }
        try {
          const snippet = yaml.load(this.insertText);
          return { ...mergeSnippet(config, snippet, this.formPlugins.map((p) => p.name)), error: null };
        } catch (e) {
          return { changes: [], result: null, error: e.message };
        }
      },
      searchedFormPlugins() {
        const q = this.interfaceSearchQuery.trim().toLowerCase();
        if (!q) return this.formPlugins;
        return this.formPlugins.filter((plugin) => (plugin.info.prettyName || plugin.name).toLowerCase().includes(q));
      },
    },
    methods: {
      toggleOutlineNode(node) {
        const toggled = new Set(this.outlineToggled);
        if (toggled.has(node.path)) toggled.delete(node.path);
        else toggled.add(node.path);
        this.outlineToggled = toggled;
      },
      jumpToNode(node) {
        const editor = this.$refs.aceEditor.getAceInstance();
        editor.session.unfold(node.line - 1);
        editor.gotoLine(node.line, node.column, false);
        editor.scrollToLine(node.line - 1, true, true, () => {});
        editor.focus();
      },
      runEditorCommand(command) {
        this.$refs.aceEditor.getAceInstance().execCommand(command);
      },
      openInsert() {
        this.insertText = "";
        this.insertOpen = true;
        this.$nextTick(() => (this.$refs.insertTextarea as HTMLTextAreaElement | undefined)?.focus());
      },
      async applyInsert() {
        const { result, changes } = this.insertPreview;
        if (!result || !changes.length) return;
        this.editableConfig = yaml.dump(result);
        this.insertOpen = false;
        await this.$nextTick();
        const target = findNodeByPath(this.outline, changes[0].path);
        if (target) this.jumpToNode(target);
      },
      // Keeps the URL in sync with what's currently open (mode + selected plugin) so the page is shareable/
      // bookmarkable at any point — called explicitly from selectPlugin/setMode (and once after mounted's own
      // restore, as a no-op confirming it matches) rather than via a reactive watcher, since mode and
      // selectedPlugin can each change independently and a watcher on either one would fire — and write a
      // half-updated URL — before the other one's new value is in place.
      updateUrlQuery() {
        const query = { ...this.$route.query };
        if (this.mode === "interface" && this.selectedPlugin) {
          query.mode = "interface";
          query.plugin = this.selectedPlugin;
        } else if (this.mode === "giveaways") {
          query.mode = "giveaways";
          delete query.plugin;
        } else if (this.mode === "economy") {
          query.mode = "economy";
          delete query.plugin;
        } else if (this.mode === "messages" || this.mode === "activity") {
          query.mode = this.mode;
          delete query.plugin;
        } else {
          delete query.mode;
          delete query.plugin;
        }
        if (JSON.stringify(query) === JSON.stringify(this.$route.query)) return;
        this.$router.replace({ query });
      },
      // Fetches+dereferences a plugin's config-schema once and caches it; the schema itself never changes based
      // on user edits, only the value does.
      async ensurePluginSchema(pluginName) {
        if (!this.pluginSchemas[pluginName]) {
          const result = await get(`guilds/${this.$route.params.guildId}/config-schema/${pluginName}`);
          const schema = dereferenceSchema(result.schema, result.schema?.$defs ?? {});
          this.pluginSchemas = { ...this.pluginSchemas, [pluginName]: schema };
        }
        return this.pluginSchemas[pluginName];
      },
      // Parses the *current* editableConfig text and pulls out this plugin's raw config/overrides, filling in
      // any defaults the raw YAML didn't spell out — this is what makes switching into the Interface tab reflect
      // whatever's currently in the YAML editor, hand-edited or not, rather than a stale server fetch.
      derivePluginValueFromYaml(pluginName, schema) {
        let parsed;
        try {
          parsed = yaml.load(this.editableConfig || "") || {};
        } catch {
          parsed = {};
        }
        const pluginNode = parsed?.plugins?.[pluginName] ?? {};
        const configSchema = schema?.properties?.config ?? null;
        const overridesSchema = schema?.properties?.overrides ?? null;
        return {
          config: fillDefaults(configSchema, pluginNode.config ?? {}),
          overrides: fillDefaults(overridesSchema, pluginNode.overrides ?? []),
        };
      },
      // Folds the live Interface-tab value back into editableConfig's YAML text — called whenever we're about to
      // leave the Interface tab (switching tabs, switching plugins, or saving) so nothing typed there is lost.
      syncPluginValueIntoYaml() {
        if (!this.selectedPlugin || !this.pluginValue) return;
        let parsed;
        try {
          parsed = yaml.load(this.editableConfig || "") || {};
        } catch {
          // Raw YAML is currently invalid (mid hand-edit) — there's nothing sensible to merge into, so leave it
          // alone rather than clobbering whatever the user was typing.
          return;
        }
        parsed.plugins = parsed.plugins || {};
        parsed.plugins[this.selectedPlugin] = parsed.plugins[this.selectedPlugin] || {};
        parsed.plugins[this.selectedPlugin].config = this.pluginValue.config;
        if (this.pluginValue.overrides && this.pluginValue.overrides.length) {
          parsed.plugins[this.selectedPlugin].overrides = this.pluginValue.overrides;
        } else {
          delete parsed.plugins[this.selectedPlugin].overrides;
        }
        this.editableConfig = yaml.dump(parsed);
      },
      // Fetches the schema for the guild config's top-level, non-plugin fields once and caches it.
      async ensureGeneralSchema() {
        if (!this.generalSchema) {
          const result = await get(`guilds/${this.$route.params.guildId}/general-config-schema`);
          this.generalSchema = result.schema;
        }
        return this.generalSchema;
      },
      // Same idea as derivePluginValueFromYaml, but for the top-level prefix/embed_color/levels keys instead of
      // a plugin's nested config/overrides.
      deriveGeneralValueFromYaml(schema) {
        let parsed;
        try {
          parsed = yaml.load(this.editableConfig || "") || {};
        } catch {
          parsed = {};
        }
        return {
          prefix: fillDefaults(schema?.properties?.prefix, parsed.prefix),
          embed_color: fillDefaults(schema?.properties?.embed_color, parsed.embed_color),
          levels: fillDefaults(schema?.properties?.levels, parsed.levels),
        };
      },
      // Same idea as syncPluginValueIntoYaml, but for the top-level prefix/embed_color/levels keys.
      syncGeneralValueIntoYaml() {
        if (!this.generalValue) return;
        let parsed;
        try {
          parsed = yaml.load(this.editableConfig || "") || {};
        } catch {
          return;
        }
        if (this.generalValue.prefix) {
          parsed.prefix = this.generalValue.prefix;
        } else {
          delete parsed.prefix;
        }
        if (this.generalValue.embed_color != null) {
          parsed.embed_color = this.generalValue.embed_color;
        } else {
          delete parsed.embed_color;
        }
        if (this.generalValue.levels && Object.keys(this.generalValue.levels).length) {
          parsed.levels = this.generalValue.levels;
        } else {
          delete parsed.levels;
        }
        this.editableConfig = yaml.dump(parsed);
      },
      async loadPluginIntoInterface(pluginName) {
        this.pluginLoading = true;
        const schema = await this.ensurePluginSchema(pluginName);
        this.pluginValue = this.derivePluginValueFromYaml(pluginName, schema);
        this.pluginLoading = false;
      },
      async loadGeneralIntoInterface() {
        this.pluginLoading = true;
        const schema = await this.ensureGeneralSchema();
        this.generalValue = this.deriveGeneralValueFromYaml(schema);
        this.pluginLoading = false;
      },
      // Persists whatever's currently being edited in the Interface tab (general settings or a plugin's config)
      // back into editableConfig — called whenever we're about to leave the Interface tab (switching tabs,
      // switching selection, or saving) so nothing typed there is lost.
      syncSelectionIntoYaml() {
        if (this.selectedPlugin === GENERAL) this.syncGeneralValueIntoYaml();
        else this.syncPluginValueIntoYaml();
      },
      async loadSelectionIntoInterface(pluginName) {
        if (pluginName === GENERAL) await this.loadGeneralIntoInterface();
        else await this.loadPluginIntoInterface(pluginName);
      },
      async selectPlugin(pluginName) {
        if (pluginName === this.selectedPlugin) return;
        if (this.mode === "interface") this.syncSelectionIntoYaml();
        this.selectedPlugin = pluginName;
        if (this.mode === "interface") await this.loadSelectionIntoInterface(pluginName);
        this.updateUrlQuery();
      },
      async setMode(newMode) {
        if (newMode === this.mode) return;
        if (this.mode === "interface") this.syncSelectionIntoYaml();
        this.mode = newMode;
        if (newMode === "interface" && this.selectedPlugin) {
          await this.loadSelectionIntoInterface(this.selectedPlugin);
        }
        if (newMode === "yaml") {
          // The ace editor stays mounted (v-show, not v-if) while the Interface tab is active, so its value can
          // get updated programmatically (via syncSelectionIntoYaml above) while its container has zero
          // dimensions — ace's renderer only paints the lines that fit its last-known viewport size, so without
          // this it keeps showing whatever it last rendered while visible instead of the new content until
          // something else (e.g. a page reload) forces a fresh render.
          this.$nextTick(() => this.fitEditorToWindow());
        }
        this.updateUrlQuery();
      },
      editorInit(editor) {
        editor.selection.on("changeCursor", () => {
          this.cursorLine = editor.getCursorPosition().row + 1;
        });

        // Add Ctrl+S/Cmd+S save shortcut
        const isMac = /mac/i.test(navigator.platform);
        const modKeyPressed = (ev: KeyboardEvent) => (isMac ? ev.metaKey : ev.ctrlKey);
        const nonModKeyPressed = (ev: KeyboardEvent) => (isMac ? ev.ctrlKey : ev.metaKey);
        const shortcutModifierPressed = (ev: KeyboardEvent) => modKeyPressed(ev) && !nonModKeyPressed(ev) && !ev.altKey;

        if (editorKeybindListener) {
          // Make sure we clean up any potentially leftover event listeners
          window.removeEventListener("keydown", editorKeybindListener);
        }

        editorKeybindListener = (ev: KeyboardEvent) => {
          if (shortcutModifierPressed(ev) && ev.key === "s") {
            ev.preventDefault();
            this.save();
            return;
          }

          if (shortcutModifierPressed(ev) && ev.key === "f") {
            // Interface tab has its own plugin search box instead of the YAML editor's find widget — Ctrl/Cmd+F
            // focuses whichever one is actually relevant to what's currently on screen.
            if (this.mode === "interface") {
              ev.preventDefault();
              const input = this.$refs.pluginSearchInput as HTMLInputElement | undefined;
              input?.focus();
              input?.select();
              return;
            }

            if (this.mode === "yaml") {
              ev.preventDefault();
              this.$refs.aceEditor.getAceInstance().execCommand("find");
              return;
            }
          }
        };
        window.addEventListener("keydown", editorKeybindListener);

        // Auto-fit editor to window
        this.fitEditorToWindow();

        if (windowResizeListener) {
          window.removeEventListener("resize", windowResizeListener);
        }

        let debounceTimeout;
        windowResizeListener = (ev: UIEvent) => {
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }

          debounceTimeout = setTimeout(() => {
            this.fitEditorToWindow();
          }, 350);
        };
        window.addEventListener("resize", windowResizeListener);
      },
      fitEditorToWindow() {
        const mainContainer = document.querySelector('.dashboard');
        const mainContainerStyles = window.getComputedStyle(mainContainer);

        const editorElem = this.$refs.aceEditor.$el;
        const newWidth = editorElem.parentNode.clientWidth;
        const rect = editorElem.getBoundingClientRect();
        const newHeight = Math.round(window.innerHeight - rect.top - parseInt(mainContainerStyles.paddingLeft, 10));
        this.resizeEditor(newWidth, newHeight);
      },
      resizeEditor(newWidth, newHeight) {
        this.editorWidth = newWidth;
        this.editorHeight = newHeight;

        this.$nextTick(() => {
          this.$refs.aceEditor.getAceInstance().resize();
        });
      },
      async save() {
        if (this.saving) return;

        // Whichever tab is currently active, saving always goes through the same raw-YAML endpoint below — so
        // if the Interface tab has unsaved edits, fold them into editableConfig first (this is also what makes
        // Ctrl+S work while the Interface tab is active, without a separate keybinding for it).
        if (this.mode === "interface") this.syncSelectionIntoYaml();

        this.saved = false;
        this.saving = true;
        this.$emit("config-save-state", { saving: true, saved: false });
        this.errors = [];

        if (this.savedTimeout) {
          clearTimeout(this.savedTimeout);
        }

        const minWaitTime = new Promise(resolve => setTimeout(resolve, 300));

        try {
          await this.$store.dispatch("guilds/saveConfig", {
            guildId: this.$route.params.guildId,
            config: this.editableConfig,
          });
          await minWaitTime;

          this.saving = false;
          this.saved = true;
          this.$emit("config-save-state", { saving: false, saved: true });
          this.savedTimeout = setTimeout(() => {
            this.saved = false;
            this.$emit("config-save-state", { saving: false, saved: false });
          }, 3000);
        } catch (e) {
          if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
            this.errors = e.body.errors || ['Error while saving config'];
            this.saving = false;
            this.$emit("config-save-state", { saving: false, saved: false });
            return;
          }

          throw e;
        }
      },
    },
  };
</script>

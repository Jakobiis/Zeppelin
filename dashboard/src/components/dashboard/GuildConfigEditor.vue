<template>
  <div v-if="loading" class="flex items-center justify-center py-24 text-muted-foreground text-sm">
    Loading…
  </div>
  <div v-else>
    <div v-if="errors.length" class="bg-card border border-destructive/40 border-l-4 border-l-destructive py-3 px-4 rounded-lg shadow-md mb-4">
      <div class="font-semibold text-destructive mb-1">Errors</div>
      <pre v-for="error in errors" class="text-sm whitespace-pre-wrap font-mono text-foreground/90">{{ error }}</pre>
    </div>

    <div class="bg-card border border-border rounded-lg shadow-md px-6 py-4 flex items-center flex-wrap">
      <h1 class="flex-full md:flex-auto">Config for {{ guild.name }}</h1>
      <button v-if="!saving" class="flex-none btn-primary" v-on:click="save">
        <span v-if="saved">Saved!</span>
        <span v-else>Save</span>
      </button>
      <div v-else class="flex-none btn-secondary">
        Saving...
      </div>
    </div>

    <Tabs class="mt-4">
      <Tab :active="mode === 'yaml'"><a href="javascript:void(0)" v-on:click="setMode('yaml')">Raw YAML</a></Tab>
      <Tab :active="mode === 'interface'"><a href="javascript:void(0)" v-on:click="setMode('interface')">Interface</a></Tab>
    </Tabs>

    <v-ace-editor v-show="mode === 'yaml'" class="rounded-lg shadow-lg border border-border"
               v-model:value="editableConfig"
               @init="editorInit"
               lang="yaml"
               theme="tomorrow_night"
               ref="aceEditor"
               :options="{
                  useSoftTabs: true,
                  tabSize: 2
                }"
                :style="{
                  width: editorWidth + 'px',
                  height: editorHeight + 'px',
                }" />

    <div v-if="mode === 'interface'" class="flex flex-wrap lg:flex-nowrap items-start gap-6 mt-4">
      <nav class="w-full lg:w-56 flex-none border border-border rounded-lg bg-card shadow-md p-3">
        <ul class="list-none space-y-0.5">
          <li v-for="plugin in formPlugins" :key="plugin.name">
            <a href="javascript:void(0)"
               class="block px-3 py-1.5 rounded-md text-sm border-l-2 transition-colors duration-150"
               :class="selectedPlugin === plugin.name
                 ? 'bg-accent text-accent-foreground font-medium border-primary'
                 : 'text-foreground border-transparent hover:bg-accent hover:text-accent-foreground'"
               v-on:click="selectPlugin(plugin.name)">
              {{ plugin.info.prettyName || plugin.name }}
            </a>
          </li>
        </ul>
      </nav>

      <div class="flex-auto min-w-0">
        <p class="text-sm text-muted-foreground mb-4">
          Structured forms are available for plugins as the renderer learns to handle more of their config shape —
          anything it doesn't understand yet falls back to a raw JSON field. This is the same underlying config as
          the Raw YAML tab — switching back and forth (or saving) keeps them in sync.
        </p>
        <div v-if="pluginLoading" class="bg-card border border-border rounded-lg shadow-md p-6 text-muted-foreground text-sm">
          Loading…
        </div>
        <PluginConfigForm
          v-else-if="selectedPlugin && pluginSchema && pluginValue"
          :guild-id="String($route.params.guildId)"
          :schema="pluginSchema"
          :model-value="pluginValue"
          @update:model-value="pluginValue = $event"
        />
        <div v-else class="bg-card border border-border rounded-lg shadow-md p-6 text-muted-foreground text-sm">
          Select a plugin from the sidebar.
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import yaml from "js-yaml";
  import {mapState} from "vuex";
  import {ApiError, get} from "../../api";
  import { DocsState, GuildState } from "../../store/types";

  import { VAceEditor } from "vue3-ace-editor";

  import "ace-builds/src-noconflict/ext-language_tools";
  import 'ace-builds/src-noconflict/ext-searchbox';
  import "ace-builds/src-noconflict/mode-yaml";
  import "ace-builds/src-noconflict/theme-tomorrow_night";

  import Tab from "../Tab.vue";
  import Tabs from "../Tabs.vue";
  import PluginConfigForm from "./PluginConfigForm.vue";
  import { dereferenceSchema, fillDefaults } from "./pluginConfigSchema";

  let editorKeybindListener;
  let windowResizeListener;

  export default {
    components: {
      VAceEditor,
      Tab,
      Tabs,
      PluginConfigForm,
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

      await this.$store.dispatch("guilds/loadConfig", this.$route.params.guildId);
      this.editableConfig = this.config || "";

      // Fetch the full plugin list so we know what to offer in the Interface tab's sidebar — the same registry
      // the docs pages use, reused here instead of hardcoding a plugin name.
      await this.$store.dispatch("docs/loadAllPlugins");
      this.selectedPlugin = this.formPlugins[0]?.name ?? null;

      this.loading = false;
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
        selectedPlugin: null,
        // Per-plugin dereferenced schema, fetched once and cached — schemas don't change based on user edits.
        pluginSchemas: {},
        // { config, overrides } for the currently selected plugin, derived live from editableConfig whenever the
        // Interface tab becomes active. This is the single piece of state PluginConfigForm edits; it's folded
        // back into editableConfig on save or whenever switching away, so the YAML and Interface tabs never
        // drift out of sync with each other.
        pluginValue: null,
        pluginLoading: false,
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
        return this.selectedPlugin ? this.pluginSchemas[this.selectedPlugin] ?? null : null;
      },
    },
    methods: {
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
      async loadPluginIntoInterface(pluginName) {
        this.pluginLoading = true;
        const schema = await this.ensurePluginSchema(pluginName);
        this.pluginValue = this.derivePluginValueFromYaml(pluginName, schema);
        this.pluginLoading = false;
      },
      async selectPlugin(pluginName) {
        if (pluginName === this.selectedPlugin) return;
        if (this.mode === "interface") this.syncPluginValueIntoYaml();
        this.selectedPlugin = pluginName;
        if (this.mode === "interface") await this.loadPluginIntoInterface(pluginName);
      },
      async setMode(newMode) {
        if (newMode === this.mode) return;
        if (this.mode === "interface") this.syncPluginValueIntoYaml();
        this.mode = newMode;
        if (newMode === "interface" && this.selectedPlugin) await this.loadPluginIntoInterface(this.selectedPlugin);
      },
      editorInit() {
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
            ev.preventDefault();
            this.$refs.aceEditor.getAceInstance().execCommand("find");
            return;
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
        if (this.mode === "interface") this.syncPluginValueIntoYaml();

        this.saved = false;
        this.saving = true;
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
          this.savedTimeout = setTimeout(() => this.saved = false, 3000);
        } catch (e) {
          if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
            this.errors = e.body.errors || ['Error while saving config'];
            this.saving = false;
            return;
          }

          throw e;
        }
      },
    },
  };
</script>

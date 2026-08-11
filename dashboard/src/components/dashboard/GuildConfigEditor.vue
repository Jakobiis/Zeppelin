<template>
  <div v-if="loading">
    Loading...
  </div>
  <div v-else>
    <div v-if="errors.length" class="bg-card border border-border py-2 px-3 rounded-lg shadow-md mb-4">
      <div class="font-semibold text-destructive">Errors:</div>
      <pre v-for="error in errors">{{ error }}</pre>
    </div>

    <div class="bg-card border border-border rounded-lg shadow-md px-6 py-4 flex items-center flex-wrap">
      <h1 class="flex-full md:flex-auto">Config for {{ guild.name }}</h1>
      <button v-if="mode === 'yaml' && !saving" class="flex-none btn-primary" v-on:click="save">
        <span v-if="saved">Saved!</span>
        <span v-else>Save</span>
      </button>
      <div v-if="mode === 'yaml' && saving" class="flex-none btn-secondary">
        Saving...
      </div>
    </div>

    <Tabs class="mt-4">
      <Tab :active="mode === 'yaml'"><a href="javascript:void(0)" v-on:click="mode = 'yaml'">Raw YAML</a></Tab>
      <Tab :active="mode === 'interface'"><a href="javascript:void(0)" v-on:click="mode = 'interface'">Interface</a></Tab>
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
        <ul class="list-none space-y-1">
          <li v-for="plugin in formPlugins" :key="plugin.name">
            <a href="javascript:void(0)"
               class="block px-3 py-1.5 rounded-md text-sm"
               :class="selectedPlugin === plugin.name ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'"
               v-on:click="selectedPlugin = plugin.name">
              {{ plugin.info.prettyName || plugin.name }}
            </a>
          </li>
        </ul>
      </nav>

      <div class="flex-auto min-w-0">
        <p class="text-sm text-muted-foreground mb-4">
          Structured forms are available for plugins as the renderer learns to handle more of their config shape —
          anything it doesn't understand yet falls back to a raw JSON field. Saving here updates the same
          underlying config as the YAML editor above.
        </p>
        <PluginConfigForm
          v-if="selectedPlugin"
          :key="selectedPlugin"
          :guild-id="String($route.params.guildId)"
          :plugin-name="selectedPlugin"
        />
        <div v-else class="text-muted-foreground">Select a plugin from the sidebar.</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import {mapState} from "vuex";
  import {ApiError} from "../../api";
  import { DocsState, GuildState } from "../../store/types";

  import { VAceEditor } from "vue3-ace-editor";

  import "ace-builds/src-noconflict/ext-language_tools";
  import 'ace-builds/src-noconflict/ext-searchbox';
  import "ace-builds/src-noconflict/mode-yaml";
  import "ace-builds/src-noconflict/theme-tomorrow_night";

  import Tab from "../Tab.vue";
  import Tabs from "../Tabs.vue";
  import PluginConfigForm from "./PluginConfigForm.vue";

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
    },
    methods: {
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

<template>
  <div>
    <div class="bg-card border border-border rounded-lg shadow-md px-6 py-4">
      <h3 class="mb-3">Create giveaway</h3>

      <div v-if="createError" class="bg-card border border-destructive/40 border-l-4 border-l-destructive py-2 px-3 rounded-lg text-sm text-destructive mb-3">
        {{ createError }}
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="font-medium text-sm">Prize</label>
          <input type="text" class="field-input mt-1" v-model="form.prize" placeholder="e.g. Discord Nitro" />
        </div>
        <div>
          <label class="font-medium text-sm">Duration</label>
          <input type="text" class="field-input mt-1" v-model="form.duration" placeholder="e.g. 1d, 30m, 6h" />
        </div>
        <div>
          <label class="font-medium text-sm">Winners</label>
          <input type="number" min="1" class="field-input mt-1" v-model.number="form.winners" />
        </div>
        <div>
          <label class="font-medium text-sm">Channel</label>
          <RoleChannelPickerField
            class="mt-1"
            :guild-id="guildId"
            entity-type="channel"
            :model-value="form.channel_id"
            @update:model-value="form.channel_id = $event"
          />
        </div>
        <div>
          <label class="font-medium text-sm">Host</label>
          <input type="text" class="field-input mt-1 font-mono text-sm" v-model="form.host_id" placeholder="User ID — leave blank to use yourself" />
        </div>
        <div v-if="templates.length">
          <label class="font-medium text-sm">Template</label>
          <ComboboxField
            class="mt-1"
            :options="templateOptions"
            :model-value="form.template"
            placeholder="— None —"
            @update:model-value="applyTemplate"
          />
        </div>
        <div>
          <label class="font-medium text-sm">Embed color</label>
          <ColorPickerField class="mt-1" :model-value="form.embed_color" @update:model-value="form.embed_color = $event" />
        </div>
      </div>

      <div class="mt-4">
        <label class="font-medium text-sm">Required roles <span class="text-muted-foreground font-normal">(entrants need ALL of these)</span></label>
        <RoleListField class="mt-1" :guild-id="guildId" :model-value="form.required_role_ids" @update:model-value="form.required_role_ids = $event" />
      </div>
      <div class="mt-4">
        <label class="font-medium text-sm">Bypass roles <span class="text-muted-foreground font-normal">(skip role/message requirements)</span></label>
        <RoleListField class="mt-1" :guild-id="guildId" :model-value="form.bypass_role_ids" @update:model-value="form.bypass_role_ids = $event" />
      </div>
      <div class="mt-4">
        <label class="font-medium text-sm">Blacklisted roles <span class="text-muted-foreground font-normal">(can never enter)</span></label>
        <RoleListField class="mt-1" :guild-id="guildId" :model-value="form.blacklisted_role_ids" @update:model-value="form.blacklisted_role_ids = $event" />
      </div>

      <div class="mt-4">
        <label class="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" class="checkbox" v-model="form.hasMessageRequirement" />
          Require a minimum message count
        </label>
        <div v-if="form.hasMessageRequirement" class="flex items-center gap-2 mt-2">
          <ComboboxField class="w-40" :options="periodOptions" :model-value="form.messagePeriod" @update:model-value="form.messagePeriod = $event" />
          <input type="number" min="1" class="field-input w-28" v-model.number="form.messageCount" />
          <span class="text-sm text-muted-foreground">messages</span>
        </div>
      </div>

      <button class="btn-primary mt-4" :disabled="creating" @click="submit">
        {{ creating ? "Creating…" : "Create Giveaway" }}
      </button>
    </div>

    <div class="bg-card border border-border rounded-lg shadow-md px-6 py-4 mt-4">
      <h3 class="mb-3">Running</h3>
      <div v-if="!running.length" class="text-sm text-muted-foreground">No running giveaways</div>
      <div v-for="giveaway in running" :key="giveaway.id" class="border-t border-border first:border-t-0 py-3 flex items-center flex-wrap gap-3">
        <div class="flex-auto min-w-0">
          <div class="font-medium">#{{ giveaway.id }} {{ giveaway.prize }}</div>
          <div class="text-sm text-muted-foreground">
            channel {{ giveaway.channel_id }} · host {{ giveaway.host_id }} · {{ giveaway.entry_count }} entries · {{ giveaway.winner_count }} winner(s) · ends {{ formatDate(giveaway.ends_at) }}
          </div>
        </div>
        <div class="flex-none flex gap-2">
          <button type="button" class="btn-secondary" @click="endGiveaway(giveaway)">End now</button>
          <button type="button" class="btn-secondary" @click="cancelGiveaway(giveaway)">Cancel</button>
        </div>
      </div>
    </div>

    <div class="bg-card border border-border rounded-lg shadow-md px-6 py-4 mt-4">
      <h3 class="mb-3">Recently finished</h3>
      <div v-if="!recentlyFinished.length" class="text-sm text-muted-foreground">No finished giveaways yet</div>
      <div v-for="giveaway in recentlyFinished" :key="giveaway.id" class="border-t border-border first:border-t-0 py-3 flex items-center flex-wrap gap-3">
        <div class="flex-auto min-w-0">
          <div class="font-medium">#{{ giveaway.id }} {{ giveaway.prize }}</div>
          <div class="text-sm text-muted-foreground">
            <span v-if="giveaway.status === 'cancelled'">cancelled</span>
            <span v-else-if="!giveaway.winner_ids.length">ended, no eligible entries</span>
            <span v-else>won by {{ giveaway.winner_ids.join(', ') }}</span>
            · ended {{ formatDate(giveaway.ended_at) }}
          </div>
        </div>
        <div class="flex-none" v-if="giveaway.status === 'ended'">
          <button type="button" class="btn-secondary" @click="rerollGiveaway(giveaway)">Reroll</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import moment from "moment";
import { mapState } from "vuex";
import { ApiError } from "../../api";
import { GiveawayApiItem, GiveawayTemplate, GuildState } from "../../store/types";
import ColorPickerField from "./ColorPickerField.vue";
import ComboboxField from "./ComboboxField.vue";
import RoleChannelPickerField from "./RoleChannelPickerField.vue";
import RoleListField from "./RoleListField.vue";

const PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "allTime", label: "All-time" },
];

function defaultForm() {
  return {
    prize: "",
    duration: "",
    winners: 1,
    channel_id: null as string | null,
    host_id: "",
    template: null as string | null,
    embed_color: null as number | null,
    required_role_ids: [] as (string | null)[],
    bypass_role_ids: [] as (string | null)[],
    blacklisted_role_ids: [] as (string | null)[],
    hasMessageRequirement: false,
    messagePeriod: "daily",
    messageCount: 100,
  };
}

export default {
  components: { RoleChannelPickerField, ColorPickerField, ComboboxField, RoleListField },

  props: {
    guildId: { type: String, required: true },
  },

  data() {
    return {
      form: defaultForm(),
      creating: false,
      createError: null as string | null,
      periodOptions: PERIOD_OPTIONS,
    };
  },

  computed: {
    ...mapState("guilds", {
      allGiveaways(state: GuildState): GiveawayApiItem[] {
        return state.giveaways[this.guildId] || [];
      },
      templates(state: GuildState): GiveawayTemplate[] {
        return state.giveawayTemplates[this.guildId] || [];
      },
    }),

    running() {
      return this.allGiveaways.filter((g: GiveawayApiItem) => g.status === "running");
    },

    recentlyFinished() {
      return this.allGiveaways.filter((g: GiveawayApiItem) => g.status !== "running");
    },

    templateOptions() {
      return this.templates.map((t: GiveawayTemplate) => ({ value: t.name, label: t.name }));
    },
  },

  async mounted() {
    await Promise.all([
      this.$store.dispatch("guilds/loadGiveaways", this.guildId).catch(() => {}),
      this.$store.dispatch("guilds/loadGiveawayTemplates", this.guildId).catch(() => {}),
    ]);

    // Same auto-apply-"default" behavior as -giveaway start (see GiveawayStartCmd.ts) — prefills the form so
    // staff don't have to pick it from the dropdown every time. Still just a prefill: changing any field
    // afterwards overrides it same as picking a different template would.
    if (this.templates.some((t: GiveawayTemplate) => t.name === "default")) {
      this.applyTemplate("default");
    }
  },

  methods: {
    formatDate(dateStr: string | null) {
      if (!dateStr) return "";
      return moment.utc(dateStr).local().format("YYYY-MM-DD HH:mm");
    },

    // Prefills channel/color/bypass/blacklisted from the chosen template, same as `-template` on the chat
    // command — explicit edits after this still win since it's a one-time prefill, not a binding.
    applyTemplate(templateName: string | null) {
      this.form.template = templateName;
      const template = this.templates.find((t: GiveawayTemplate) => t.name === templateName);
      if (!template) return;
      if (template.channel_id) this.form.channel_id = template.channel_id;
      if (template.embed_color != null) this.form.embed_color = template.embed_color;
      if (template.bypass_roles?.length) this.form.bypass_role_ids = [...template.bypass_roles];
      if (template.blacklisted_roles?.length) this.form.blacklisted_role_ids = [...template.blacklisted_roles];
    },

    async submit() {
      this.createError = null;

      if (!this.form.prize.trim()) {
        this.createError = "Prize is required.";
        return;
      }
      if (!this.form.duration.trim()) {
        this.createError = "Duration is required (e.g. 1d, 30m, 6h).";
        return;
      }
      if (!this.form.channel_id) {
        this.createError = "Channel is required.";
        return;
      }

      this.creating = true;
      try {
        await this.$store.dispatch("guilds/createGiveaway", {
          guildId: this.guildId,
          giveaway: {
            prize: this.form.prize.trim(),
            duration: this.form.duration.trim(),
            winners: this.form.winners,
            channel_id: this.form.channel_id,
            host_id: this.form.host_id.trim() || undefined,
            template: this.form.template || undefined,
            embed_color: this.form.embed_color,
            required_role_ids: this.form.required_role_ids.filter((id) => id),
            bypass_role_ids: this.form.bypass_role_ids.filter((id) => id),
            blacklisted_role_ids: this.form.blacklisted_role_ids.filter((id) => id),
            message_requirement: this.form.hasMessageRequirement
              ? { period: this.form.messagePeriod, count: this.form.messageCount }
              : null,
          },
        });
        this.form = defaultForm();
      } catch (err) {
        this.createError = err instanceof ApiError && err.body?.error ? err.body.error : "Failed to create giveaway.";
      } finally {
        this.creating = false;
      }
    },

    async endGiveaway(giveaway: GiveawayApiItem) {
      if (!window.confirm(`End giveaway #${giveaway.id} (${giveaway.prize}) now and pick winner(s)?`)) return;
      await this.$store.dispatch("guilds/endGiveaway", { guildId: this.guildId, giveawayId: giveaway.id });
    },

    async cancelGiveaway(giveaway: GiveawayApiItem) {
      if (!window.confirm(`Cancel giveaway #${giveaway.id} (${giveaway.prize})? No winners will be picked.`)) return;
      await this.$store.dispatch("guilds/cancelGiveaway", { guildId: this.guildId, giveawayId: giveaway.id });
    },

    async rerollGiveaway(giveaway: GiveawayApiItem) {
      if (!window.confirm(`Reroll winner(s) for giveaway #${giveaway.id} (${giveaway.prize})?`)) return;
      await this.$store.dispatch("guilds/rerollGiveaway", { guildId: this.guildId, giveawayId: giveaway.id });
    },
  },
};
</script>

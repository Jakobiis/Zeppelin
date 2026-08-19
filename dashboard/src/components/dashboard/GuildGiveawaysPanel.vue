<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hosted giveaways</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalGiveaways }}</div>
    </div>
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Claimed prizes</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.claimedPrizes }}</div>
    </div>
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total entries</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalEntries }}</div>
    </div>
  </div>

  <div class="columns-1 sm:columns-2 xl:columns-3 gap-4">
    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Create giveaway</h3>
        <div
          v-if="createError"
          class="bg-card border border-destructive/40 border-l-4 border-l-destructive py-2 px-3 rounded-lg text-sm text-destructive mb-3"
        >
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
            <input
              type="text"
              class="field-input mt-1 font-mono text-sm"
              v-model="form.host_id"
              placeholder="User ID — leave blank to use yourself"
            />
          </div>
          <div class="sm:col-span-2">
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" class="checkbox" v-model="form.staff_held" />
              Prize is staff-held
            </label>
            <input
              v-if="form.staff_held"
              type="text"
              class="field-input mt-2 font-mono text-sm"
              v-model="form.holder_id"
              placeholder="User ID of the staff member holding the prize"
            />
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
            <ColorPickerField
              class="mt-1"
              :model-value="form.embed_color"
              @update:model-value="form.embed_color = $event"
            />
          </div>
        </div>

        <div class="mt-4" v-if="visibleRoleFields.includes('required_role_ids')">
          <div class="flex items-center justify-between gap-2">
            <label class="font-medium text-sm"
              >Required roles <span class="text-muted-foreground font-normal">(entrants need ALL of these)</span></label
            >
            <button type="button" class="btn-remove shrink-0" @click="removeRoleField('required_role_ids')">Remove</button>
          </div>
          <RoleListField
            class="mt-1"
            :guild-id="guildId"
            :model-value="form.required_role_ids"
            @update:model-value="form.required_role_ids = $event"
          />
        </div>
        <div class="mt-4" v-if="visibleRoleFields.includes('bypass_role_ids')">
          <div class="flex items-center justify-between gap-2">
            <label class="font-medium text-sm"
              >Bypass roles <span class="text-muted-foreground font-normal">(skip role/message requirements)</span></label
            >
            <button type="button" class="btn-remove shrink-0" @click="removeRoleField('bypass_role_ids')">Remove</button>
          </div>
          <RoleListField
            class="mt-1"
            :guild-id="guildId"
            :model-value="form.bypass_role_ids"
            @update:model-value="form.bypass_role_ids = $event"
          />
        </div>
        <div class="mt-4" v-if="visibleRoleFields.includes('blacklisted_role_ids')">
          <div class="flex items-center justify-between gap-2">
            <label class="font-medium text-sm"
              >Blacklisted roles <span class="text-muted-foreground font-normal">(can never enter)</span></label
            >
            <button type="button" class="btn-remove shrink-0" @click="removeRoleField('blacklisted_role_ids')">Remove</button>
          </div>
          <RoleListField
            class="mt-1"
            :guild-id="guildId"
            :model-value="form.blacklisted_role_ids"
            @update:model-value="form.blacklisted_role_ids = $event"
          />
        </div>
        <div class="mt-4" v-if="hiddenRoleFieldOptions.length">
          <ComboboxField
            class="max-w-xs"
            input-class="btn-add"
            reset-on-select
            placeholder="+ Add role field…"
            :options="hiddenRoleFieldOptions"
            :model-value="null"
            @update:model-value="(key) => addRoleField(String(key))"
          />
        </div>
        <div class="mt-4">
          <label class="font-medium text-sm"
            >Extra entries
            <span class="text-muted-foreground font-normal"
              >(bonus entries per role — highest applicable, not stacked)</span
            ></label
          >
          <RoleEntryMapField
            class="mt-1"
            :guild-id="guildId"
            :model-value="form.extra_entries"
            @update:model-value="form.extra_entries = $event"
          />
        </div>

        <div class="mt-4">
          <label class="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" class="checkbox" v-model="form.hasMessageRequirement" />
            Require a message count range
          </label>
          <div v-if="form.hasMessageRequirement" class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <ComboboxField
              class="w-40"
              :options="periodOptions"
              placeholder="— Select period —"
              :model-value="form.messagePeriod"
              @update:model-value="form.messagePeriod = $event"
            />
            <input
              type="number"
              min="0"
              class="field-input w-full sm:w-24"
              placeholder="Min"
              :value="form.messageMin ?? ''"
              @input="form.messageMin = numberOrNull(($event.target as HTMLInputElement).value)"
            />
            <span class="text-sm text-muted-foreground">to</span>
            <input
              type="number"
              min="0"
              class="field-input w-full sm:w-36"
              placeholder="Max (optional)"
              :value="form.messageMax ?? ''"
              @input="form.messageMax = numberOrNull(($event.target as HTMLInputElement).value)"
            />
            <span class="text-sm text-muted-foreground">messages</span>
          </div>
        </div>

        <div class="mt-4">
          <label class="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" class="checkbox" v-model="form.hasActivityRequirement" />
            Require an activity points range
          </label>
          <div v-if="form.hasActivityRequirement" class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              min="0"
              class="field-input w-full sm:w-24"
              placeholder="Min"
              :value="form.activityMin ?? ''"
              @input="form.activityMin = numberOrNull(($event.target as HTMLInputElement).value)"
            />
            <span class="text-sm text-muted-foreground">to</span>
            <input
              type="number"
              min="0"
              class="field-input w-full sm:w-36"
              placeholder="Max (optional)"
              :value="form.activityMax ?? ''"
              @input="form.activityMax = numberOrNull(($event.target as HTMLInputElement).value)"
            />
            <span class="text-sm text-muted-foreground">activity points</span>
          </div>
        </div>

        <div class="mt-4">
          <label class="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" class="checkbox" v-model="form.hasCoinsRequirement" />
            Require a coin balance range
          </label>
          <div v-if="form.hasCoinsRequirement" class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              min="0"
              class="field-input w-full sm:w-24"
              placeholder="Min"
              :value="form.coinsMin ?? ''"
              @input="form.coinsMin = numberOrNull(($event.target as HTMLInputElement).value)"
            />
            <span class="text-sm text-muted-foreground">to</span>
            <input
              type="number"
              min="0"
              class="field-input w-full sm:w-36"
              placeholder="Max (optional)"
              :value="form.coinsMax ?? ''"
              @input="form.coinsMax = numberOrNull(($event.target as HTMLInputElement).value)"
            />
            <span class="text-sm text-muted-foreground">coins</span>
          </div>
        </div>

        <button class="btn-primary mt-4 mb-4" :disabled="creating" @click="submit">
          {{ creating ? "Creating…" : "Create Giveaway" }}
        </button>
    </div>

    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Giveaway contributor</h3>
      <input
        type="text"
        class="field-input"
        placeholder="Username or user ID…"
        :value="contributorLookupQuery"
        @input="onContributorLookupInput(($event.target as HTMLInputElement).value)"
      />
      <div v-if="contributorLookupResults.length" class="mt-2 border border-border rounded-lg overflow-hidden">
        <button
          v-for="m in contributorLookupResults"
          :key="m.id"
          type="button"
          class="block w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          @click="selectContributorUser(m)"
        >
          {{ m.displayName }} <span class="text-xs text-muted-foreground font-mono">{{ m.id }}</span>
        </button>
      </div>

      <div v-if="giveawayContributor" class="mt-4 border-t border-border pt-4">
        <div class="font-semibold">{{ giveawayContributor.member?.displayName ?? giveawayContributor.userId }}</div>
        <div class="text-xs text-muted-foreground font-mono">{{ giveawayContributor.userId }}</div>

        <div v-if="!giveawayContributor.configured" class="mt-2 text-sm text-muted-foreground">
          No contributor role is configured — set <code class="font-mono">contributor_role_id</code> in this plugin's
          YAML config first.
        </div>
        <template v-else>
          <div class="mt-2 text-sm" :class="giveawayContributor.hasRole ? 'text-green-500' : 'text-muted-foreground'">
            {{ giveawayContributor.hasRole ? "Has the contributor role" : "Doesn't have the contributor role" }}
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-secondary"
              :disabled="giveawayContributor.hasRole || contributorUpdating"
              @click="setContributorRole(true)"
            >
              Grant
            </button>
            <button
              type="button"
              class="btn-secondary"
              :disabled="!giveawayContributor.hasRole || contributorUpdating"
              @click="setContributorRole(false)"
            >
              Revoke
            </button>
          </div>
        </template>
      </div>
    </div>

    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Running</h3>
      <div v-if="!running.length" class="text-sm text-muted-foreground">No running giveaways</div>
      <div class="flex flex-col gap-3">
        <div
          v-for="giveaway in running"
          :key="giveaway.id"
          class="border border-border rounded-lg p-3 flex flex-col gap-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 break-words font-semibold">
              {{ giveaway.prize }} <span class="text-xs font-normal text-muted-foreground">{{ giveaway.id }}</span>
            </div>
            <span class="flex-none text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary"
              >Running</span
            >
          </div>
          <div class="text-sm text-muted-foreground">
            channel {{ giveaway.channel_id }} · host {{ memberName(giveaway.host_id) }}
            <template v-if="giveaway.holder_id"> · held by {{ memberName(giveaway.holder_id) }}</template>
          </div>
          <div class="text-sm text-muted-foreground">
            {{ giveaway.entry_count }} entries · {{ giveaway.winner_count }} winner(s) · ends
            {{ formatDate(giveaway.ends_at) }}
          </div>
          <div class="mt-1 flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" @click="promptEnd(giveaway)">End now</button>
            <button type="button" class="btn-secondary" @click="promptCancel(giveaway)">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Recently finished</h3>
      <input
        type="text"
        class="field-input mb-3"
        placeholder="Search by prize, host username, or host user ID…"
        :value="finishedSearchInput"
        @input="onFinishedSearchInput(($event.target as HTMLInputElement).value)"
      />
      <div v-if="finishedLoading" class="text-sm text-muted-foreground">Loading…</div>
      <div v-else-if="!finishedGiveaways.length" class="text-sm text-muted-foreground">
        {{ finishedSearchInput.trim() ? "No finished giveaways match your search." : "No finished giveaways yet" }}
      </div>
      <div class="flex flex-col gap-3">
        <div
          v-for="giveaway in finishedGiveaways"
          :key="giveaway.id"
          class="border border-border rounded-lg p-3 flex flex-col gap-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 break-words font-semibold">
              {{ giveaway.prize }} <span class="text-xs font-normal text-muted-foreground">{{ giveaway.id }}</span>
            </div>
            <span
              class="flex-none text-xs font-medium px-2 py-0.5 rounded-full"
              :class="
                giveaway.status === 'cancelled'
                  ? 'bg-destructive/10 text-destructive'
                  : currentWinnerIds(giveaway).length
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-muted text-muted-foreground'
              "
            >
              {{
                giveaway.status === "cancelled"
                  ? "Cancelled"
                  : currentWinnerIds(giveaway).length
                    ? "Ended"
                    : "No winners"
              }}
            </span>
          </div>
          <div class="text-sm text-muted-foreground">
            host {{ memberName(giveaway.host_id) }}
            <template v-if="giveaway.holder_id"> · held by {{ memberName(giveaway.holder_id) }}</template>
          </div>
          <div class="text-sm">
            <span v-if="giveaway.status === 'cancelled'" class="text-muted-foreground">No winners were picked.</span>
            <span v-else-if="!currentWinnerIds(giveaway).length" class="text-muted-foreground"
              >Ended, no eligible entries.</span
            >
            <span v-else>Won by {{ currentWinnerIds(giveaway).map(memberName).join(", ") }}</span>
          </div>
          <div class="text-xs text-muted-foreground">ended {{ formatDate(giveaway.ended_at) }}</div>
          <div class="mt-1" v-if="giveaway.status === 'ended'">
            <button type="button" class="btn-secondary" @click="promptReroll(giveaway)">Reroll</button>
          </div>
        </div>
      </div>
      <div v-if="finishedTotalPages > 1" class="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          class="btn-secondary"
          :disabled="finishedPage <= 1"
          @click="goToFinishedPage(finishedPage - 1)"
        >
          Previous
        </button>
        <span class="text-xs text-muted-foreground"
          >Page {{ finishedPage }} of {{ finishedTotalPages }} ({{ finishedTotal }} total)</span
        >
        <button
          type="button"
          class="btn-secondary"
          :disabled="finishedPage >= finishedTotalPages"
          @click="goToFinishedPage(finishedPage + 1)"
        >
          Next
        </button>
      </div>
    </div>
  </div>

  <ConfirmModal
    :open="!!confirmState"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-label="confirmLabel"
    :selection-options="rerollWinnerOptions"
    selection-label="Replace these winner(s)"
    @confirm="onConfirmModal"
    @cancel="confirmState = null"
  />

  <div
    v-if="toastMessage"
    class="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm max-w-sm"
  >
    {{ toastMessage }}
  </div>
</template>

<script lang="ts">
import moment from "moment";
import { mapState } from "vuex";
import { ApiError } from "../../api";
import {
  FinishedGiveawaysPage,
  GiveawayAnalytics,
  GiveawayApiItem,
  GiveawayContributorStatus,
  GiveawayMemberInfo,
  GiveawayTemplate,
  GuildState,
} from "../../store/types";
import ColorPickerField from "./ColorPickerField.vue";
import ComboboxField from "./ComboboxField.vue";
import ConfirmModal from "./ConfirmModal.vue";
import RoleChannelPickerField from "./RoleChannelPickerField.vue";
import RoleEntryMapField, { RoleEntryMapRow } from "./RoleEntryMapField.vue";
import RoleListField from "./RoleListField.vue";

const PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "allTime", label: "All-time" },
];

const FINISHED_PAGE_SIZE = 15;

// Required/bypass/blacklisted roles start hidden in the create form (see visibleRoleFields) — most giveaways use
// none of them, so showing all three RoleListFields unconditionally was mostly empty space.
const ROLE_FIELD_DEFS: { key: "required_role_ids" | "bypass_role_ids" | "blacklisted_role_ids"; label: string }[] = [
  { key: "required_role_ids", label: "Required roles" },
  { key: "bypass_role_ids", label: "Bypass roles" },
  { key: "blacklisted_role_ids", label: "Blacklisted roles" },
];

type ConfirmState = { type: "end" | "cancel" | "reroll"; giveaway: GiveawayApiItem };

function defaultForm() {
  return {
    prize: "",
    duration: "",
    winners: 1,
    channel_id: null as string | null,
    host_id: "",
    staff_held: false,
    holder_id: "",
    template: null as string | null,
    embed_color: null as number | null,
    required_role_ids: [] as (string | null)[],
    bypass_role_ids: [] as (string | null)[],
    blacklisted_role_ids: [] as (string | null)[],
    extra_entries: [] as RoleEntryMapRow[],
    hasMessageRequirement: false,
    messagePeriod: null as string | null,
    messageMin: null as number | null,
    messageMax: null as number | null,
    hasActivityRequirement: false,
    activityMin: null as number | null,
    activityMax: null as number | null,
    hasCoinsRequirement: false,
    coinsMin: null as number | null,
    coinsMax: null as number | null,
  };
}

export default {
  components: {
    RoleChannelPickerField,
    ColorPickerField,
    ComboboxField,
    RoleListField,
    RoleEntryMapField,
    ConfirmModal,
  },

  props: {
    guildId: { type: String, required: true },
  },

  data() {
    return {
      form: defaultForm(),
      creating: false,
      createError: null as string | null,
      periodOptions: PERIOD_OPTIONS,
      confirmState: null as ConfirmState | null,
      toastMessage: null as string | null,
      toastTimeout: null as ReturnType<typeof setTimeout> | null,
      finishedSearchInput: "",
      finishedPage: 1,
      finishedSearchTimeout: null as ReturnType<typeof setTimeout> | null,
      finishedLoading: false,
      visibleRoleFields: [] as string[],
      contributorLookupQuery: "",
      contributorLookupResults: [] as GiveawayMemberInfo[],
      contributorLookupTimeout: null as ReturnType<typeof setTimeout> | null,
      contributorUpdating: false,
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
      memberNames(state: GuildState): { [userId: string]: GiveawayMemberInfo } {
        return state.giveawayMemberNames[this.guildId] || {};
      },
      analytics(state: GuildState): GiveawayAnalytics {
        return state.giveawayAnalytics[this.guildId] || { totalGiveaways: 0, claimedPrizes: 0, totalEntries: 0 };
      },
      finishedGiveawaysPage(state: GuildState): FinishedGiveawaysPage | null {
        return state.finishedGiveaways[this.guildId] || null;
      },
      giveawayContributor(state: GuildState): GiveawayContributorStatus | null {
        return state.giveawayContributor[this.guildId] || null;
      },
    }),

    hiddenRoleFieldOptions() {
      return ROLE_FIELD_DEFS.filter((d) => !this.visibleRoleFields.includes(d.key)).map((d) => ({ value: d.key, label: d.label }));
    },

    // The backend's /giveaways route is running-only now — "Recently finished" is its own paginated/searchable
    // request (see finishedGiveawaysPage above) since it needs to reach the guild's entire finished history, not
    // just whatever's already loaded here.
    running() {
      return this.allGiveaways;
    },

    finishedGiveaways() {
      return this.finishedGiveawaysPage?.items ?? [];
    },

    finishedTotal() {
      return this.finishedGiveawaysPage?.total ?? 0;
    },

    finishedTotalPages() {
      return Math.max(1, Math.ceil(this.finishedTotal / FINISHED_PAGE_SIZE));
    },

    templateOptions() {
      return this.templates.map((t: GiveawayTemplate) => ({ value: t.name, label: t.name }));
    },

    confirmTitle() {
      if (!this.confirmState) return "";
      return { end: "End giveaway", cancel: "Cancel giveaway", reroll: "Reroll giveaway" }[this.confirmState.type];
    },

    confirmMessage() {
      const state = this.confirmState;
      if (!state) return "";
      const label = `${state.giveaway.prize} (${state.giveaway.id})`;
      if (state.type === "end") return `End giveaway ${label} now and pick winner(s)?`;
      if (state.type === "cancel") return `Cancel giveaway ${label}? No winners will be picked.`;
      return `Reroll winner(s) for giveaway ${label}?`;
    },

    confirmLabel() {
      if (!this.confirmState) return "Confirm";
      return { end: "End now", cancel: "Cancel giveaway", reroll: "Reroll" }[this.confirmState.type];
    },

    rerollWinnerOptions() {
      if (this.confirmState?.type !== "reroll") return [];
      return this.currentWinnerIds(this.confirmState.giveaway).map((id) => ({ value: id, label: this.memberName(id) }));
    },
  },

  async mounted() {
    await Promise.all([
      this.$store.dispatch("guilds/loadGiveaways", this.guildId).catch(() => {}),
      this.$store.dispatch("guilds/loadGiveawayTemplates", this.guildId).catch(() => {}),
      this.$store.dispatch("guilds/loadGiveawayAnalytics", this.guildId).catch(() => {}),
      this.fetchFinishedPage(),
    ]);

    // Same auto-apply-"default" behavior as -giveaway start (see GiveawayStartCmd.ts) — prefills the form so
    // staff don't have to pick it from the dropdown every time. Still just a prefill: changing any field
    // afterwards overrides it same as picking a different template would.
    if (this.templates.some((t: GiveawayTemplate) => t.name === "default")) {
      this.applyTemplate("default");
    }

    this.loadMemberNamesFor(this.allGiveaways);
  },

  methods: {
    formatDate(dateStr: string | null) {
      if (!dateStr) return "";
      return moment.utc(dateStr).local().format("YYYY-MM-DD HH:mm");
    },

    numberOrNull(raw: string): number | null {
      if (raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    },

    memberName(id: string): string {
      const member = this.memberNames[id];
      return member ? member.displayName : id;
    },

    addRoleField(key: string) {
      if (!this.visibleRoleFields.includes(key)) this.visibleRoleFields.push(key);
    },

    removeRoleField(key: "required_role_ids" | "bypass_role_ids" | "blacklisted_role_ids") {
      this.visibleRoleFields = this.visibleRoleFields.filter((k) => k !== key);
      this.form[key] = [];
    },

    loadMemberNamesFor(giveaways: GiveawayApiItem[]) {
      const ids = giveaways.flatMap((g) => (g.holder_id ? [g.host_id, g.holder_id, ...g.winner_ids] : [g.host_id, ...g.winner_ids]));
      this.$store.dispatch("guilds/loadGiveawayMemberNames", { guildId: this.guildId, ids }).catch(() => {});
    },

    // Fetches "Recently finished" at the current search/page — called on mount, on search input (debounced, see
    // onFinishedSearchInput), on page change, and after End/Cancel/Reroll so the list reflects the change.
    async fetchFinishedPage() {
      this.finishedLoading = true;
      try {
        await this.$store.dispatch("guilds/loadFinishedGiveaways", {
          guildId: this.guildId,
          search: this.finishedSearchInput.trim(),
          page: this.finishedPage,
          pageSize: FINISHED_PAGE_SIZE,
        });
        this.loadMemberNamesFor(this.finishedGiveaways);
      } finally {
        this.finishedLoading = false;
      }
    },

    onFinishedSearchInput(value: string) {
      this.finishedSearchInput = value;
      this.finishedPage = 1;
      if (this.finishedSearchTimeout) clearTimeout(this.finishedSearchTimeout);
      this.finishedSearchTimeout = setTimeout(() => this.fetchFinishedPage(), 300);
    },

    goToFinishedPage(page: number) {
      if (page < 1 || page > this.finishedTotalPages || page === this.finishedPage) return;
      this.finishedPage = page;
      this.fetchFinishedPage();
    },

    // winner_ids is append-only full history (every reroll adds to it, never removes) — this is who currently
    // still has the prize, i.e. winner_ids minus anyone whose claim window expired and was rerolled away.
    currentWinnerIds(giveaway: GiveawayApiItem): string[] {
      return giveaway.winner_ids.filter((id) => !giveaway.expired_winner_ids.includes(id));
    },

    // Prefills channel/color/bypass/blacklisted from the chosen template, same as `-template` on the chat
    // command — explicit edits after this still win since it's a one-time prefill, not a binding.
    applyTemplate(templateName: string | null) {
      this.form.template = templateName;
      const template = this.templates.find((t: GiveawayTemplate) => t.name === templateName);
      if (!template) return;
      if (template.channel_id) this.form.channel_id = template.channel_id;
      if (template.embed_color != null) this.form.embed_color = template.embed_color;
      if (template.bypass_roles?.length) {
        this.form.bypass_role_ids = [...template.bypass_roles];
        this.addRoleField("bypass_role_ids");
      }
      if (template.blacklisted_roles?.length) {
        this.form.blacklisted_role_ids = [...template.blacklisted_roles];
        this.addRoleField("blacklisted_role_ids");
      }
      if (template.extra_entries && Object.keys(template.extra_entries).length) {
        this.form.extra_entries = Object.entries(template.extra_entries).map(([role_id, bonus]) => ({
          role_id,
          bonus,
        }));
      }
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
      if (this.form.hasMessageRequirement && (!this.form.messagePeriod || this.form.messageMin == null)) {
        this.createError = "Pick a period and minimum for the message requirement, or untick it.";
        return;
      }
      if (this.form.hasActivityRequirement && this.form.activityMin == null) {
        this.createError = "Enter a minimum for the activity points requirement, or untick it.";
        return;
      }
      if (this.form.hasCoinsRequirement && this.form.coinsMin == null) {
        this.createError = "Enter a minimum for the coins requirement, or untick it.";
        return;
      }
      if (this.form.staff_held && !this.form.holder_id.trim()) {
        this.createError = "Enter the holder's user ID, or untick staff-held.";
        return;
      }
      for (const [label, min, max] of [
        ["Message", this.form.messageMin, this.form.messageMax],
        ["Activity points", this.form.activityMin, this.form.activityMax],
        ["Coins", this.form.coinsMin, this.form.coinsMax],
      ] as const) {
        if (max != null && min != null && max < min) {
          this.createError = `${label} max can't be lower than min.`;
          return;
        }
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
            staff_held: this.form.staff_held,
            holder_id: this.form.staff_held ? this.form.holder_id.trim() : undefined,
            template: this.form.template || undefined,
            embed_color: this.form.embed_color,
            required_role_ids: this.form.required_role_ids.filter((id) => id),
            bypass_role_ids: this.form.bypass_role_ids.filter((id) => id),
            blacklisted_role_ids: this.form.blacklisted_role_ids.filter((id) => id),
            extra_entries: Object.fromEntries(
              this.form.extra_entries
                .filter((row: RoleEntryMapRow) => row.role_id)
                .map((row: RoleEntryMapRow) => [row.role_id, row.bonus]),
            ),
            message_requirement: this.form.hasMessageRequirement
              ? { period: this.form.messagePeriod, min: this.form.messageMin, max: this.form.messageMax }
              : null,
            activity_requirement: this.form.hasActivityRequirement
              ? { min: this.form.activityMin, max: this.form.activityMax }
              : null,
            coins_requirement: this.form.hasCoinsRequirement
              ? { min: this.form.coinsMin, max: this.form.coinsMax }
              : null,
          },
        });
        this.form = defaultForm();
        this.visibleRoleFields = [];
      } catch (err) {
        this.createError = err instanceof ApiError && err.body?.error ? err.body.error : "Failed to create giveaway.";
      } finally {
        this.creating = false;
      }
    },

    promptEnd(giveaway: GiveawayApiItem) {
      this.confirmState = { type: "end", giveaway };
    },

    promptCancel(giveaway: GiveawayApiItem) {
      this.confirmState = { type: "cancel", giveaway };
    },

    promptReroll(giveaway: GiveawayApiItem) {
      this.confirmState = { type: "reroll", giveaway };
    },

    async onConfirmModal({ selectedValues }: { amount: number | undefined; selectedValues: string[] }) {
      const state = this.confirmState;
      if (!state) return;
      this.confirmState = null;

      if (state.type === "end") {
        await this.$store.dispatch("guilds/endGiveaway", { guildId: this.guildId, giveawayId: state.giveaway.id });
        await this.fetchFinishedPage();
      } else if (state.type === "cancel") {
        await this.$store.dispatch("guilds/cancelGiveaway", { guildId: this.guildId, giveawayId: state.giveaway.id });
        await this.fetchFinishedPage();
      } else {
        if (selectedValues.length === 0) {
          this.showToast("Select at least one winner to reroll.");
          return;
        }
        const result = await this.$store.dispatch("guilds/rerollGiveaway", {
          guildId: this.guildId,
          giveawayId: state.giveaway.id,
          replaceWinnerIds: selectedValues,
        });
        await this.fetchFinishedPage();
        if (result?.newWinnerCount === 0) {
          this.showToast(`No other eligible entrants to reroll ${state.giveaway.prize} to.`);
        }
      }
    },

    showToast(text: string) {
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastMessage = text;
      this.toastTimeout = setTimeout(() => {
        this.toastMessage = null;
        this.toastTimeout = null;
      }, 4000);
    },

    onContributorLookupInput(value: string) {
      this.contributorLookupQuery = value;
      if (this.contributorLookupTimeout) clearTimeout(this.contributorLookupTimeout);
      if (!value.trim()) {
        this.contributorLookupResults = [];
        return;
      }
      this.contributorLookupTimeout = setTimeout(async () => {
        try {
          this.contributorLookupResults = await this.$store.dispatch("guilds/lookupGiveawayMembers", {
            guildId: this.guildId,
            query: value.trim(),
          });
        } catch {
          this.contributorLookupResults = [];
        }
      }, 300);
    },

    async selectContributorUser(member: GiveawayMemberInfo) {
      this.contributorLookupQuery = "";
      this.contributorLookupResults = [];
      await this.$store
        .dispatch("guilds/loadGiveawayContributorStatus", { guildId: this.guildId, userId: member.id })
        .catch(() => {});
    },

    async setContributorRole(grant: boolean) {
      if (!this.giveawayContributor) return;
      this.contributorUpdating = true;
      try {
        await this.$store.dispatch("guilds/setGiveawayContributorRole", {
          guildId: this.guildId,
          userId: this.giveawayContributor.userId,
          member: this.giveawayContributor.member,
          grant,
        });
        this.showToast(grant ? "Contributor role granted." : "Contributor role revoked.");
      } catch (err) {
        this.showToast(err instanceof ApiError && err.body?.error ? err.body.error : "Failed to update the contributor role.");
      } finally {
        this.contributorUpdating = false;
      }
    },
  },
};
</script>

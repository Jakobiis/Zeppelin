<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Messages today</div>
      <div class="mt-1 text-2xl font-semibold">{{ summary.totalToday.toLocaleString() }}</div>
    </div>
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total messages</div>
      <div class="mt-1 text-2xl font-semibold">{{ summary.totalAllTimeMessages.toLocaleString() }}</div>
    </div>
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tracked users</div>
      <div class="mt-1 text-2xl font-semibold">{{ summary.totalTrackedUsers.toLocaleString() }}</div>
    </div>
  </div>

  <div class="grid min-w-0 items-start gap-4 xl:grid-cols-3">
    <div class="min-w-0 flex flex-col gap-4">
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Look up a user</h3>
      <input
        type="text"
        class="field-input"
        placeholder="Username or user ID…"
        :value="lookupQuery"
        @input="onLookupInput(($event.target as HTMLInputElement).value)"
      />
      <div v-if="lookupResults.length" class="mt-2 border border-border rounded-lg overflow-hidden">
        <button
          v-for="m in lookupResults"
          :key="m.id"
          type="button"
          class="block w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          @click="selectUser(m)"
        >
          <MemberInline :avatar="m.avatar" :display-name="m.displayName" :id="m.id" />
        </button>
      </div>

      <div v-if="selectedUser" class="mt-4 border-t border-border pt-4">
        <MemberInline
          :avatar="selectedUser.member?.avatar ?? null"
          :display-name="selectedUser.member?.displayName ?? selectedUser.userId"
          :id="selectedUser.userId"
          :size="36"
        />

        <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
          <button
            v-for="p in periods"
            :key="p.value"
            type="button"
            class="text-left rounded-lg px-2 py-1 transition-colors"
            :class="adjustPeriod === p.value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
            @click="adjustPeriod = p.value"
          >
            <span class="text-muted-foreground">{{ p.label }}:</span> {{ selectedUser.counts[p.value].toLocaleString() }}
          </button>
        </div>

        <p class="mt-2 text-xs text-muted-foreground">
          Give/Subtract/Set act on the <strong>{{ adjustPeriodLabel }}</strong> count selected above.
        </p>

        <!-- Only consulted by Give (see onAdjustConfirm) — attributes the credited messages to a channel so
             that channel's own leaderboard/top-channels stats stay consistent with the credit, the same as if
             the messages had actually been sent there. Subtract/Set/Reset have no sensible channel to apply
             to, so this is left visible but simply ignored for those. -->
        <div class="mt-2">
          <label class="text-xs text-muted-foreground">Attribute Give to a channel (optional)</label>
          <RoleChannelPickerField
            class="mt-1"
            :guild-id="guildId"
            entity-type="channel"
            :model-value="giveChannelId"
            @update:model-value="giveChannelId = $event"
          />
        </div>

        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" @click="promptAdjust('give')">Give</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('subtract')">Subtract</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('set')">Set</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('reset')">Reset all</button>
        </div>
      </div>
    </div>

    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Channel stats</h3>
      <RoleChannelPickerField
        :guild-id="guildId"
        entity-type="channel"
        :model-value="statsChannelId"
        @update:model-value="onStatsChannelChange"
      />

      <template v-if="statsChannelId">
        <div v-if="channelStats?.name" class="mt-2 text-sm text-muted-foreground">
          #{{ channelStats.name }}
          <span v-if="channelStats.type != null">({{ channelTypeLabel(channelStats.type) }})</span>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
          <button
            v-for="p in periods"
            :key="p.value"
            type="button"
            class="text-left rounded-lg px-2 py-1 transition-colors"
            :class="statsPeriod === p.value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
            @click="onStatsPeriodChange(p.value)"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="mt-3 flex flex-col gap-2">
          <div v-if="!channelStats?.top.length" class="text-sm text-muted-foreground">No messages tracked in this channel yet.</div>
          <div
            v-for="(entry, i) in channelStats?.top ?? []"
            :key="entry.userId"
            class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
          >
            <div class="min-w-0 flex items-center gap-2">
              <span class="text-xs text-muted-foreground w-4 shrink-0">#{{ i + 1 }}</span>
              <button type="button" class="min-w-0 hover:underline text-left" @click="selectUser(topEntryMember(entry))">
                <MemberInline :avatar="entry.member?.avatar ?? null" :display-name="entry.member?.displayName ?? entry.userId" :id="entry.userId" />
              </button>
            </div>
            <span class="font-medium shrink-0">{{ entry.count.toLocaleString() }}</span>
          </div>
        </div>
      </template>
    </div>
    </div>

    <div class="min-w-0 flex flex-col gap-4">
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Top senders</h3>
      <div class="grid grid-cols-2 gap-2 text-sm mb-3">
        <button
          v-for="p in periods"
          :key="p.value"
          type="button"
          class="text-left rounded-lg px-2 py-1 transition-colors"
          :class="topSendersPeriod === p.value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
          @click="onTopSendersPeriodChange(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
      <div v-if="!topSendersList.topSenders.length" class="text-sm text-muted-foreground">No messages tracked for this period.</div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in topSendersList.topSenders"
          :key="entry.userId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-4 shrink-0">#{{ i + 1 }}</span>
            <button type="button" class="min-w-0 hover:underline text-left" @click="selectUser(topEntryMember(entry))">
              <MemberInline :avatar="entry.member?.avatar ?? null" :display-name="entry.member?.displayName ?? entry.userId" :id="entry.userId" />
            </button>
          </div>
          <span class="font-medium shrink-0">{{ entry.count.toLocaleString() }}</span>
        </div>
      </div>
    </div>
    </div>

    <div class="min-w-0 bg-card border border-border rounded-3xl shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Top channels</h3>
      <div class="grid grid-cols-2 gap-2 text-sm mb-3">
        <button
          v-for="p in periods"
          :key="p.value"
          type="button"
          class="text-left rounded-lg px-2 py-1 transition-colors"
          :class="topChannelsPeriod === p.value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
          @click="onTopChannelsPeriodChange(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
      <div v-if="!topChannelsList.topChannels.length" class="text-sm text-muted-foreground">No messages tracked for this period.</div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in topChannelsList.topChannels"
          :key="entry.channelId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-4 shrink-0">#{{ i + 1 }}</span>
            <button type="button" class="min-w-0 truncate hover:underline text-left" @click="selectChannelForStats(entry.channelId)">
              {{ entry.name ? `#${entry.name}` : entry.channelId }}
              <span v-if="entry.type != null" class="text-muted-foreground">({{ channelTypeLabel(entry.type) }})</span>
            </button>
          </div>
          <span class="font-medium shrink-0">{{ entry.count.toLocaleString() }}</span>
        </div>
      </div>
    </div>
  </div>

  <ConfirmModal
    :open="!!adjustState"
    :title="adjustTitle"
    :message="adjustMessage"
    :confirm-label="adjustConfirmLabel"
    :show-number-input="adjustState?.action !== 'reset'"
    number-label="Amount"
    :number-default="adjustState?.defaultAmount ?? 1"
    @confirm="onAdjustConfirm"
    @cancel="adjustState = null"
  />

  <div
    v-if="toastMessage"
    class="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-3xl shadow-lg px-4 py-3 text-sm max-w-sm"
  >
    {{ toastMessage }}
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
import { ApiError } from "../../api";
import {
  MessagesChannelStats,
  MessagesMemberInfo,
  MessagesSummary,
  MessagesTopChannelsList,
  MessagesTopEntry,
  MessagesTopSendersList,
  MessagesUserInfo,
  GuildState,
} from "../../store/types";
import ConfirmModal from "./ConfirmModal.vue";
import { channelTypeLabel } from "./discordGuildData";
import MemberInline from "./MemberInline.vue";
import RoleChannelPickerField from "./RoleChannelPickerField.vue";

const EMPTY_SUMMARY: MessagesSummary = { totalTrackedUsers: 0, totalAllTimeMessages: 0, totalToday: 0 };
const EMPTY_TOP_SENDERS: MessagesTopSendersList = { period: "daily", topSenders: [] };
const EMPTY_TOP_CHANNELS: MessagesTopChannelsList = { period: "daily", topChannels: [] };

// How often the top 3 stat cards re-poll (see mounted/unmounted) — cheap since /messages/summary is a plain DB
// read with no Discord REST calls, unlike the top senders/channels lists which resolve names/avatars.
const SUMMARY_POLL_INTERVAL_MS = 1000;

type AdjustAction = "give" | "subtract" | "set" | "reset";
type AdjustState = { action: AdjustAction; defaultAmount: number };
type Period = "daily" | "weekly" | "monthly" | "allTime";

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "allTime", label: "All-time" },
];

export default {
  components: { ConfirmModal, MemberInline, RoleChannelPickerField },

  props: {
    guildId: { type: String, required: true },
  },

  data() {
    return {
      lookupQuery: "",
      lookupResults: [] as MessagesMemberInfo[],
      lookupTimeout: null as ReturnType<typeof setTimeout> | null,
      selectedUserId: null as string | null,
      adjustPeriod: "allTime" as Period,
      giveChannelId: null as string | null,
      topSendersPeriod: "daily" as Period,
      topChannelsPeriod: "daily" as Period,
      statsChannelId: null as string | null,
      statsPeriod: "allTime" as Period,
      adjustState: null as AdjustState | null,
      toastMessage: null as string | null,
      toastTimeout: null as ReturnType<typeof setTimeout> | null,
      summaryPollTimer: null as ReturnType<typeof setInterval> | null,
    };
  },

  computed: {
    ...mapState("guilds", {
      summary(state: GuildState): MessagesSummary {
        return state.messagesSummary[this.guildId] || EMPTY_SUMMARY;
      },
      topSendersList(state: GuildState): MessagesTopSendersList {
        return state.messagesTopSenders[this.guildId] || EMPTY_TOP_SENDERS;
      },
      topChannelsList(state: GuildState): MessagesTopChannelsList {
        return state.messagesTopChannels[this.guildId] || EMPTY_TOP_CHANNELS;
      },
      selectedUser(state: GuildState): MessagesUserInfo | null {
        return state.messagesUser[this.guildId] || null;
      },
      channelStats(state: GuildState): MessagesChannelStats | null {
        return state.messagesChannelStats[this.guildId] || null;
      },
    }),

    periods() {
      return PERIODS;
    },

    adjustPeriodLabel() {
      return PERIODS.find((p) => p.value === this.adjustPeriod)!.label.toLowerCase();
    },

    adjustTitle() {
      if (!this.adjustState) return "";
      return { give: "Give messages", subtract: "Subtract messages", set: "Set count", reset: "Reset all counts" }[this.adjustState.action];
    },

    adjustMessage() {
      if (!this.adjustState || !this.selectedUser) return "";
      const name = this.selectedUser.member?.displayName ?? this.selectedUser.userId;
      const period = this.adjustPeriodLabel;
      return {
        give: `Add to ${name}'s ${period} message count.`,
        subtract: `Remove from ${name}'s ${period} message count.`,
        set: `Set ${name}'s ${period} message count to an exact amount.`,
        reset: `Reset all of ${name}'s message counts (today/week/month/all-time) to 0.`,
      }[this.adjustState.action];
    },

    adjustConfirmLabel() {
      if (!this.adjustState) return "Confirm";
      return { give: "Give", subtract: "Subtract", set: "Set", reset: "Reset" }[this.adjustState.action];
    },
  },

  async mounted() {
    await Promise.all([this.refreshSummary(), this.refreshTopSenders(), this.refreshTopChannels()]);
    this.summaryPollTimer = setInterval(() => this.refreshSummary(), SUMMARY_POLL_INTERVAL_MS);
  },

  beforeUnmount() {
    if (this.summaryPollTimer) clearInterval(this.summaryPollTimer);
  },

  methods: {
    topEntryMember(entry: MessagesTopEntry): MessagesMemberInfo {
      return entry.member ?? { id: entry.userId, username: entry.userId, displayName: entry.userId, avatar: null };
    },

    channelTypeLabel,

    async selectChannelForStats(channelId: string) {
      this.statsChannelId = channelId;
      this.statsPeriod = this.topChannelsPeriod;
      await this.refreshChannelStats();
    },

    async refreshSummary() {
      await this.$store.dispatch("guilds/loadMessagesSummary", this.guildId).catch(() => {});
    },

    async onTopSendersPeriodChange(period: Period) {
      this.topSendersPeriod = period;
      await this.refreshTopSenders();
    },

    async refreshTopSenders() {
      await this.$store
        .dispatch("guilds/loadMessagesTopSenders", { guildId: this.guildId, period: this.topSendersPeriod })
        .catch(() => {});
    },

    async onTopChannelsPeriodChange(period: Period) {
      this.topChannelsPeriod = period;
      await this.refreshTopChannels();
    },

    async refreshTopChannels() {
      await this.$store
        .dispatch("guilds/loadMessagesTopChannels", { guildId: this.guildId, period: this.topChannelsPeriod })
        .catch(() => {});
    },

    onLookupInput(value: string) {
      this.lookupQuery = value;
      if (this.lookupTimeout) clearTimeout(this.lookupTimeout);
      if (!value.trim()) {
        this.lookupResults = [];
        return;
      }
      this.lookupTimeout = setTimeout(async () => {
        try {
          this.lookupResults = await this.$store.dispatch("guilds/lookupMessagesMembers", { guildId: this.guildId, query: value.trim() });
        } catch {
          this.lookupResults = [];
        }
      }, 300);
    },

    async selectUser(member: MessagesMemberInfo) {
      this.selectedUserId = member.id;
      this.lookupQuery = "";
      this.lookupResults = [];
      await this.refreshSelectedUser();
    },

    async refreshSelectedUser() {
      if (!this.selectedUserId) return;
      await this.$store.dispatch("guilds/loadMessagesUser", { guildId: this.guildId, userId: this.selectedUserId });
    },

    async onStatsChannelChange(channelId: string | null) {
      this.statsChannelId = channelId;
      await this.refreshChannelStats();
    },

    async onStatsPeriodChange(period: Period) {
      this.statsPeriod = period;
      await this.refreshChannelStats();
    },

    async refreshChannelStats() {
      if (!this.statsChannelId) return;
      await this.$store
        .dispatch("guilds/loadMessagesChannelStats", { guildId: this.guildId, channelId: this.statsChannelId, period: this.statsPeriod })
        .catch(() => {});
    },

    promptAdjust(action: AdjustAction, defaultAmount = 1) {
      this.adjustState = { action, defaultAmount };
    },

    async onAdjustConfirm({ amount }: { amount: number | undefined }) {
      const state = this.adjustState;
      this.adjustState = null;
      if (!state || !this.selectedUserId) return;

      try {
        await this.$store.dispatch("guilds/adjustMessagesCount", {
          guildId: this.guildId,
          userId: this.selectedUserId,
          action: state.action,
          amount: state.action === "reset" ? undefined : (amount ?? 0),
          // "Reset all" (see the button below) always resets every period — only give/subtract/set are scoped
          // to whichever period is selected above.
          period: state.action === "reset" ? undefined : this.adjustPeriod,
          channelId: state.action === "give" ? this.giveChannelId || undefined : undefined,
        });
        await this.refreshSelectedUser();
        this.showToast(state.action === "reset" ? "Message counts reset." : "Message count updated.");
      } catch (err) {
        this.showToast(err instanceof ApiError && err.body?.error ? err.body.error : "Failed to update message counts.");
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
  },
};
</script>

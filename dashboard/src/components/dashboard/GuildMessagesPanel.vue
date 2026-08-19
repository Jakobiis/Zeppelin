<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Messages today</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalToday.toLocaleString() }}</div>
    </div>
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total messages</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalAllTimeMessages.toLocaleString() }}</div>
    </div>
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tracked users</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalTrackedUsers.toLocaleString() }}</div>
    </div>
  </div>

  <div class="grid min-w-0 items-start gap-4 xl:grid-cols-3">
    <div class="min-w-0 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
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
          {{ m.displayName }} <span class="text-xs text-muted-foreground font-mono">{{ m.id }}</span>
        </button>
      </div>

      <div v-if="selectedUser" class="mt-4 border-t border-border pt-4">
        <div class="font-semibold">{{ selectedUser.member?.displayName ?? selectedUser.userId }}</div>
        <div class="text-xs text-muted-foreground font-mono">{{ selectedUser.userId }}</div>

        <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div><span class="text-muted-foreground">Today:</span> {{ selectedUser.counts.daily.toLocaleString() }}</div>
          <div><span class="text-muted-foreground">This week:</span> {{ selectedUser.counts.weekly.toLocaleString() }}</div>
          <div><span class="text-muted-foreground">This month:</span> {{ selectedUser.counts.monthly.toLocaleString() }}</div>
          <div><span class="text-muted-foreground">All-time:</span> {{ selectedUser.counts.allTime.toLocaleString() }}</div>
        </div>

        <p class="mt-2 text-xs text-muted-foreground">Give/Subtract/Set act on the all-time count.</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" @click="promptAdjust('give')">Give</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('subtract')">Subtract</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('set')">Set all-time</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('reset')">Reset all</button>
        </div>
      </div>
    </div>

    <div class="min-w-0 flex flex-col gap-4">
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Top senders today</h3>
      <div v-if="!analytics.topToday.length" class="text-sm text-muted-foreground">No messages sent yet today.</div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in analytics.topToday"
          :key="entry.userId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-4 shrink-0">#{{ i + 1 }}</span>
            <button type="button" class="truncate hover:underline text-left" @click="selectUser(topEntryMember(entry))">
              {{ entry.member?.displayName ?? entry.userId }}
            </button>
          </div>
          <span class="font-medium shrink-0">{{ entry.count.toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Top senders all-time</h3>
      <div v-if="!analytics.topAllTime.length" class="text-sm text-muted-foreground">No messages tracked yet.</div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in analytics.topAllTime"
          :key="entry.userId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-4 shrink-0">#{{ i + 1 }}</span>
            <button type="button" class="truncate hover:underline text-left" @click="selectUser(topEntryMember(entry))">
              {{ entry.member?.displayName ?? entry.userId }}
            </button>
          </div>
          <span class="font-medium shrink-0">{{ entry.count.toLocaleString() }}</span>
        </div>
      </div>
    </div>
    </div>

    <div class="min-w-0 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Top channels today</h3>
      <div v-if="!analytics.topChannelsToday.length" class="text-sm text-muted-foreground">No messages sent yet today.</div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in analytics.topChannelsToday"
          :key="entry.channelId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-4 shrink-0">#{{ i + 1 }}</span>
            <span class="truncate">{{ entry.name ? `#${entry.name}` : entry.channelId }}</span>
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
    class="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm max-w-sm"
  >
    {{ toastMessage }}
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
import { ApiError } from "../../api";
import { MessagesAnalytics, MessagesMemberInfo, MessagesTopEntry, MessagesUserInfo, GuildState } from "../../store/types";
import ConfirmModal from "./ConfirmModal.vue";

const EMPTY_ANALYTICS: MessagesAnalytics = {
  totalTrackedUsers: 0,
  totalAllTimeMessages: 0,
  totalToday: 0,
  topToday: [],
  topAllTime: [],
  topChannelsToday: [],
};

type AdjustAction = "give" | "subtract" | "set" | "reset";
type AdjustState = { action: AdjustAction; defaultAmount: number };

export default {
  components: { ConfirmModal },

  props: {
    guildId: { type: String, required: true },
  },

  data() {
    return {
      lookupQuery: "",
      lookupResults: [] as MessagesMemberInfo[],
      lookupTimeout: null as ReturnType<typeof setTimeout> | null,
      selectedUserId: null as string | null,
      adjustState: null as AdjustState | null,
      toastMessage: null as string | null,
      toastTimeout: null as ReturnType<typeof setTimeout> | null,
    };
  },

  computed: {
    ...mapState("guilds", {
      analytics(state: GuildState): MessagesAnalytics {
        return state.messagesAnalytics[this.guildId] || EMPTY_ANALYTICS;
      },
      selectedUser(state: GuildState): MessagesUserInfo | null {
        return state.messagesUser[this.guildId] || null;
      },
    }),

    adjustTitle() {
      if (!this.adjustState) return "";
      return { give: "Give messages", subtract: "Subtract messages", set: "Set all-time count", reset: "Reset all counts" }[this.adjustState.action];
    },

    adjustMessage() {
      if (!this.adjustState || !this.selectedUser) return "";
      const name = this.selectedUser.member?.displayName ?? this.selectedUser.userId;
      return {
        give: `Add to ${name}'s all-time message count.`,
        subtract: `Remove from ${name}'s all-time message count.`,
        set: `Set ${name}'s all-time message count to an exact amount.`,
        reset: `Reset all of ${name}'s message counts (today/week/month/all-time) to 0.`,
      }[this.adjustState.action];
    },

    adjustConfirmLabel() {
      if (!this.adjustState) return "Confirm";
      return { give: "Give", subtract: "Subtract", set: "Set", reset: "Reset" }[this.adjustState.action];
    },
  },

  async mounted() {
    await this.$store.dispatch("guilds/loadMessagesAnalytics", this.guildId).catch(() => {});
  },

  methods: {
    topEntryMember(entry: MessagesTopEntry): MessagesMemberInfo {
      return entry.member ?? { id: entry.userId, username: entry.userId, displayName: entry.userId, avatar: null };
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

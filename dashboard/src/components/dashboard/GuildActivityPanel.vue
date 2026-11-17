<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Users with points</div>
      <div class="mt-1 text-2xl font-semibold">{{ trackedUsers.toLocaleString() }}</div>
    </div>
    <div class="bg-card border border-border rounded-3xl shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top score</div>
      <div class="mt-1 text-2xl font-semibold">{{ topScore.toLocaleString() }}</div>
    </div>
  </div>

  <div class="grid min-w-0 items-start gap-4 xl:grid-cols-2">
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
          @click="selectUser(m.id)"
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
        <div class="mt-2 text-sm">
          <span class="text-muted-foreground">Activity points:</span> {{ selectedUser.points.toLocaleString() }}
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" @click="adjustAction = 'give'">Give</button>
          <button type="button" class="btn-secondary" @click="adjustAction = 'subtract'">Subtract</button>
          <button type="button" class="btn-secondary" @click="adjustAction = 'set'">Set</button>
          <button type="button" class="btn-secondary" @click="adjustAction = 'reset'">Reset</button>
        </div>
      </div>
    </div>

    <div class="min-w-0 bg-card border border-border rounded-3xl shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Leaderboard</h3>
      <input
        type="text"
        class="field-input mb-2"
        placeholder="Search by username or user ID…"
        :value="searchInput"
        @input="onSearchInput(($event.target as HTMLInputElement).value)"
      />
      <div v-if="!leaderboard.items.length" class="text-sm text-muted-foreground">
        {{ searchInput.trim() ? "No matching users." : "No activity points yet." }}
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in leaderboard.items"
          :key="entry.userId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-6 shrink-0">#{{ offset + i + 1 }}</span>
            <button type="button" class="min-w-0 hover:underline text-left" @click="selectUser(entry.userId)">
              <MemberInline :avatar="entry.member?.avatar ?? null" :display-name="entry.member?.displayName ?? entry.userId" :id="entry.userId" />
            </button>
          </div>
          <span class="font-medium shrink-0">{{ entry.points.toLocaleString() }}</span>
        </div>
      </div>
      <div v-if="totalPages > 1" class="mt-3 flex items-center justify-between gap-2">
        <button type="button" class="btn-secondary" :disabled="page <= 1" @click="goToPage(page - 1)">Previous</button>
        <span class="text-xs text-muted-foreground">Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="btn-secondary" :disabled="page >= totalPages" @click="goToPage(page + 1)">Next</button>
      </div>
    </div>
  </div>

  <ConfirmModal
    :open="!!adjustAction"
    :title="adjustTitle"
    :message="adjustMessage"
    :confirm-label="adjustAction ? adjustAction[0].toUpperCase() + adjustAction.slice(1) : 'Confirm'"
    :show-number-input="adjustAction !== 'reset'"
    number-label="Amount"
    :number-default="1"
    @confirm="onAdjustConfirm"
    @cancel="adjustAction = null"
  />

  <div
    v-if="toastMessage"
    class="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-3xl shadow-lg px-4 py-3 text-sm max-w-sm"
  >
    {{ toastMessage }}
  </div>
</template>

<script lang="ts">
import { ApiError, get, post } from "../../api";
import ConfirmModal from "./ConfirmModal.vue";
import MemberInline from "./MemberInline.vue";

type MemberInfo = { id: string; username: string; displayName: string; avatar: string | null };
type LeaderboardEntry = { userId: string; points: number; member: MemberInfo | null };
type AdjustAction = "give" | "subtract" | "set" | "reset";

const PAGE_SIZE = 10;

export default {
  components: { ConfirmModal, MemberInline },

  props: {
    guildId: { type: String, required: true },
  },

  data() {
    return {
      leaderboard: { items: [], total: 0 } as { items: LeaderboardEntry[]; total: number },
      // Unfiltered stats for the cards, so searching the leaderboard doesn't change them
      trackedUsers: 0,
      topScore: 0,
      page: 1,
      searchInput: "",
      searchTimeout: null as ReturnType<typeof setTimeout> | null,
      lookupQuery: "",
      lookupResults: [] as MemberInfo[],
      lookupTimeout: null as ReturnType<typeof setTimeout> | null,
      selectedUser: null as { userId: string; member: MemberInfo | null; points: number } | null,
      adjustAction: null as AdjustAction | null,
      toastMessage: null as string | null,
      toastTimeout: null as ReturnType<typeof setTimeout> | null,
    };
  },

  computed: {
    offset() {
      return (this.page - 1) * PAGE_SIZE;
    },
    totalPages() {
      return Math.max(1, Math.ceil(this.leaderboard.total / PAGE_SIZE));
    },
    adjustTitle() {
      return this.adjustAction
        ? { give: "Give points", subtract: "Subtract points", set: "Set points", reset: "Reset points" }[this.adjustAction]
        : "";
    },
    adjustMessage() {
      if (!this.adjustAction || !this.selectedUser) return "";
      const name = this.selectedUser.member?.displayName ?? this.selectedUser.userId;
      return {
        give: `Add to ${name}'s activity points.`,
        subtract: `Remove from ${name}'s activity points.`,
        set: `Set ${name}'s activity points to an exact amount.`,
        reset: `Reset ${name}'s activity points to 0.`,
      }[this.adjustAction];
    },
  },

  async mounted() {
    await this.loadLeaderboard();
  },

  methods: {
    async loadLeaderboard() {
      const search = this.searchInput.trim();
      try {
        this.leaderboard = await get(`guilds/${this.guildId}/activity/leaderboard`, {
          limit: PAGE_SIZE,
          offset: this.offset,
          search,
        });
        if (!search && this.page === 1) {
          this.trackedUsers = this.leaderboard.total;
          this.topScore = this.leaderboard.items[0]?.points ?? 0;
        }
      } catch {
        this.leaderboard = { items: [], total: 0 };
      }
    },

    goToPage(page: number) {
      if (page < 1 || page > this.totalPages) return;
      this.page = page;
      this.loadLeaderboard();
    },

    onSearchInput(value: string) {
      this.searchInput = value;
      this.page = 1;
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.loadLeaderboard(), 300);
    },

    onLookupInput(value: string) {
      this.lookupQuery = value;
      if (this.lookupTimeout) clearTimeout(this.lookupTimeout);
      if (!value.trim()) {
        this.lookupResults = [];
        return;
      }
      // Same member lookup the Messages tab uses (same manager_roles gate)
      this.lookupTimeout = setTimeout(async () => {
        try {
          this.lookupResults = await get(`guilds/${this.guildId}/messages/lookup`, { query: value.trim() });
        } catch {
          this.lookupResults = [];
        }
      }, 300);
    },

    async selectUser(userId: string) {
      this.lookupQuery = "";
      this.lookupResults = [];
      this.selectedUser = await get(`guilds/${this.guildId}/activity/user/${userId}`).catch(() => null);
    },

    async onAdjustConfirm({ amount }: { amount: number | undefined }) {
      const action = this.adjustAction;
      this.adjustAction = null;
      if (!action || !this.selectedUser) return;

      try {
        const result = await post(`guilds/${this.guildId}/activity/user/${this.selectedUser.userId}`, {
          action,
          amount: action === "reset" ? undefined : (amount ?? 0),
        });
        this.selectedUser = { ...this.selectedUser, points: result.points };
        this.showToast("Activity points updated.");
        await this.loadLeaderboard();
      } catch (err) {
        this.showToast(err instanceof ApiError && err.body?.error ? err.body.error : "Failed to update activity points.");
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

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Games today</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalEntries.toLocaleString() }}</div>
    </div>
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net today</div>
      <div class="mt-1 text-2xl font-semibold" :class="signedClass(analytics.net)">{{ formatSigned(analytics.net) }}</div>
    </div>
    <div class="bg-card border border-border rounded-lg shadow-md px-4 py-3">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wagered today</div>
      <div class="mt-1 text-2xl font-semibold">{{ analytics.totalWagered.toLocaleString() }}</div>
    </div>
  </div>

  <div class="columns-1 sm:columns-2 xl:columns-3 gap-4">
    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
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
        <div class="mt-2 text-2xl font-semibold">
          {{ selectedUser.balance.toLocaleString() }} <span class="text-sm font-normal text-muted-foreground">coins</span>
        </div>
        <div v-if="selectedUser.activeBoosts.length" class="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <div v-for="b in selectedUser.activeBoosts" :key="b.type">
            {{ b.type }} boost {{ b.multiplier }}x until {{ formatDate(b.expiresAt) }}
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" @click="promptAdjust('give')">Give</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('subtract')">Subtract</button>
          <button type="button" class="btn-secondary" @click="promptAdjust('set')">Set balance</button>
          <button type="button" class="btn-secondary" @click="resetBalance">Reset to 0</button>
        </div>

        <div class="mt-4">
          <div class="text-sm font-medium mb-2">Recent activity</div>
          <div v-if="!userHistory?.items.length" class="text-sm text-muted-foreground">No activity yet.</div>
          <div class="flex flex-col gap-2">
            <div v-for="entry in userHistory?.items ?? []" :key="entry.id" class="text-sm border border-border rounded-md px-2 py-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{{ entryLabel(entry) }}</span>
                <span :class="signedClass(entry.amount_changed)">{{ formatSigned(entry.amount_changed) }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ formatDate(entry.created_at) }} · balance {{ entry.balance_after.toLocaleString() }}{{ opponentLabel(entry, userHistory?.members) }}
              </div>
            </div>
          </div>
          <div v-if="userHistoryTotalPages > 1" class="mt-2 flex items-center justify-between gap-2">
            <button type="button" class="btn-secondary" :disabled="userHistoryPage <= 1" @click="goToUserHistoryPage(userHistoryPage - 1)">
              Previous
            </button>
            <span class="text-xs text-muted-foreground">Page {{ userHistoryPage }} of {{ userHistoryTotalPages }}</span>
            <button
              type="button"
              class="btn-secondary"
              :disabled="userHistoryPage >= userHistoryTotalPages"
              @click="goToUserHistoryPage(userHistoryPage + 1)"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Leaderboard</h3>
      <input
        type="text"
        class="field-input mb-2"
        placeholder="Search by username or user ID…"
        :value="leaderboardSearchInput"
        @input="onLeaderboardSearchInput(($event.target as HTMLInputElement).value)"
      />
      <div v-if="!leaderboard.items.length" class="text-sm text-muted-foreground">
        {{ leaderboardSearchInput.trim() ? "No matching balances." : "No balances yet." }}
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, i) in leaderboard.items"
          :key="entry.userId"
          class="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="text-xs text-muted-foreground w-6 shrink-0">#{{ leaderboardOffset + i + 1 }}</span>
            <button type="button" class="truncate hover:underline text-left" @click="selectUser(leaderboardMember(entry))">
              {{ entry.member?.displayName ?? entry.userId }}
            </button>
          </div>
          <span class="font-medium shrink-0">{{ entry.balance.toLocaleString() }}</span>
        </div>
      </div>
      <div v-if="leaderboardTotalPages > 1" class="mt-3 flex items-center justify-between gap-2">
        <button type="button" class="btn-secondary" :disabled="leaderboardPage <= 1" @click="goToLeaderboardPage(leaderboardPage - 1)">
          Previous
        </button>
        <span class="text-xs text-muted-foreground">Page {{ leaderboardPage }} of {{ leaderboardTotalPages }}</span>
        <button
          type="button"
          class="btn-secondary"
          :disabled="leaderboardPage >= leaderboardTotalPages"
          @click="goToLeaderboardPage(leaderboardPage + 1)"
        >
          Next
        </button>
      </div>
    </div>

    <div class="min-w-0 break-inside-avoid mb-4 bg-card border border-border rounded-lg shadow-md px-4 py-4 sm:px-6">
      <h3 class="mb-3">Recent activity</h3>
      <p class="text-xs text-muted-foreground mb-2">Games, gifts, and trades across the whole server.</p>
      <div v-if="!transactions.items.length" class="text-sm text-muted-foreground">No activity yet.</div>
      <div class="flex flex-col gap-2">
        <div v-for="entry in transactions.items" :key="entry.id" class="text-sm border border-border rounded-md px-2 py-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium min-w-0 truncate">{{ activityLabel(entry) }}</span>
            <span class="shrink-0" :class="signedClass(entry.amount_changed)">{{ formatSigned(entry.amount_changed) }}</span>
          </div>
          <div class="text-xs text-muted-foreground">{{ formatDate(entry.created_at) }}</div>
        </div>
      </div>
      <div v-if="transactionsTotalPages > 1" class="mt-3 flex items-center justify-between gap-2">
        <button type="button" class="btn-secondary" :disabled="transactionsPage <= 1" @click="goToTransactionsPage(transactionsPage - 1)">
          Previous
        </button>
        <span class="text-xs text-muted-foreground">Page {{ transactionsPage }} of {{ transactionsTotalPages }}</span>
        <button
          type="button"
          class="btn-secondary"
          :disabled="transactionsPage >= transactionsTotalPages"
          @click="goToTransactionsPage(transactionsPage + 1)"
        >
          Next
        </button>
      </div>
    </div>
  </div>

  <ConfirmModal
    :open="!!adjustState"
    :title="adjustTitle"
    :message="adjustMessage"
    :confirm-label="adjustConfirmLabel"
    show-number-input
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
import moment from "moment";
import { mapState } from "vuex";
import { ApiError } from "../../api";
import {
  EconomyHistoryEntry,
  EconomyHistorySummary,
  EconomyLeaderboardEntry,
  EconomyLeaderboardPage,
  EconomyMemberInfo,
  EconomyTransactionsPage,
  EconomyUserHistoryPage,
  EconomyUserInfo,
  GuildState,
} from "../../store/types";
import ConfirmModal from "./ConfirmModal.vue";

const LEADERBOARD_PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 10;
const TRANSACTIONS_PAGE_SIZE = 15;

const EMPTY_ANALYTICS: EconomyHistorySummary = { totalEntries: 0, totalWagered: 0, net: 0, totalWon: 0, totalLost: 0 };
const EMPTY_LEADERBOARD: EconomyLeaderboardPage = { items: [], total: 0 };
const EMPTY_TRANSACTIONS: EconomyTransactionsPage = { items: [], total: 0, page: 1, pageSize: TRANSACTIONS_PAGE_SIZE, members: {} };

// Friendly labels for game_type — give/trade/tradeback are transfers, not games (see backend's gameHistory.ts),
// but they're logged into the same table so they show up alongside actual plays here.
const GAME_TYPE_LABELS: Record<string, string> = {
  give: "Gift",
  trade: "Traded points for coins",
  tradeback: "Traded coins for points",
  blackjack: "Blackjack",
  hol: "Higher or Lower",
  admin_adjust: "Balance adjusted by staff",
};

type AdjustAction = "give" | "subtract" | "set";
type AdjustState = { action: AdjustAction; defaultAmount: number };

export default {
  components: { ConfirmModal },

  props: {
    guildId: { type: String, required: true },
  },

  data() {
    return {
      lookupQuery: "",
      lookupResults: [] as EconomyMemberInfo[],
      lookupTimeout: null as ReturnType<typeof setTimeout> | null,
      selectedUserId: null as string | null,
      userHistoryPage: 1,
      adjustState: null as AdjustState | null,
      leaderboardPage: 1,
      leaderboardSearchInput: "",
      leaderboardSearchTimeout: null as ReturnType<typeof setTimeout> | null,
      transactionsPage: 1,
      toastMessage: null as string | null,
      toastTimeout: null as ReturnType<typeof setTimeout> | null,
    };
  },

  computed: {
    ...mapState("guilds", {
      analytics(state: GuildState): EconomyHistorySummary {
        return state.economyAnalytics[this.guildId] || EMPTY_ANALYTICS;
      },
      selectedUser(state: GuildState): EconomyUserInfo | null {
        return state.economyUser[this.guildId] || null;
      },
      userHistory(state: GuildState): EconomyUserHistoryPage | null {
        return state.economyUserHistory[this.guildId] || null;
      },
      leaderboard(state: GuildState): EconomyLeaderboardPage {
        return state.economyLeaderboard[this.guildId] || EMPTY_LEADERBOARD;
      },
      transactions(state: GuildState): EconomyTransactionsPage {
        return state.economyTransactions[this.guildId] || EMPTY_TRANSACTIONS;
      },
    }),

    leaderboardOffset() {
      return (this.leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
    },

    leaderboardTotalPages() {
      return Math.max(1, Math.ceil(this.leaderboard.total / LEADERBOARD_PAGE_SIZE));
    },

    userHistoryTotalPages() {
      return Math.max(1, Math.ceil((this.userHistory?.total ?? 0) / HISTORY_PAGE_SIZE));
    },

    transactionsTotalPages() {
      return Math.max(1, Math.ceil(this.transactions.total / TRANSACTIONS_PAGE_SIZE));
    },

    adjustTitle() {
      if (!this.adjustState) return "";
      return { give: "Give coins", subtract: "Subtract coins", set: "Set balance" }[this.adjustState.action];
    },

    adjustMessage() {
      if (!this.adjustState || !this.selectedUser) return "";
      const name = this.selectedUser.member?.displayName ?? this.selectedUser.userId;
      return {
        give: `Add coins to ${name}'s balance.`,
        subtract: `Remove coins from ${name}'s balance.`,
        set: `Set ${name}'s balance to an exact amount.`,
      }[this.adjustState.action];
    },

    adjustConfirmLabel() {
      if (!this.adjustState) return "Confirm";
      return { give: "Give", subtract: "Subtract", set: "Set" }[this.adjustState.action];
    },
  },

  async mounted() {
    await Promise.all([
      this.$store.dispatch("guilds/loadEconomyAnalytics", this.guildId).catch(() => {}),
      this.loadLeaderboard().catch(() => {}),
      this.loadTransactions().catch(() => {}),
    ]);
  },

  methods: {
    formatDate(dateStr: string | null) {
      if (!dateStr) return "";
      return moment.utc(dateStr).local().format("YYYY-MM-DD HH:mm");
    },

    formatSigned(n: number): string {
      return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
    },

    signedClass(n: number): string {
      if (n > 0) return "text-green-500";
      if (n < 0) return "text-destructive";
      return "";
    },

    leaderboardMember(entry: EconomyLeaderboardEntry): EconomyMemberInfo {
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
          this.lookupResults = await this.$store.dispatch("guilds/lookupEconomyMembers", { guildId: this.guildId, query: value.trim() });
        } catch {
          this.lookupResults = [];
        }
      }, 300);
    },

    async selectUser(member: EconomyMemberInfo) {
      this.selectedUserId = member.id;
      this.lookupQuery = "";
      this.lookupResults = [];
      this.userHistoryPage = 1;
      await this.refreshSelectedUser();
    },

    async refreshSelectedUser() {
      if (!this.selectedUserId) return;
      await Promise.all([
        this.$store.dispatch("guilds/loadEconomyUser", { guildId: this.guildId, userId: this.selectedUserId }),
        this.$store.dispatch("guilds/loadEconomyUserHistory", {
          guildId: this.guildId,
          userId: this.selectedUserId,
          page: this.userHistoryPage,
          pageSize: HISTORY_PAGE_SIZE,
        }),
      ]);
    },

    goToUserHistoryPage(page: number) {
      if (page < 1 || page > this.userHistoryTotalPages) return;
      this.userHistoryPage = page;
      this.refreshSelectedUser();
    },

    promptAdjust(action: AdjustAction, defaultAmount = 1) {
      this.adjustState = { action, defaultAmount };
    },

    resetBalance() {
      this.promptAdjust("set", 0);
    },

    async onAdjustConfirm({ amount }: { amount: number | undefined }) {
      const state = this.adjustState;
      this.adjustState = null;
      if (!state || !this.selectedUserId) return;

      try {
        await this.$store.dispatch("guilds/adjustEconomyBalance", {
          guildId: this.guildId,
          userId: this.selectedUserId,
          action: state.action,
          amount: amount ?? 0,
        });
        await this.refreshSelectedUser();
        this.showToast("Balance updated.");
      } catch (err) {
        this.showToast(err instanceof ApiError && err.body?.error ? err.body.error : "Failed to update balance.");
      }
    },

    async loadLeaderboard() {
      await this.$store.dispatch("guilds/loadEconomyLeaderboard", {
        guildId: this.guildId,
        limit: LEADERBOARD_PAGE_SIZE,
        offset: this.leaderboardOffset,
        search: this.leaderboardSearchInput.trim(),
      });
    },

    goToLeaderboardPage(page: number) {
      if (page < 1 || page > this.leaderboardTotalPages) return;
      this.leaderboardPage = page;
      this.loadLeaderboard();
    },

    onLeaderboardSearchInput(value: string) {
      this.leaderboardSearchInput = value;
      this.leaderboardPage = 1;
      if (this.leaderboardSearchTimeout) clearTimeout(this.leaderboardSearchTimeout);
      this.leaderboardSearchTimeout = setTimeout(() => this.loadLeaderboard(), 300);
    },

    async loadTransactions() {
      await this.$store.dispatch("guilds/loadEconomyTransactions", {
        guildId: this.guildId,
        page: this.transactionsPage,
        pageSize: TRANSACTIONS_PAGE_SIZE,
      });
    },

    goToTransactionsPage(page: number) {
      if (page < 1 || page > this.transactionsTotalPages) return;
      this.transactionsPage = page;
      this.loadTransactions();
    },

    entryLabel(entry: EconomyHistoryEntry): string {
      return GAME_TYPE_LABELS[entry.game_type] ?? entry.game_name;
    },

    opponentLabel(entry: EconomyHistoryEntry, members?: { [userId: string]: EconomyMemberInfo }): string {
      if (!entry.opponent_id) return "";
      if (entry.opponent_id === "bot") return " · vs bot";
      const name = members?.[entry.opponent_id]?.displayName ?? entry.opponent_id;
      if (entry.game_type === "give") return ` · with ${name}`;
      if (entry.game_type === "admin_adjust") return ` · by ${name}`;
      return ` · vs ${name}`;
    },

    // Used by the guild-wide "Recent activity" feed — unlike entryLabel (a user's own history, where "who" is
    // implied), this names the player since the feed spans everyone. Covers transfers (give/trade/tradeback),
    // manual balance adjustments (admin_adjust — opponent_id is the acting manager here, not another player),
    // and actual games (win/loss/push, with an opponent for pvp).
    activityLabel(entry: EconomyHistoryEntry): string {
      const members = this.transactions.members;
      const who = members[entry.user_id]?.displayName ?? entry.user_id;

      if (entry.game_type === "give") {
        const otherId = entry.opponent_id;
        const other = otherId ? (members[otherId]?.displayName ?? otherId) : "someone";
        return entry.amount_changed < 0 ? `${who} gave ${other}` : `${who} received a gift from ${other}`;
      }
      if (entry.game_type === "trade" || entry.game_type === "tradeback") {
        return `${who} ${entry.game_type === "trade" ? "traded points for coins" : "traded coins for points"}`;
      }
      if (entry.game_type === "admin_adjust") {
        const managerId = entry.opponent_id;
        const manager = managerId ? (members[managerId]?.displayName ?? managerId) : "a manager";
        return `${who}'s balance was adjusted by ${manager}`;
      }

      const gameLabel = this.entryLabel(entry);
      const outcomeWord = entry.outcome === "win" ? "won" : entry.outcome === "loss" ? "lost" : "pushed on";
      if (entry.opponent_id) {
        const opponent = entry.opponent_id === "bot" ? "the bot" : (members[entry.opponent_id]?.displayName ?? entry.opponent_id);
        return `${who} ${outcomeWord} ${gameLabel} vs ${opponent}`;
      }
      return `${who} ${outcomeWord} ${gameLabel}`;
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

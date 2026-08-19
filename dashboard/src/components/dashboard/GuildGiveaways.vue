<template>
  <div>
    <h1>Giveaways</h1>

    <div v-if="loading">Loading...</div>

    <div v-else>
      <h2 class="mt-8">Running</h2>
      <div v-if="running.length === 0">No running giveaways</div>
      <ul v-if="running.length">
        <li v-for="giveaway in running" :key="giveaway.id" class="mt-2">
          <div class="flex gap-4 items-center">
            <div>
              <strong>#{{ giveaway.id }} {{ giveaway.prize }}</strong>
              — channel {{ giveaway.channel_id }} — host {{ giveaway.host_id }} — {{ giveaway.entry_count }} entries — {{ giveaway.winner_count }} winner(s) — ends {{ formatDate(giveaway.ends_at) }}
            </div>
            <div class="flex gap-4">
              <a href="#" v-on:click="endGiveaway(giveaway)">End now</a>
              <a href="#" v-on:click="cancelGiveaway(giveaway)">Cancel</a>
            </div>
          </div>
        </li>
      </ul>

      <h2 class="mt-8">Recently finished</h2>
      <div v-if="recentlyFinished.length === 0">No finished giveaways yet</div>
      <ul v-if="recentlyFinished.length">
        <li v-for="giveaway in recentlyFinished" :key="giveaway.id" class="mt-2">
          <div class="flex gap-4 items-center">
            <div>
              <strong>#{{ giveaway.id }} {{ giveaway.prize }}</strong>
              —
              <span v-if="giveaway.status === 'cancelled'">cancelled</span>
              <span v-else-if="giveaway.winner_ids.length === 0">ended, no eligible entries</span>
              <span v-else>won by {{ giveaway.winner_ids.join(', ') }}</span>
              — ended {{ formatDate(giveaway.ended_at) }}
            </div>
            <div class="flex gap-4" v-if="giveaway.status === 'ended'">
              <a href="#" v-on:click="rerollGiveaway(giveaway)">Reroll</a>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
import moment from "moment";
import { GiveawayApiItem, GuildState } from "../../store/types";

export default {
  data() {
    return { loading: true };
  },

  computed: {
    ...mapState("guilds", {
      allGiveaways(state: GuildState): GiveawayApiItem[] {
        return state.giveaways[this.$route.params.guildId] || [];
      },
    }),

    running() {
      return this.allGiveaways.filter((g: GiveawayApiItem) => g.status === "running");
    },

    recentlyFinished() {
      return this.allGiveaways.filter((g: GiveawayApiItem) => g.status !== "running");
    },
  },

  async mounted() {
    const isManager = await this.$store.dispatch("guilds/loadGiveawayAccess", this.$route.params.guildId).catch(() => false);
    if (!isManager) {
      this.$router.push("/dashboard");
      return;
    }

    await this.$store.dispatch("guilds/loadGiveaways", this.$route.params.guildId).catch(() => {});
    this.loading = false;
  },

  methods: {
    formatDate(dateStr: string | null) {
      if (!dateStr) return "";
      return moment.utc(dateStr).local().format("YYYY-MM-DD HH:mm");
    },

    async endGiveaway(giveaway: GiveawayApiItem) {
      if (!window.confirm(`End giveaway #${giveaway.id} (${giveaway.prize}) now and pick winner(s)?`)) return;
      await this.$store.dispatch("guilds/endGiveaway", { guildId: this.$route.params.guildId, giveawayId: giveaway.id });
    },

    async cancelGiveaway(giveaway: GiveawayApiItem) {
      if (!window.confirm(`Cancel giveaway #${giveaway.id} (${giveaway.prize})? No winners will be picked.`)) return;
      await this.$store.dispatch("guilds/cancelGiveaway", { guildId: this.$route.params.guildId, giveawayId: giveaway.id });
    },

    async rerollGiveaway(giveaway: GiveawayApiItem) {
      if (!window.confirm(`Reroll winner(s) for giveaway #${giveaway.id} (${giveaway.prize})?`)) return;
      await this.$store.dispatch("guilds/rerollGiveaway", { guildId: this.$route.params.guildId, giveawayId: giveaway.id });
    },
  },
};
</script>

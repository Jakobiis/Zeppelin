import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { EconomyGameHistoryEntry } from "./entities/EconomyGameHistoryEntry.js";

export interface EconomyGameHistoryFilter {
  // Omit for a guild-wide query (used by the dashboard's transaction feed and guild analytics — see
  // api/guilds/economy.ts) rather than one specific user's history.
  userId?: string | null;
  gameName?: string | null;
  // Restricts to (or excludes) specific game_type values — e.g. the dashboard's guild-wide analytics excludes
  // NON_GAME_TYPES (give/trade/tradeback/admin_adjust aren't games).
  gameTypes?: string[];
  excludeGameTypes?: string[];
  since?: Date | null;
}

export interface EconomyGameHistorySummary {
  totalEntries: number;
  totalWagered: number;
  net: number;
  totalWon: number;
  // Sum of every negative amount_changed — i.e. <= 0, not a positive magnitude. Callers that want "how much was
  // lost" as a plain positive number should negate this themselves.
  totalLost: number;
}

export class GuildEconomyGameHistory extends BaseGuildRepository {
  private history: Repository<EconomyGameHistoryEntry>;

  constructor(guildId) {
    super(guildId);
    this.history = dataSource.getRepository(EconomyGameHistoryEntry);
  }

  async addEntry(data: {
    userId: string;
    gameName: string;
    gameType: string;
    outcome: string;
    betAmount: number;
    amountChanged: number;
    balanceAfter: number;
    opponentId?: string | null;
  }): Promise<void> {
    await this.history.insert({
      guild_id: this.guildId,
      user_id: data.userId,
      game_name: data.gameName,
      game_type: data.gameType,
      outcome: data.outcome,
      bet_amount: data.betAmount,
      amount_changed: data.amountChanged,
      balance_after: data.balanceAfter,
      opponent_id: data.opponentId ?? null,
    });
  }

  private buildFilteredQuery(filter: EconomyGameHistoryFilter) {
    const qb = this.history.createQueryBuilder("h").where("h.guild_id = :guildId", { guildId: this.guildId });

    if (filter.userId) {
      qb.andWhere("h.user_id = :userId", { userId: filter.userId });
    }

    if (filter.gameName) {
      qb.andWhere("h.game_name = :gameName", { gameName: filter.gameName });
    }

    if (filter.gameTypes?.length) {
      qb.andWhere("h.game_type IN (:...gameTypes)", { gameTypes: filter.gameTypes });
    }

    if (filter.excludeGameTypes?.length) {
      qb.andWhere("h.game_type NOT IN (:...excludeGameTypes)", { excludeGameTypes: filter.excludeGameTypes });
    }

    if (filter.since) {
      qb.andWhere("h.created_at >= :since", { since: filter.since });
    }

    return qb;
  }

  async getEntries(filter: EconomyGameHistoryFilter, limit: number, offset: number): Promise<EconomyGameHistoryEntry[]> {
    return this.buildFilteredQuery(filter)
      .orderBy("h.created_at", "DESC")
      .addOrderBy("h.id", "DESC")
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  async getCount(filter: EconomyGameHistoryFilter): Promise<number> {
    return this.buildFilteredQuery(filter).getCount();
  }

  async getSummary(filter: EconomyGameHistoryFilter): Promise<EconomyGameHistorySummary> {
    const raw = await this.buildFilteredQuery(filter)
      .select("COUNT(*)", "totalEntries")
      .addSelect("COALESCE(SUM(h.bet_amount), 0)", "totalWagered")
      .addSelect("COALESCE(SUM(h.amount_changed), 0)", "net")
      .addSelect("COALESCE(SUM(CASE WHEN h.amount_changed > 0 THEN h.amount_changed ELSE 0 END), 0)", "totalWon")
      .addSelect("COALESCE(SUM(CASE WHEN h.amount_changed < 0 THEN h.amount_changed ELSE 0 END), 0)", "totalLost")
      .getRawOne<{ totalEntries: string; totalWagered: string; net: string; totalWon: string; totalLost: string }>();

    return {
      totalEntries: Number(raw?.totalEntries ?? 0),
      totalWagered: Number(raw?.totalWagered ?? 0),
      net: Number(raw?.net ?? 0),
      totalWon: Number(raw?.totalWon ?? 0),
      totalLost: Number(raw?.totalLost ?? 0),
    };
  }
}

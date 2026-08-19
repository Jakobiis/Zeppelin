import { Brackets, Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { Giveaway } from "./entities/Giveaway.js";

export class GuildGiveaways extends BaseGuildRepository {
  private giveaways: Repository<Giveaway>;

  constructor(guildId) {
    super(guildId);
    this.giveaways = dataSource.getRepository(Giveaway);
  }

  find(id: number): Promise<Giveaway | null> {
    return this.giveaways.findOne({
      where: { id, guild_id: this.guildId },
    });
  }

  // Used by `-giveaway reroll <message id>` — staff can right-click the giveaway's own announcement message
  // (edited in place to the "ended" embed) and copy its ID rather than needing to know the internal numeric one.
  findByMessageId(messageId: string): Promise<Giveaway | null> {
    return this.giveaways.findOne({
      where: { message_id: messageId, guild_id: this.guildId },
    });
  }

  getRunning(): Promise<Giveaway[]> {
    return this.giveaways
      .createQueryBuilder()
      .where("guild_id = :guildId", { guildId: this.guildId })
      .andWhere("status = :status", { status: "running" })
      .orderBy("ends_at", "ASC")
      .getMany();
  }

  // Most recently ended/cancelled giveaways first, capped at `limit` — used by `-giveaway list`, which (unlike
  // the dashboard's paginated/searchable "Recently finished" — see searchFinished below) just wants a quick
  // recent handful.
  getRecentlyFinished(limit: number): Promise<Giveaway[]> {
    return this.giveaways
      .createQueryBuilder()
      .where("guild_id = :guildId", { guildId: this.guildId })
      .andWhere("status != :status", { status: "running" })
      .orderBy("ended_at", "DESC")
      .addOrderBy("id", "DESC")
      .limit(limit)
      .getMany();
  }

  // Powers the dashboard's "Recently finished" search + pagination (api/guilds/giveaways.ts's /giveaways/finished
  // route). `search`, when given, matches a giveaway whose prize contains it OR whose host_id is in `hostIds` —
  // the caller resolves that list itself (an exact-snowflake candidate plus/or Discord member-search matches for
  // a typed username), since matching a *username* isn't something a plain SQL query can do on its own here.
  async searchFinished(opts: { search: string | null; hostIds: string[]; page: number; pageSize: number }): Promise<{ items: Giveaway[]; total: number }> {
    const qb = this.giveaways
      .createQueryBuilder("g")
      .where("g.guild_id = :guildId", { guildId: this.guildId })
      .andWhere("g.status != :status", { status: "running" });

    if (opts.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where("g.prize LIKE :prizeQuery", { prizeQuery: `%${opts.search}%` });
          if (opts.hostIds.length > 0) {
            sub.orWhere("g.host_id IN (:...hostIds)", { hostIds: opts.hostIds });
          }
        }),
      );
    }

    qb.orderBy("g.ended_at", "DESC").addOrderBy("g.id", "DESC");
    qb.skip((opts.page - 1) * opts.pageSize).take(opts.pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  // Ended giveaways where `userId` is still a current, unclaimed winner — i.e. eligible to be rerolled away from
  // (see functions/giveawayBans.ts, which uses this to reroll a banned user out of any prize they won but never
  // got confirmed as claimed). Deliberately requires claim_time_ms to be set: "unclaimed" is only a meaningful,
  // checkable state for giveaways that actually track claims (claimed_winner_ids is never populated otherwise —
  // see the Confirm Claimed button's own claim_time_ms gate in buildGiveawayThreadActionRows), so a giveaway
  // with no claim requirement at all is left alone here rather than guessing.
  findUnclaimedWinsForUser(userId: string): Promise<Giveaway[]> {
    return this.giveaways
      .createQueryBuilder("g")
      .where("g.guild_id = :guildId", { guildId: this.guildId })
      .andWhere("g.status = :status", { status: "ended" })
      .andWhere("g.claim_time_ms IS NOT NULL")
      .andWhere("JSON_CONTAINS(g.winner_ids, JSON_QUOTE(:userId))", { userId })
      .andWhere("NOT JSON_CONTAINS(g.expired_winner_ids, JSON_QUOTE(:userId))", { userId })
      .andWhere("NOT JSON_CONTAINS(g.claimed_winner_ids, JSON_QUOTE(:userId))", { userId })
      .getMany();
  }

  async getAnalytics(): Promise<{ totalGiveaways: number; claimedPrizes: number; totalEntries: number }> {
    const [row] = await dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM giveaways WHERE guild_id = ?) AS totalGiveaways,
        (SELECT COALESCE(SUM(JSON_LENGTH(claimed_winner_ids)), 0) FROM giveaways WHERE guild_id = ?) AS claimedPrizes,
        (SELECT COALESCE(SUM(giveaway_entries.entries), 0)
          FROM giveaway_entries
          INNER JOIN giveaways ON giveaways.id = giveaway_entries.giveaway_id
          WHERE giveaways.guild_id = ?) AS totalEntries`,
      [this.guildId, this.guildId, this.guildId],
    );

    return {
      totalGiveaways: Number(row.totalGiveaways),
      claimedPrizes: Number(row.claimedPrizes),
      totalEntries: Number(row.totalEntries),
    };
  }

  async create(data: Omit<Partial<Giveaway>, "id">): Promise<Giveaway> {
    const result = await this.giveaways.insert({
      ...data,
      guild_id: this.guildId,
    });

    return (await this.find(result.identifiers[0].id))!;
  }

  async update(id: number, data: Partial<Giveaway>): Promise<void> {
    await this.giveaways.update({ id, guild_id: this.guildId }, data);
  }
}

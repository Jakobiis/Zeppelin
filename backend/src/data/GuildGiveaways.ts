import { Repository } from "typeorm";
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

  // Most recently ended/cancelled giveaways first, capped at `limit` — used for the dashboard list and
  // `-giveaway list`, neither of which needs the full history.
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

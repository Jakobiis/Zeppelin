import moment from "moment-timezone";
import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { AfkStatus } from "./entities/AfkStatus.js";

export class GuildAfkStatuses extends BaseGuildRepository {
  private afkStatuses: Repository<AfkStatus>;

  constructor(guildId) {
    super(guildId);
    this.afkStatuses = dataSource.getRepository(AfkStatus);
  }

  async getByUserId(userId: string): Promise<AfkStatus | null> {
    return this.afkStatuses.findOne({
      where: {
        guild_id: this.guildId,
        user_id: userId,
      },
    });
  }

  async set(userId: string, message: string, previousNickname: string | null): Promise<void> {
    await this.delete(userId);
    await this.afkStatuses.insert({
      guild_id: this.guildId,
      user_id: userId,
      message,
      previous_nickname: previousNickname,
      created_at: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
    });
  }

  async delete(userId: string): Promise<void> {
    await this.afkStatuses.delete({
      guild_id: this.guildId,
      user_id: userId,
    });
  }
}

import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { StickyMessage } from "./entities/StickyMessage.js";

export class GuildStickyMessages extends BaseGuildRepository {
  private stickyMessages: Repository<StickyMessage>;

  constructor(guildId) {
    super(guildId);
    this.stickyMessages = dataSource.getRepository(StickyMessage);
  }

  find(name: string): Promise<StickyMessage | null> {
    return this.stickyMessages.findOne({
      where: {
        guild_id: this.guildId,
        name,
      },
    });
  }

  async create(name: string, channelId: string): Promise<StickyMessage> {
    const insertResult = await this.stickyMessages.insert({
      guild_id: this.guildId,
      name,
      channel_id: channelId,
      message_id: null,
    });

    return (await this.stickyMessages.findOne({
      where: { id: insertResult.identifiers[0].id },
    }))!;
  }

  /**
   * Points an existing sticky message entry at a new channel (e.g. its config's `channel` was changed) and
   * clears the stored message ID, since the old message lives in a different channel and is no longer relevant.
   */
  async updateChannel(id: number, channelId: string): Promise<void> {
    await this.stickyMessages.update({ id }, { channel_id: channelId, message_id: null });
  }

  async setMessageId(id: number, messageId: string | null): Promise<void> {
    await this.stickyMessages.update({ id }, { message_id: messageId });
  }

  /**
   * Deletes DB rows for sticky messages that are no longer present in config, so removing an entry from config
   * doesn't leave an orphaned row (and stale message) behind indefinitely.
   */
  async deleteUnused(namesToKeep: string[]): Promise<void> {
    const query = this.stickyMessages.createQueryBuilder().where("guild_id = :guildId", { guildId: this.guildId });

    if (namesToKeep.length) {
      query.andWhere("name NOT IN (:...names)", { names: namesToKeep });
    }

    await query.delete().execute();
  }
}

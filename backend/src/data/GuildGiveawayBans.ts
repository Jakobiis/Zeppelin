import moment from "moment-timezone";
import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { DBDateFormat } from "../utils.js";
import { GiveawayBan } from "./entities/GiveawayBan.js";

// A ban here is purely "this user can't enter/win giveaways in this guild" — separate from (and independent of)
// the optional Discord role a guild can configure to be granted alongside it (ban_role_id, see Giveaways/types.ts
// and functions/giveawayBans.ts). The DB row is always the source of truth for enforcement (checked on Enter —
// see events/giveawayButtonInteraction.ts); the role, when configured, is just a visible marker kept in sync by
// whichever caller (chat command or dashboard) actually applies the ban.
export class GuildGiveawayBans extends BaseGuildRepository {
  private bans: Repository<GiveawayBan>;

  constructor(guildId) {
    super(guildId);
    this.bans = dataSource.getRepository(GiveawayBan);
  }

  async isBanned(userId: string): Promise<boolean> {
    const row = await this.bans.findOne({ where: { guild_id: this.guildId, user_id: userId } });
    return row != null;
  }

  async ban(userId: string): Promise<void> {
    await this.bans.query(
      `INSERT INTO giveaway_bans (guild_id, user_id, created_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE guild_id = guild_id`,
      [this.guildId, userId, moment.utc().format(DBDateFormat)],
    );
  }

  async unban(userId: string): Promise<void> {
    await this.bans.delete({ guild_id: this.guildId, user_id: userId });
  }
}

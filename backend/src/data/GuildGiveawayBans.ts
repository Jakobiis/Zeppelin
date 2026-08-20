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

  // Used where the ban's own details (not just the yes/no from isBanned) are shown — the dashboard's "Giveaway
  // ban" card, so staff can see *why* someone was banned without needing to dig through mod logs/chat history.
  getBan(userId: string): Promise<GiveawayBan | null> {
    return this.bans.findOne({ where: { guild_id: this.guildId, user_id: userId } });
  }

  async ban(userId: string, reason: string | null): Promise<void> {
    await this.bans.query(
      `INSERT INTO giveaway_bans (guild_id, user_id, created_at, reason) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [this.guildId, userId, moment.utc().format(DBDateFormat), reason],
    );
  }

  async unban(userId: string): Promise<void> {
    await this.bans.delete({ guild_id: this.guildId, user_id: userId });
  }
}

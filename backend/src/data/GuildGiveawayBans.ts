import moment from "moment-timezone";
import { Brackets, Repository } from "typeorm";
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

  // A row with a past expires_at reads as "not currently banned" here — see the class comment on ban() for why
  // the row itself isn't deleted when that happens.
  private notExpired() {
    return new Brackets((qb) =>
      qb.where("expires_at IS NULL").orWhere("expires_at > :now", { now: moment.utc().format(DBDateFormat) }),
    );
  }

  async isBanned(userId: string): Promise<boolean> {
    const row = await this.bans
      .createQueryBuilder()
      .where("guild_id = :guildId", { guildId: this.guildId })
      .andWhere("user_id = :userId", { userId })
      .andWhere(this.notExpired())
      .getOne();
    return row != null;
  }

  // Used where the ban's own details (not just the yes/no from isBanned) are shown — the dashboard's "Giveaway
  // ban" card, so staff can see *why* (and until when) someone was banned without needing to dig through mod
  // logs/chat history. Same "expired = not banned" filtering as isBanned.
  getBan(userId: string): Promise<GiveawayBan | null> {
    return this.bans
      .createQueryBuilder()
      .where("guild_id = :guildId", { guildId: this.guildId })
      .andWhere("user_id = :userId", { userId })
      .andWhere(this.notExpired())
      .getOne();
  }

  // expiresAt: null for a permanent ban. Re-banning an already-banned user (e.g. to change the reason/duration)
  // overwrites both rather than requiring an unban first.
  async ban(userId: string, reason: string | null, expiresAt: string | null): Promise<void> {
    await this.bans.query(
      `INSERT INTO giveaway_bans (guild_id, user_id, created_at, reason, expires_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), expires_at = VALUES(expires_at)`,
      [this.guildId, userId, moment.utc().format(DBDateFormat), reason, expiresAt],
    );
  }

  async unban(userId: string): Promise<void> {
    await this.bans.delete({ guild_id: this.guildId, user_id: userId });
  }
}

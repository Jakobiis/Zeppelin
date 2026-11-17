import moment from "moment-timezone";
import { Repository } from "typeorm";
import { DBDateFormat } from "../utils.js";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { VerifiedMember } from "./entities/VerifiedMember.js";

/** When each member last received the JBCL verified role (recorded by JbclRoles on role add). */
export class GuildVerifiedMembers extends BaseGuildRepository {
  private verifiedMembers: Repository<VerifiedMember>;

  constructor(guildId: string) {
    super(guildId);
    this.verifiedMembers = dataSource.getRepository(VerifiedMember);
  }

  async markVerified(userId: string): Promise<void> {
    await this.verifiedMembers.upsert(
      { guild_id: this.guildId, user_id: userId, verified_at: moment.utc().format(DBDateFormat) },
      ["guild_id", "user_id"],
    );
  }

  /** Unix ms, or null if never recorded (e.g. verified before this table existed). */
  async getVerifiedAt(userId: string): Promise<number | null> {
    const row = await this.verifiedMembers.findOne({ where: { guild_id: this.guildId, user_id: userId } });
    return row ? moment.utc(row.verified_at, DBDateFormat).valueOf() : null;
  }
}

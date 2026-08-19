import moment from "moment-timezone";
import { Repository } from "typeorm";
import { DBDateFormat } from "../utils.js";
import { BaseRepository } from "./BaseRepository.js";
import { dataSource } from "./dataSource.js";
import { Giveaway } from "./entities/Giveaway.js";

// Cross-guild repository, used only by the upcoming-giveaways loop (which needs to scan every guild's due-soon
// giveaways at once) — plugin code should use the guild-scoped GuildGiveaways instead.
export class Giveaways extends BaseRepository {
  private giveaways: Repository<Giveaway>;

  constructor() {
    super();
    this.giveaways = dataSource.getRepository(Giveaway);
  }

  getGiveawaysDueSoon(threshold: number): Promise<Giveaway[]> {
    const thresholdDateStr = moment.utc().add(threshold, "ms").format(DBDateFormat);
    return this.giveaways
      .createQueryBuilder()
      .where("status = :status", { status: "running" })
      .andWhere("ends_at <= :date", { date: thresholdDateStr })
      .getMany();
  }

  // Bounded candidate set for the claim-deadlines loop — ended giveaways with a claim requirement at all.
  // winner_claim_deadlines is a JSON blob (not a plain column), so it can't be filtered at the SQL level for
  // "due soon"; the loop does that part in JS against this small, already-filtered set.
  getGiveawaysWithPendingClaims(): Promise<Giveaway[]> {
    return this.giveaways
      .createQueryBuilder()
      .where("status = :status", { status: "ended" })
      .andWhere("claim_time_ms IS NOT NULL")
      .getMany();
  }

  // Looked up by numeric PK alone (no guild filter) — used by the finalize/roll logic in
  // plugins/Giveaways/functions/, which is shared between the bot process and the API process and therefore
  // deliberately doesn't route through the guild-scoped GuildGiveaways.
  find(id: number): Promise<Giveaway | null> {
    return this.giveaways.findOne({ where: { id } });
  }

  async update(id: number, data: Partial<Giveaway>): Promise<void> {
    await this.giveaways.update({ id }, data);
  }
}

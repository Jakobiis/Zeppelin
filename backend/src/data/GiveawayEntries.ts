import moment from "moment-timezone";
import { Repository } from "typeorm";
import { DBDateFormat } from "../utils.js";
import { BaseRepository } from "./BaseRepository.js";
import { dataSource } from "./dataSource.js";
import { GiveawayEntry } from "./entities/GiveawayEntry.js";

// Not guild-scoped — every query here is already scoped by giveaway_id, which itself belongs to exactly one
// guild, so there's no guildId to key a BaseGuildRepository instance on. Also needs to work from the API
// process (see GuildGiveaways.ts for why that matters), where there's no live guild/member context at all.
export class GiveawayEntries extends BaseRepository {
  private entries: Repository<GiveawayEntry>;

  constructor() {
    super();
    this.entries = dataSource.getRepository(GiveawayEntry);
  }

  getForGiveaway(giveawayId: number): Promise<GiveawayEntry[]> {
    return this.entries.find({ where: { giveaway_id: giveawayId } });
  }

  getForUser(giveawayId: number, userId: string): Promise<GiveawayEntry | null> {
    return this.entries.findOne({ where: { giveaway_id: giveawayId, user_id: userId } });
  }

  count(giveawayId: number): Promise<number> {
    return this.entries.count({ where: { giveaway_id: giveawayId } });
  }

  async add(giveawayId: number, userId: string, entryCount: number): Promise<GiveawayEntry> {
    await this.entries.insert({
      giveaway_id: giveawayId,
      user_id: userId,
      entries: entryCount,
      entered_at: moment.utc().format(DBDateFormat),
    });

    return (await this.getForUser(giveawayId, userId))!;
  }

  // Used when a user is banned from giveaways (see functions/giveawayBans.ts) to pull them out of every running
  // giveaway they'd entered — a plain delete, since there's no "undo" concept for an entry the way a win has a
  // reroll.
  async remove(giveawayId: number, userId: string): Promise<void> {
    await this.entries.delete({ giveaway_id: giveawayId, user_id: userId });
  }
}

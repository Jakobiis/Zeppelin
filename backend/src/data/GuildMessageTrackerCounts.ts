import moment from "moment-timezone";
import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { MessageTrackerCount } from "./entities/MessageTrackerCount.js";

export interface MessageCounts {
  daily: number;
  weekly: number;
  monthly: number;
  allTime: number;
}

// 2^31-1 — matches Counters' MAX_COUNTER_VALUE, safely within the unsigned int columns these are stored in.
const MAX_COUNT_VALUE = 2147483647;

// The current daily/weekly (ISO, Monday-start)/monthly bucket keys, as stored in daily_date/weekly_start/
// monthly_month — a row's count for a given period is only meaningful if its stored key still matches the
// current one; otherwise that period has rolled over and the count is stale (see readCounts below).
function currentDailyKey(): string {
  return moment.utc().format("YYYY-MM-DD");
}
function currentWeeklyKey(): string {
  return moment.utc().startOf("isoWeek").format("YYYY-MM-DD");
}
function currentMonthlyKey(): string {
  return moment.utc().format("YYYY-MM");
}

// Reads a stored row into display-ready counts, treating any period whose stored bucket key doesn't match the
// current one as 0 — a user who last messaged yesterday has a stale (non-zero) daily_count sitting in the row
// until their next message triggers a fresh upsert, but "today" should still correctly read as 0 in the meantime.
function readCounts(row: Pick<MessageTrackerCount, "all_time_count" | "daily_count" | "daily_date" | "weekly_count" | "weekly_start" | "monthly_count" | "monthly_month">): MessageCounts {
  return {
    daily: row.daily_date === currentDailyKey() ? row.daily_count : 0,
    weekly: row.weekly_start === currentWeeklyKey() ? row.weekly_count : 0,
    monthly: row.monthly_month === currentMonthlyKey() ? row.monthly_count : 0,
    allTime: row.all_time_count,
  };
}

export class GuildMessageTrackerCounts extends BaseGuildRepository {
  private counts: Repository<MessageTrackerCount>;

  constructor(guildId) {
    super(guildId);
    this.counts = dataSource.getRepository(MessageTrackerCount);
  }

  /**
   * Records one message from userId, atomically incrementing all four counters in a single upsert. Each
   * period's counter resets to 1 (rather than incrementing) if the row's stored bucket key doesn't match the
   * current one — i.e. the rollover happens lazily, on the first message of a new day/week/month, rather than
   * needing a scheduled job to reset every row at midnight.
   */
  async recordMessage(userId: string): Promise<void> {
    const dailyKey = currentDailyKey();
    const weeklyKey = currentWeeklyKey();
    const monthlyKey = currentMonthlyKey();

    await this.counts.query(
      `
      INSERT INTO message_tracker_counts
        (guild_id, user_id, all_time_count, daily_count, daily_date, weekly_count, weekly_start, monthly_count, monthly_month)
      VALUES (?, ?, 1, 1, ?, 1, ?, 1, ?)
      ON DUPLICATE KEY UPDATE
        all_time_count = all_time_count + 1,
        daily_count = IF(daily_date = ?, daily_count + 1, 1),
        daily_date = ?,
        weekly_count = IF(weekly_start = ?, weekly_count + 1, 1),
        weekly_start = ?,
        monthly_count = IF(monthly_month = ?, monthly_count + 1, 1),
        monthly_month = ?
    `,
      [
        this.guildId,
        userId,
        dailyKey,
        weeklyKey,
        monthlyKey,
        dailyKey,
        dailyKey,
        weeklyKey,
        weeklyKey,
        monthlyKey,
        monthlyKey,
      ],
    );
  }

  /**
   * Overwrites one period's count for userId to `amount` — for staff correcting a mistracked count. Also stamps
   * that period's bucket key to the *current* one, since otherwise the value set here would immediately read
   * back as stale (see readCounts) the moment the current day/week/month doesn't match whatever the row already
   * had stored. The other three periods are left untouched (or, for a brand new row, start at 0/the current
   * bucket key, same as if the user had simply never sent a message before).
   */
  async setCount(userId: string, period: "daily" | "weekly" | "monthly" | "allTime", amount: number): Promise<void> {
    const value = Math.min(Math.max(Math.round(amount), 0), MAX_COUNT_VALUE);
    const dailyKey = currentDailyKey();
    const weeklyKey = currentWeeklyKey();
    const monthlyKey = currentMonthlyKey();

    const insertColumns = `
      (guild_id, user_id, all_time_count, daily_count, daily_date, weekly_count, weekly_start, monthly_count, monthly_month)
    `;

    if (period === "allTime") {
      await this.counts.query(
        `INSERT INTO message_tracker_counts ${insertColumns} VALUES (?, ?, ?, 0, ?, 0, ?, 0, ?)
         ON DUPLICATE KEY UPDATE all_time_count = ?`,
        [this.guildId, userId, value, dailyKey, weeklyKey, monthlyKey, value],
      );
    } else if (period === "daily") {
      await this.counts.query(
        `INSERT INTO message_tracker_counts ${insertColumns} VALUES (?, ?, 0, ?, ?, 0, ?, 0, ?)
         ON DUPLICATE KEY UPDATE daily_count = ?, daily_date = ?`,
        [this.guildId, userId, value, dailyKey, weeklyKey, monthlyKey, value, dailyKey],
      );
    } else if (period === "weekly") {
      await this.counts.query(
        `INSERT INTO message_tracker_counts ${insertColumns} VALUES (?, ?, 0, 0, ?, ?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE weekly_count = ?, weekly_start = ?`,
        [this.guildId, userId, dailyKey, value, weeklyKey, monthlyKey, value, weeklyKey],
      );
    } else {
      await this.counts.query(
        `INSERT INTO message_tracker_counts ${insertColumns} VALUES (?, ?, 0, 0, ?, 0, ?, ?, ?)
         ON DUPLICATE KEY UPDATE monthly_count = ?, monthly_month = ?`,
        [this.guildId, userId, dailyKey, weeklyKey, value, monthlyKey, value, monthlyKey],
      );
    }
  }

  async getForUser(userId: string): Promise<MessageCounts> {
    const row = await this.counts.findOne({
      where: { guild_id: this.guildId, user_id: userId },
    });
    if (!row) {
      return { daily: 0, weekly: 0, monthly: 0, allTime: 0 };
    }
    return readCounts(row);
  }

  /**
   * Top userIds + counts for the given period. For "allTime" this is a plain sort; for the rolling periods, rows
   * whose bucket key doesn't match the current one are excluded outright (their count would just read as 0 —
   * see readCounts) rather than sorted in among real values.
   */
  async getTop(
    period: "daily" | "weekly" | "monthly" | "allTime",
    limit: number,
    offset: number,
  ): Promise<Array<{ userId: string; count: number }>> {
    const query = this.counts.createQueryBuilder("mtc").where("mtc.guild_id = :guildId", { guildId: this.guildId });

    if (period === "allTime") {
      query.andWhere("mtc.all_time_count > 0").orderBy("mtc.all_time_count", "DESC");
    } else if (period === "daily") {
      query.andWhere("mtc.daily_date = :key", { key: currentDailyKey() }).orderBy("mtc.daily_count", "DESC");
    } else if (period === "weekly") {
      query.andWhere("mtc.weekly_start = :key", { key: currentWeeklyKey() }).orderBy("mtc.weekly_count", "DESC");
    } else {
      query.andWhere("mtc.monthly_month = :key", { key: currentMonthlyKey() }).orderBy("mtc.monthly_count", "DESC");
    }

    const rows = await query.addOrderBy("mtc.id", "ASC").limit(limit).offset(offset).getMany();
    return rows.map((row) => ({ userId: row.user_id, count: readCounts(row)[period === "allTime" ? "allTime" : period] }));
  }

  async getTopCount(period: "daily" | "weekly" | "monthly" | "allTime"): Promise<number> {
    const query = this.counts.createQueryBuilder("mtc").where("mtc.guild_id = :guildId", { guildId: this.guildId });

    if (period === "allTime") {
      query.andWhere("mtc.all_time_count > 0");
    } else if (period === "daily") {
      query.andWhere("mtc.daily_date = :key", { key: currentDailyKey() });
    } else if (period === "weekly") {
      query.andWhere("mtc.weekly_start = :key", { key: currentWeeklyKey() });
    } else {
      query.andWhere("mtc.monthly_month = :key", { key: currentMonthlyKey() });
    }

    return query.getCount();
  }
}

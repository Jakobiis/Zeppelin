import moment from "moment-timezone";
import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { MessageTrackerChannelCount } from "./entities/MessageTrackerChannelCount.js";
import { MessageCounts } from "./GuildMessageTrackerCounts.js";

function currentDailyKey(): string {
  return moment.utc().format("YYYY-MM-DD");
}
function currentWeeklyKey(): string {
  return moment.utc().startOf("isoWeek").format("YYYY-MM-DD");
}
function currentMonthlyKey(): string {
  return moment.utc().format("YYYY-MM");
}

function readCounts(row: Pick<MessageTrackerChannelCount, "all_time_count" | "daily_count" | "daily_date" | "weekly_count" | "weekly_start" | "monthly_count" | "monthly_month">): MessageCounts {
  return {
    daily: row.daily_date === currentDailyKey() ? row.daily_count : 0,
    weekly: row.weekly_start === currentWeeklyKey() ? row.weekly_count : 0,
    monthly: row.monthly_month === currentMonthlyKey() ? row.monthly_count : 0,
    allTime: row.all_time_count,
  };
}

// Per-channel counterpart to GuildMessageTrackerCounts, tracking the same four rolling periods but scoped to one
// channel at a time (used for `-messages leaderboard -channel #x`). Only starts accumulating from whenever a
// channel is first tracked, so a channel's leaderboard is empty until messages are sent there after that point.
export class GuildMessageTrackerChannelCounts extends BaseGuildRepository {
  private counts: Repository<MessageTrackerChannelCount>;

  constructor(guildId) {
    super(guildId);
    this.counts = dataSource.getRepository(MessageTrackerChannelCount);
  }

  async recordMessage(channelId: string, userId: string): Promise<void> {
    const dailyKey = currentDailyKey();
    const weeklyKey = currentWeeklyKey();
    const monthlyKey = currentMonthlyKey();

    await this.counts.query(
      `
      INSERT INTO message_tracker_channel_counts
        (guild_id, channel_id, user_id, all_time_count, daily_count, daily_date, weekly_count, weekly_start, monthly_count, monthly_month)
      VALUES (?, ?, ?, 1, 1, ?, 1, ?, 1, ?)
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
        channelId,
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

  // Credits `amount` messages to `userId` in `channelId`, for one specific period only (mirrors
  // GuildMessageTrackerCounts.setCount's per-period independence — giving to "allTime" doesn't touch the
  // daily/weekly/monthly buckets and vice versa). Used when a dashboard "Give" attributes manually-credited
  // messages to a channel, so that channel's own leaderboard/top-channels stats stay consistent with the
  // user's overall count instead of only the organic recordMessage path ever touching this table. Same
  // stale-bucket-resets-to-the-new-amount semantics as recordMessage, just adding `amount` instead of 1.
  async addCount(channelId: string, userId: string, period: "daily" | "weekly" | "monthly" | "allTime", amount: number): Promise<void> {
    const dailyKey = currentDailyKey();
    const weeklyKey = currentWeeklyKey();
    const monthlyKey = currentMonthlyKey();

    const insertAllTime = period === "allTime" ? amount : 0;
    const insertDaily = period === "daily" ? amount : 0;
    const insertWeekly = period === "weekly" ? amount : 0;
    const insertMonthly = period === "monthly" ? amount : 0;

    let updateSql: string;
    let updateParams: (string | number)[];
    if (period === "allTime") {
      updateSql = "all_time_count = all_time_count + ?";
      updateParams = [amount];
    } else if (period === "daily") {
      updateSql = "daily_count = IF(daily_date = ?, daily_count + ?, ?), daily_date = ?";
      updateParams = [dailyKey, amount, amount, dailyKey];
    } else if (period === "weekly") {
      updateSql = "weekly_count = IF(weekly_start = ?, weekly_count + ?, ?), weekly_start = ?";
      updateParams = [weeklyKey, amount, amount, weeklyKey];
    } else {
      updateSql = "monthly_count = IF(monthly_month = ?, monthly_count + ?, ?), monthly_month = ?";
      updateParams = [monthlyKey, amount, amount, monthlyKey];
    }

    await this.counts.query(
      `
      INSERT INTO message_tracker_channel_counts
        (guild_id, channel_id, user_id, all_time_count, daily_count, daily_date, weekly_count, weekly_start, monthly_count, monthly_month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE ${updateSql}
    `,
      [this.guildId, channelId, userId, insertAllTime, insertDaily, dailyKey, insertWeekly, weeklyKey, insertMonthly, monthlyKey, ...updateParams],
    );
  }

  async getTop(
    channelId: string,
    period: "daily" | "weekly" | "monthly" | "allTime",
    limit: number,
    offset: number,
  ): Promise<Array<{ userId: string; count: number }>> {
    const query = this.counts
      .createQueryBuilder("mtcc")
      .where("mtcc.guild_id = :guildId", { guildId: this.guildId })
      .andWhere("mtcc.channel_id = :channelId", { channelId });

    if (period === "allTime") {
      query.andWhere("mtcc.all_time_count > 0").orderBy("mtcc.all_time_count", "DESC");
    } else if (period === "daily") {
      query.andWhere("mtcc.daily_date = :key", { key: currentDailyKey() }).orderBy("mtcc.daily_count", "DESC");
    } else if (period === "weekly") {
      query.andWhere("mtcc.weekly_start = :key", { key: currentWeeklyKey() }).orderBy("mtcc.weekly_count", "DESC");
    } else {
      query.andWhere("mtcc.monthly_month = :key", { key: currentMonthlyKey() }).orderBy("mtcc.monthly_count", "DESC");
    }

    const rows = await query.addOrderBy("mtcc.id", "ASC").limit(limit).offset(offset).getMany();
    return rows.map((row) => ({ userId: row.user_id, count: readCounts(row)[period === "allTime" ? "allTime" : period] }));
  }

  async getTopCount(channelId: string, period: "daily" | "weekly" | "monthly" | "allTime"): Promise<number> {
    const query = this.counts
      .createQueryBuilder("mtcc")
      .where("mtcc.guild_id = :guildId", { guildId: this.guildId })
      .andWhere("mtcc.channel_id = :channelId", { channelId });

    if (period === "allTime") {
      query.andWhere("mtcc.all_time_count > 0");
    } else if (period === "daily") {
      query.andWhere("mtcc.daily_date = :key", { key: currentDailyKey() });
    } else if (period === "weekly") {
      query.andWhere("mtcc.weekly_start = :key", { key: currentWeeklyKey() });
    } else {
      query.andWhere("mtcc.monthly_month = :key", { key: currentMonthlyKey() });
    }

    return query.getCount();
  }

  // Top channels by message volume for the given period — unlike getTop (top *users within one channel*), this
  // sums across all users *per channel* to rank the channels themselves. Rolling periods only sum rows whose
  // bucket key matches the current one (same "stale = 0" semantics as readCounts) by excluding stale rows from
  // the SUM entirely rather than including them at a wrong value.
  async getTopChannels(
    period: "daily" | "weekly" | "monthly" | "allTime",
    limit: number,
  ): Promise<Array<{ channelId: string; count: number }>> {
    const qb = this.counts.createQueryBuilder("mtcc").where("mtcc.guild_id = :guildId", { guildId: this.guildId });

    let countColumn: string;
    if (period === "allTime") {
      countColumn = "mtcc.all_time_count";
    } else if (period === "daily") {
      qb.andWhere("mtcc.daily_date = :key", { key: currentDailyKey() });
      countColumn = "mtcc.daily_count";
    } else if (period === "weekly") {
      qb.andWhere("mtcc.weekly_start = :key", { key: currentWeeklyKey() });
      countColumn = "mtcc.weekly_count";
    } else {
      qb.andWhere("mtcc.monthly_month = :key", { key: currentMonthlyKey() });
      countColumn = "mtcc.monthly_count";
    }

    const raw = await qb
      .select("mtcc.channel_id", "channelId")
      .addSelect(`SUM(${countColumn})`, "count")
      .groupBy("mtcc.channel_id")
      .orderBy("count", "DESC")
      .limit(limit)
      .getRawMany<{ channelId: string; count: string }>();

    return raw.map((r) => ({ channelId: r.channelId, count: Number(r.count) }));
  }
}

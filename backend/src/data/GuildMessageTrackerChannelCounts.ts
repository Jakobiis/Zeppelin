import moment from "moment-timezone";
import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { MessageTrackerChannelCount } from "./entities/MessageTrackerChannelCount.js";
import { MessageCounts } from "./GuildMessageTrackerCounts.js";

// 2^31-1 — matches Counters' MAX_COUNTER_VALUE, safely within the unsigned int columns these are stored in.
const MAX_COUNT_VALUE = 2147483647;

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
}

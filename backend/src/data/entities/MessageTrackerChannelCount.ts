import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("message_tracker_channel_counts")
export class MessageTrackerChannelCount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  guild_id: string;

  @Column({ type: "bigint" })
  channel_id: string;

  @Column({ type: "bigint" })
  user_id: string;

  @Column()
  all_time_count: number;

  @Column()
  daily_count: number;

  // "YYYY-MM-DD" of the date daily_count is for — if this doesn't match today's date, daily_count is stale and
  // should be treated as 0 rather than trusted as-is (see GuildMessageTrackerChannelCounts).
  @Column({ type: "varchar", length: 10 })
  daily_date: string;

  @Column()
  weekly_count: number;

  // "YYYY-MM-DD" of the (ISO, Monday-start) week weekly_count is for.
  @Column({ type: "varchar", length: 10 })
  weekly_start: string;

  @Column()
  monthly_count: number;

  // "YYYY-MM" of the month monthly_count is for.
  @Column({ type: "varchar", length: 7 })
  monthly_month: string;
}

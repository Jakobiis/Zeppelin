import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("schedule_states")
export class ScheduleState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() schedule_name: string;

  @Column() active: boolean;

  @Column({ type: "datetime", nullable: true }) active_until: string | null;

  @Column({ type: "bigint", nullable: true }) last_duration_ms: string | null;

  @Column({ type: "bigint", nullable: true }) last_rolled_bucket: string | null;

  @Column({ type: "datetime", nullable: true }) last_remind_at: string | null;
}

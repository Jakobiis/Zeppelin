import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export type GiveawayStatus = "running" | "ended" | "cancelled";

export type GiveawayMessageRequirement = {
  period: "daily" | "weekly" | "monthly" | "allTime";
  count: number;
};

@Entity("giveaways")
export class Giveaway {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() channel_id: string;

  @Column({ type: String, nullable: true }) message_id: string | null;

  @Column() host_id: string;

  @Column() prize: string;

  @Column() winner_count: number;

  @Column() ends_at: string;

  @Column({ type: String, nullable: true }) ended_at: string | null;

  @Column() status: GiveawayStatus;

  @Column({ type: Number, nullable: true }) embed_color: number | null;

  @Column("simple-json") required_role_ids: string[];

  @Column("simple-json") bypass_role_ids: string[];

  @Column("simple-json") blacklisted_role_ids: string[];

  @Column("simple-json") extra_entries: Record<string, number>;

  @Column({ type: "simple-json", nullable: true }) message_requirement: GiveawayMessageRequirement | null;

  @Column("simple-json") winner_ids: string[];

  @Column() created_at: string;
}

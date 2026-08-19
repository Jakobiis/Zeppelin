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

  // Each winner gets their own private thread with the host (created on demand from the "Create Thread" button
  // on the winner announcement — see functions/giveawayThread.ts) — winners don't share one. Maps winner user
  // ID -> thread ID; a winner with no entry here hasn't created theirs yet.
  @Column("simple-json") winner_thread_ids: Record<string, string>;

  @Column({ type: Number, nullable: true }) embed_color: number | null;

  @Column("simple-json") required_role_ids: string[];

  @Column("simple-json") bypass_role_ids: string[];

  @Column("simple-json") blacklisted_role_ids: string[];

  @Column("simple-json") extra_entries: Record<string, number>;

  @Column({ type: "simple-json", nullable: true }) message_requirement: GiveawayMessageRequirement | null;

  // winner_ids is append-only full history (initial roll + every manual/claim-expiry reroll) — never shrinks.
  // expired_winner_ids/claimed_winner_ids are subsets of it. A winner in winner_ids that's in neither, with an
  // entry in winner_claim_deadlines, still has a pending claim; one with no entry anywhere never had a claim
  // requirement (claim_time_ms wasn't set when they were picked).
  @Column("simple-json") winner_ids: string[];

  // Null (the default) means no claim requirement — winners aren't rerolled for failing to click Claim.
  @Column({ type: Number, nullable: true }) claim_time_ms: number | null;

  @Column("simple-json") claimed_winner_ids: string[];

  @Column("simple-json") expired_winner_ids: string[];

  // Pending winner user ID -> claim deadline (DBDateFormat). See data/loops/upcomingClaimDeadlinesLoop.ts.
  @Column("simple-json") winner_claim_deadlines: Record<string, string>;

  @Column() created_at: string;
}

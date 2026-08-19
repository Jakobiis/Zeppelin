import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export type GiveawayStatus = "running" | "ended" | "cancelled";

// max: null means no upper bound (a plain minimum) — every count-based requirement uses this same shape.
export type GiveawayCountRange = {
  min: number;
  max: number | null;
};

export type GiveawayMessageRequirement = {
  period: "daily" | "weekly" | "monthly" | "allTime";
} & GiveawayCountRange;

// A value range on any named Counters-plugin counter — e.g. "activity points". There's no fixed/guaranteed
// counter name for that concept in this codebase (it's whatever a guild's Automod add_to_counter rules target),
// so staff specify the counter name themselves rather than one being assumed.
export type GiveawayCounterRequirement = {
  counter_name: string;
} & GiveawayCountRange;

@Entity("giveaways")
export class Giveaway {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() channel_id: string;

  @Column({ type: String, nullable: true }) message_id: string | null;

  @Column() host_id: string;

  // Non-null means a staff member is physically holding the prize rather than it being handed out directly —
  // set when staff_held is toggled on at creation. That staff member gets added to each winner's thread
  // alongside the host (see functions/giveawayThread.ts) so they can coordinate handoff.
  @Column({ type: String, nullable: true }) holder_id: string | null;

  @Column() prize: string;

  @Column() winner_count: number;

  @Column() ends_at: string;

  @Column({ type: String, nullable: true }) ended_at: string | null;

  @Column() status: GiveawayStatus;

  // Each winner gets their own private thread with the host (created on demand from the "Create Thread" button
  // on the winner announcement — see functions/giveawayThread.ts) — winners don't share one. Maps winner user
  // ID -> thread ID; a winner with no entry here hasn't created theirs yet.
  @Column("simple-json") winner_thread_ids: Record<string, string>;

  // Winner IDs whose thread was closed on purpose — via the "Delete Thread" button, or automatically once every
  // current winner has claimed (see claimGiveaway.ts) — as opposed to just having no entry in winner_thread_ids
  // (never created one) or losing it to a reroll (cleanupGiveawayThreads.ts already deletes those without
  // marking this, since a rerolled winner isn't done, they no longer hold the prize at all). Checked before
  // letting a winner create a new thread: a deliberate close means "the handoff is finished," not "go make
  // another one" the way a thread that just went missing for some other reason would.
  @Column("simple-json") winner_thread_closed_ids: string[];

  @Column({ type: Number, nullable: true }) embed_color: number | null;

  @Column("simple-json") required_role_ids: string[];

  @Column("simple-json") bypass_role_ids: string[];

  @Column("simple-json") blacklisted_role_ids: string[];

  @Column("simple-json") extra_entries: Record<string, number>;

  @Column({ type: "simple-json", nullable: true }) message_requirement: GiveawayMessageRequirement | null;

  @Column({ type: "simple-json", nullable: true }) counter_requirement: GiveawayCounterRequirement | null;

  // Economy balance range to enter — read from whatever counter Economy is actually configured to use (see
  // functions/counterRequirements.ts's getCoinsValueForUser), not a fixed counter name.
  @Column({ type: "simple-json", nullable: true }) coins_requirement: GiveawayCountRange | null;

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

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("giveaway_bans")
export class GiveawayBan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() user_id: string;

  @Column() created_at: string;

  @Column({ type: "varchar", length: 500, nullable: true }) reason: string | null;

  // null = permanent. Once past, the ban stops being enforced (see GuildGiveawayBans.isBanned/getBan) — the row
  // itself isn't cleaned up automatically (no scheduled loop for it, unlike mutes/tempbans), it just reads as
  // "not banned" from here on.
  @Column({ type: "datetime", nullable: true }) expires_at: string | null;
}

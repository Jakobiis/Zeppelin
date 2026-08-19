import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("giveaway_bans")
export class GiveawayBan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() user_id: string;

  @Column() created_at: string;
}

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("giveaway_entries")
export class GiveawayEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() giveaway_id: number;

  @Column() user_id: string;

  @Column() entries: number;

  @Column() entered_at: string;
}

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("afk_statuses")
export class AfkStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() user_id: string;

  @Column() message: string;

  @Column({ type: "text", nullable: true })
  previous_nickname: string | null;

  @Column() created_at: string;
}

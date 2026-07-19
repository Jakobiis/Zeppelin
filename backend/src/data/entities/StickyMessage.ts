import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("sticky_messages")
export class StickyMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guild_id: string;

  @Column()
  name: string;

  @Column()
  channel_id: string;

  @Column({ type: String, nullable: true })
  message_id: string | null;
}

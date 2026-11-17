import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("verified_members")
export class VerifiedMember {
  @Column()
  @PrimaryColumn()
  guild_id: string;

  @Column()
  @PrimaryColumn()
  user_id: string;

  @Column() verified_at: string;
}

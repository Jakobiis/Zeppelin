import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("economy_active_boosts")
export class EconomyActiveBoost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  guild_id: string;

  @Column({ type: "bigint" })
  user_id: string;

  // "coins" | "activity" — only one active boost per (guild, user, boost_type) at a time; buying a new one of
  // the same type overwrites this row rather than stacking (see GuildEconomyShop.purchaseBoost).
  @Column({ type: "varchar", length: 20 })
  boost_type: string;

  // Which shop.boosts config key granted this, purely for display (e.g. "!boosts").
  @Column({ type: "varchar", length: 32 })
  boost_key: string;

  @Column({ type: "double" })
  multiplier: number;

  @Column({ type: "datetime" })
  expires_at: string;
}

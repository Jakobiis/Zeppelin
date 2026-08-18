import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("economy_shop_stock")
export class EconomyShopStock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  guild_id: string;

  // Which shop.boosts config key this stock level is for.
  @Column({ type: "varchar", length: 32 })
  boost_key: string;

  @Column()
  stock_remaining: number;

  // When this item's stock was last topped up — used to lazily compute how many restock_interval periods have
  // elapsed on the next check, the same lazy-rollover approach GuildMessageTrackerCounts uses for its daily/
  // weekly/monthly buckets, rather than a scheduled job resetting every row.
  @Column({ type: "datetime" })
  last_restock_at: string;
}

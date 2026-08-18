import moment from "moment-timezone";
import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { DBDateFormat } from "../utils.js";
import { EconomyActiveBoost } from "./entities/EconomyActiveBoost.js";
import { EconomyShopStock } from "./entities/EconomyShopStock.js";

export type BoostType = "coins" | "activity";

export interface ActiveBoost {
  boostKey: string;
  multiplier: number;
  expiresAt: Date;
}

export class GuildEconomyShop extends BaseGuildRepository {
  private activeBoosts: Repository<EconomyActiveBoost>;
  private shopStock: Repository<EconomyShopStock>;

  constructor(guildId) {
    super(guildId);
    this.activeBoosts = dataSource.getRepository(EconomyActiveBoost);
    this.shopStock = dataSource.getRepository(EconomyShopStock);
  }

  /** The user's currently active boost of this type, or null if they don't have one (or it's expired). */
  async getActiveBoost(userId: string, boostType: BoostType): Promise<ActiveBoost | null> {
    const row = await this.activeBoosts.findOne({
      where: { guild_id: this.guildId, user_id: userId, boost_type: boostType },
    });
    if (!row || moment.utc(row.expires_at).isSameOrBefore(moment.utc())) {
      return null;
    }
    return { boostKey: row.boost_key, multiplier: row.multiplier, expiresAt: moment.utc(row.expires_at).toDate() };
  }

  /**
   * Grants userId a boost, replacing whatever's currently active for that boost_type (fresh multiplier, duration
   * counted from now) rather than stacking — buying a second 2x boost while a 1.5x one is still running just
   * gets you the 2x one for a fresh `durationMs`, not both multiplied together.
   */
  async purchaseBoost(
    userId: string,
    boostType: BoostType,
    boostKey: string,
    multiplier: number,
    durationMs: number,
  ): Promise<void> {
    const expiresAt = moment.utc().add(durationMs, "ms").format(DBDateFormat);
    await this.activeBoosts.query(
      `
      INSERT INTO economy_active_boosts (guild_id, user_id, boost_type, boost_key, multiplier, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE boost_key = ?, multiplier = ?, expires_at = ?
    `,
      [this.guildId, userId, boostType, boostKey, multiplier, expiresAt, boostKey, multiplier, expiresAt],
    );
  }

  /**
   * Current stock for a shop item, lazily restocking first if `restockAmount`/`restockIntervalMs` are given (same
   * lazy-rollover idea as GuildMessageTrackerCounts' daily/weekly/monthly buckets — no scheduled job needed).
   * `maxStock`/`restockAmount` should already be freshly rolled (see functions/numberOrRange.ts) by the caller if
   * configured as a range, since a range means "roll a new value every time stock is (re)filled" rather than one
   * fixed number forever. Seeds a fresh row (at `maxStock`) the first time an item's stock is checked. Partial
   * restock periods accrue proportionally and carry over (mirrors GuildCounters' decay math) rather than being
   * dropped, so frequent checks can't shortchange a slow restock rate.
   */
  async getStock(
    boostKey: string,
    maxStock: number,
    restockAmount: number | null,
    restockIntervalMs: number | null,
  ): Promise<number> {
    let row = await this.shopStock.findOne({ where: { guild_id: this.guildId, boost_key: boostKey } });

    if (!row) {
      const insertResult = await this.shopStock.insert({
        guild_id: this.guildId,
        boost_key: boostKey,
        stock_remaining: maxStock,
        last_restock_at: moment.utc().format(DBDateFormat),
      });
      row = (await this.shopStock.findOne({ where: { id: insertResult.identifiers[0].id } }))!;
    }

    if (!restockAmount || !restockIntervalMs) {
      return row.stock_remaining;
    }

    const elapsedMs = moment.utc().diff(moment.utc(row.last_restock_at), "ms");
    if (elapsedMs < restockIntervalMs) {
      return row.stock_remaining;
    }

    const periodRatio = elapsedMs / restockIntervalMs;
    const addAmount = Math.floor(periodRatio * restockAmount);
    if (addAmount === 0) {
      return row.stock_remaining;
    }

    const newStock = Math.min(maxStock, row.stock_remaining + addAmount);
    // Advances last_restock_at by exactly the time "spent" on the amount actually added (not all the way to
    // now), so any leftover fractional progress toward the next unit carries over instead of resetting to 0.
    const timeConsumedMs = (addAmount / restockAmount) * restockIntervalMs;
    const newLastRestockAt = moment.utc(row.last_restock_at).add(timeConsumedMs, "ms").format(DBDateFormat);

    await this.shopStock.update({ id: row.id }, { stock_remaining: newStock, last_restock_at: newLastRestockAt });

    return newStock;
  }

  /**
   * Atomically decrements stock by 1 if there's any left, returning whether it succeeded — a plain "check then
   * decrement" would race under concurrent purchases (two buyers both reading stock=1 and both succeeding).
   * Uses TypeORM's query builder (rather than a raw query) specifically so `.affected` is available — the shape
   * of a raw UPDATE's result differs by driver and isn't worth relying on here.
   */
  async decrementStock(boostKey: string): Promise<boolean> {
    const result = await this.shopStock
      .createQueryBuilder()
      .update(EconomyShopStock)
      .set({ stock_remaining: () => "stock_remaining - 1" })
      .where("guild_id = :guildId AND boost_key = :boostKey AND stock_remaining > 0", {
        guildId: this.guildId,
        boostKey,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Reverses a decrementStock() call — for when a purchase claims a stock slot but then fails to actually
   * charge the buyer (e.g. a balance race between an unlocked affordability pre-check and the real charge). */
  async incrementStock(boostKey: string): Promise<void> {
    await this.shopStock
      .createQueryBuilder()
      .update(EconomyShopStock)
      .set({ stock_remaining: () => "stock_remaining + 1" })
      .where("guild_id = :guildId AND boost_key = :boostKey", { guildId: this.guildId, boostKey })
      .execute();
  }
}

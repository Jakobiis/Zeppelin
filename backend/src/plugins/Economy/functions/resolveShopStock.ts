import { GuildPluginData } from "vety";
import { z } from "zod";
import { convertDelayStringToMS } from "../../../utils.js";
import { EconomyPluginType, zShopBoost } from "../types.js";
import { rollIntegerOrRange } from "./numberOrRange.js";

/**
 * Current stock for a shop boost (lazily restocking first if configured to), or null if it's unlimited (no
 * `stock` configured at all). `stock`/`restock_amount` are rolled fresh here if configured as a range — see
 * GuildEconomyShop.getStock for why that's the right place for the roll to happen.
 */
export async function resolveShopStock(
  pluginData: GuildPluginData<EconomyPluginType>,
  boostKey: string,
  boost: z.infer<typeof zShopBoost>,
): Promise<number | null> {
  if (boost.stock == null) return null;

  const maxStock = rollIntegerOrRange(boost.stock);
  const restockAmount = boost.restock_amount != null ? rollIntegerOrRange(boost.restock_amount) : null;
  const restockIntervalMs = boost.restock_interval ? convertDelayStringToMS(boost.restock_interval) : null;

  return pluginData.state.shop.getStock(boostKey, maxStock, restockAmount, restockIntervalMs);
}

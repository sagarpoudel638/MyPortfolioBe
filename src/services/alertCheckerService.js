// services/alertCheckerService.js
//
// Called after each price fetch cycle (from snapshotService).
// Checks every watchlist item that has an alert set and hasn't yet triggered.
// Creates a Notification document and marks alertTriggered = true when hit.

import Watchlist from "../models/Watchlist.js";
import Notification from "../models/Notification.js";
import { getPrices } from "./priceService.js";

export const checkPriceAlerts = async () => {
  // Find all watchlist items with an active, un-triggered alert
  const items = await Watchlist.find({
    priceAlertThreshold: { $ne: null },
    alertDirection:      { $ne: null },
    alertTriggered:      false,
  });

  if (items.length === 0) return;

  // Deduplicate tickers for a single price fetch
  const seen = new Set();
  const tickerList = [];
  for (const item of items) {
    const key = `${item.exchange}:${item.symbol}`;
    if (!seen.has(key)) {
      seen.add(key);
      tickerList.push({ ticker: item.symbol, exchange: item.exchange });
    }
  }

  let prices;
  try {
    prices = await getPrices(tickerList);
  } catch (err) {
    console.error("[AlertChecker] Price fetch failed:", err.message);
    return;
  }

  for (const item of items) {
    const priceKey  = `${item.exchange}:${item.symbol}`;
    const priceData = prices[priceKey];
    const livePrice = priceData?.price;

    if (livePrice == null) continue;

    const threshold = parseFloat(item.priceAlertThreshold);
    const triggered =
      item.alertDirection === "above"
        ? livePrice >= threshold
        : livePrice <= threshold;

    if (!triggered) continue;

    const directionLabel = item.alertDirection === "above" ? "crossed above" : "dropped below";
    const currency = item.exchange === "NEPSE" ? "NPR" : item.exchange === "ASX" ? "AUD" : "USD";

    const message = `${item.symbol} ${directionLabel} your target of ${currency} ${threshold.toLocaleString()} — now at ${currency} ${livePrice.toLocaleString()}`;

    try {
      // Create notification
      await Notification.create({
        userId:   item.userId,
        type:     "price_alert",
        message,
        ticker:   item.symbol,
        exchange: item.exchange,
      });

      // Mark the alert as triggered so it doesn't fire again
      await Watchlist.findByIdAndUpdate(item._id, { alertTriggered: true });

      console.log(`[AlertChecker] Alert fired for ${item.symbol} (user ${item.userId})`);
    } catch (err) {
      console.error(`[AlertChecker] Failed to save notification for ${item.symbol}:`, err.message);
    }
  }
};

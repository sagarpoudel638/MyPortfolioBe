// services/snapshotService.js
import Holding from "../models/Holding.js";
import Snapshot from "../models/Snapshot.js";
import User from "../models/User.js";
import { getPrices } from "./priceService.js";
import { getFxRates, toAUD } from "./fxService.js";

const PLATFORM_META = {
  CommBank:      { key: "commbank",      currency: "AUD" },
  CommSecPocket: { key: "commsecpocket", currency: "AUD" },
  Webull:        { key: "webull",        currency: "USD" },
  Meroshare:     { key: "meroshare",     currency: "NPR" },
};

export const takeSnapshotForUser = async (userId) => {
  const holdings = await Holding.find({ userId, isTracking: true });
  if (holdings.length === 0) return null;

  // Build ticker list
  const seen = new Set();
  const tickerList = [];
  for (const h of holdings) {
    const key = `${h.exchange}:${h.ticker}`;
    if (!seen.has(key)) {
      seen.add(key);
      tickerList.push({ ticker: h.ticker, exchange: h.exchange });
    }
  }

  const user = await User.findById(userId);
  const [prices, fxRates] = await Promise.all([
    getPrices(tickerList),
    getFxRates(user?.baseCurrency || "AUD"),
  ]);

  // Group by platform
  const grouped = {};
  for (const h of holdings) {
    if (!grouped[h.platform]) grouped[h.platform] = [];
    grouped[h.platform].push(h);
  }

  let totalValueAUD    = 0;
  let totalInvestedAUD = 0;
  const platforms      = {};

  for (const [platform, platformHoldings] of Object.entries(grouped)) {
    const meta     = PLATFORM_META[platform];
    const currency = meta?.currency || "AUD";
    let platformValue    = 0;
    let platformInvested = 0;

    for (const h of platformHoldings) {
      const priceData    = prices[`${h.exchange}:${h.ticker}`];
      const qty          = parseFloat(h.qty);
      const buyPrice     = parseFloat(h.buyPrice);
      const currentPrice = h.manualCurrentPrice
        ? parseFloat(h.manualCurrentPrice)
        : priceData?.price ?? null;

      if (currentPrice === null) continue;

      const value    = qty * currentPrice;
      const invested = h.isFreeAllotment ? 0 : qty * buyPrice;

      platformValue    += value;
      platformInvested += invested;
    }

    totalValueAUD    += toAUD(platformValue,    currency, fxRates);
    totalInvestedAUD += toAUD(platformInvested, currency, fxRates);

    if (meta) {
      platforms[meta.key] = {
        value:    parseFloat(platformValue.toFixed(2)),
        currency,
      };
    }
  }

  // Midnight UTC today as the snapshot date
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);

  // Upsert — one snapshot per user per day
  const snapshot = await Snapshot.findOneAndUpdate(
    { userId, date },
    {
      userId,
      date,
      totalValueAUD:    parseFloat(totalValueAUD.toFixed(2)),
      totalInvestedAUD: parseFloat(totalInvestedAUD.toFixed(2)),
      platforms,
    },
    { upsert: true, returnDocument: "after" }
  );

  return snapshot;
};

// Run for all users — called by cron
export const takeSnapshotsForAllUsers = async () => {
  const users = await User.find({ isVerified: true });
  console.log(`[Snapshot] Taking snapshots for ${users.length} users`);

  for (const user of users) {
    try {
      await takeSnapshotForUser(user._id);
      console.log(`[Snapshot] Done for ${user.email}`);
    } catch (err) {
      console.error(`[Snapshot] Failed for ${user.email}:`, err.message);
    }
  }
};
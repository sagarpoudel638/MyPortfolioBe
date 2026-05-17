// controllers/dashboardController.js
import Holding from "../models/Holding.js";
import { getPrices } from "../services/priceService.js";
import { getFxRates, toAUD } from "../services/fxService.js";

const PLATFORM_KEY = {
  CommBank:      "commbank",
  CommSecPocket: "commsecpocket",
  Webull:        "webull",
  Meroshare:     "meroshare",
};

const PLATFORM_META = {
  CommBank:      { name: "CommBank",       market: "ASX",   currency: "AUD" },
  CommSecPocket: { name: "CommSec Pocket", market: "ASX",   currency: "AUD" },
  Webull:        { name: "Webull",         market: "US",    currency: "USD" },
  Meroshare:     { name: "Meroshare",      market: "NEPSE", currency: "NPR" },
};

export const getDashboard = async (req, res) => {
  try {
    const user = req.user;

    // 1. All active holdings
    const holdings = await Holding.find({
      userId: user._id,
      isTracking: true,
    });

    if (holdings.length === 0) {
      return res.json({ platforms: {}, overall: null });
    }

    // 2. Build deduplicated ticker list
    const seen = new Set();
    const tickerList = [];
    for (const h of holdings) {
      const key = `${h.exchange}:${h.ticker}`;
      if (!seen.has(key)) {
        seen.add(key);
        tickerList.push({ ticker: h.ticker, exchange: h.exchange });
      }
    }

    // 3. Fetch prices + FX in parallel
    const [prices, fxRates] = await Promise.all([
      getPrices(tickerList),
      getFxRates(user.baseCurrency || "AUD"),
    ]);

    // 4. Group by platform
    const grouped = {};
    for (const h of holdings) {
      if (!grouped[h.platform]) grouped[h.platform] = [];
      grouped[h.platform].push(h);
    }

    // 5. Build response
    const platforms = {};
    let overallInvestedAUD = 0;
    let overallCurrentAUD = 0;

    for (const [platform, platformHoldings] of Object.entries(grouped)) {
      const meta = PLATFORM_META[platform];
      const currency = meta?.currency || "AUD";

      let platformInvested = 0;
      let platformCurrent = 0;
      const holdingsList = [];

      for (const h of platformHoldings) {
        const cacheKey = `${h.exchange}:${h.ticker}`;
        const priceData = prices[cacheKey];

        const qty = parseFloat(h.qty);
        const buyPrice = parseFloat(h.buyPrice);

        const currentPrice = h.manualCurrentPrice
          ? parseFloat(h.manualCurrentPrice)
          : priceData?.price ?? null;

        const invested = h.isFreeAllotment ? 0 : parseFloat((qty * buyPrice).toFixed(4));
        const value = currentPrice !== null
          ? parseFloat((qty * currentPrice).toFixed(4))
          : null;
        const gain = value !== null
          ? parseFloat((value - invested).toFixed(4))
          : null;
        const returnPct =
          !h.isFreeAllotment && invested > 0 && value !== null
            ? parseFloat((((value - invested) / invested) * 100).toFixed(2))
            : null;

        if (!h.isFreeAllotment) platformInvested += invested;
        if (value !== null) platformCurrent += value;

        holdingsList.push({
          _id: h._id,
          symbol: h.ticker,
          name: h.name,
          qty,
          buyPrice,
          current: currentPrice,
          invested,
          value,
          gain,
          returnPct,
          isFreeAllotment: h.isFreeAllotment,
          dayPct: priceData?.dayPercent != null
            ? `${priceData.dayPercent > 0 ? "+" : ""}${priceData.dayPercent.toFixed(2)}%`
            : null,
          low52: priceData?.weeklyLow52 ?? null,
          high52: priceData?.weeklyHigh52 ?? null,
          lastTraded: priceData?.lastTraded ?? null,
        });
      }

      const platformProfit = parseFloat((platformCurrent - platformInvested).toFixed(2));
      const platformReturn =
        platformInvested > 0
          ? parseFloat((((platformCurrent - platformInvested) / platformInvested) * 100).toFixed(2))
          : null;

      overallInvestedAUD += toAUD(platformInvested, currency, fxRates);
      overallCurrentAUD += toAUD(platformCurrent, currency, fxRates);

      platforms[PLATFORM_KEY[platform] || platform.toLowerCase()] = {
        name: meta?.name || platform,
        market: meta?.market || "—",
        currency,
        summary: {
          invested: parseFloat(platformInvested.toFixed(2)),
          current: parseFloat(platformCurrent.toFixed(2)),
          profit: platformProfit,
          returnPercent: platformReturn,
        },
        holdings: holdingsList,
      };
    }

    // 6. Overall in AUD
    const overallProfit = parseFloat((overallCurrentAUD - overallInvestedAUD).toFixed(2));
    const overallReturn =
      overallInvestedAUD > 0
        ? parseFloat(
            (((overallCurrentAUD - overallInvestedAUD) / overallInvestedAUD) * 100).toFixed(2)
          )
        : null;

    res.json({
      platforms,
      overall: {
        currency: user.baseCurrency || "AUD",
        invested: parseFloat(overallInvestedAUD.toFixed(2)),
        current: parseFloat(overallCurrentAUD.toFixed(2)),
        profit: overallProfit,
        returnPercent: overallReturn,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
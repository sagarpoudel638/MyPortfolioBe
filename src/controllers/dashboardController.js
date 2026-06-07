// controllers/dashboardController.js
import Holding from "../models/Holding.js";
import { getPrices } from "../services/priceService.js";
import { getFxRates, toAUD } from "../services/fxService.js";

const MARKET_META = {
  ASX:    { name: "ASX",    currency: "AUD" },
  NYSE:   { name: "NYSE",   currency: "USD" },
  NASDAQ: { name: "NASDAQ", currency: "USD" },
  NEPSE:  { name: "NEPSE",  currency: "NPR" },
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
      return res.json({ markets: {}, overall: null });
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

    // 4. Group by market (exchange)
    const grouped = {};
    for (const h of holdings) {
      if (!grouped[h.exchange]) grouped[h.exchange] = [];
      grouped[h.exchange].push(h);
    }

    // 5. Build response
    const markets = {};
    let overallInvestedAUD = 0;
    let overallCurrentAUD = 0;

    for (const [market, marketHoldings] of Object.entries(grouped)) {
      const meta = MARKET_META[market];
      const currency = meta?.currency || "AUD";

      let marketInvested = 0;
      let marketCurrent = 0;
      const holdingsList = [];

      for (const h of marketHoldings) {
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

        if (!h.isFreeAllotment) marketInvested += invested;
        if (value !== null) marketCurrent += value;

        holdingsList.push({
          _id: h._id,
          symbol: h.ticker,
          exchange: h.exchange,
          broker: h.broker || null,
          sector: priceData?.sector || null,
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

      const marketProfit = parseFloat((marketCurrent - marketInvested).toFixed(2));
      const marketReturn =
        marketInvested > 0
          ? parseFloat((((marketCurrent - marketInvested) / marketInvested) * 100).toFixed(2))
          : null;

      overallInvestedAUD += toAUD(marketInvested, currency, fxRates);
      overallCurrentAUD += toAUD(marketCurrent, currency, fxRates);

      markets[market.toLowerCase()] = {
        name: meta?.name || market,
        currency,
        summary: {
          invested: parseFloat(marketInvested.toFixed(2)),
          current: parseFloat(marketCurrent.toFixed(2)),
          profit: marketProfit,
          returnPercent: marketReturn,
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
  markets,
  overall: {
    currency: user.baseCurrency || "AUD",
    invested: parseFloat(overallInvestedAUD.toFixed(2)),
    current:  parseFloat(overallCurrentAUD.toFixed(2)),
    profit:   overallProfit,
    returnPercent: overallReturn,
  },
  fxRates: {
  audToUsd: parseFloat((fxRates["USD"]).toFixed(4)),        // 1 AUD = X USD
  audToNpr: parseFloat((fxRates["NPR"]).toFixed(4)),        // 1 AUD = X NPR
  usdToAud: parseFloat((1 / fxRates["USD"]).toFixed(4)),    // 1 USD = X AUD
  nprToAud: parseFloat((1 / fxRates["NPR"]).toFixed(6)),    // 1 NPR = X AUD
},
});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
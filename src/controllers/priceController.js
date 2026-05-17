// controllers/priceController.js
import { getPrices } from "../services/priceService.js";
import Holding from "../models/Holding.js";

// GET /api/prices
// Fetches prices for all tickers in the user's holdings
export const getPortfolioPrices = async (req, res) => {
  try {
    // Pull distinct tickers from user's active holdings
    const holdings = await Holding.find({
      userId: req.user._id,
      isTracking: true,
    }).select("ticker exchange");

    if (holdings.length === 0) {
      return res.json({});
    }

    // Deduplicate — same ticker can appear multiple times
    const seen = new Set();
    const tickerList = [];

    for (const h of holdings) {
      const key = `${h.exchange}:${h.ticker}`;
      if (!seen.has(key)) {
        seen.add(key);
        tickerList.push({ ticker: h.ticker, exchange: h.exchange });
      }
    }

    const prices = await getPrices(tickerList);

    res.json(prices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
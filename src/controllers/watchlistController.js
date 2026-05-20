// controllers/watchlistController.js
import Watchlist from "../models/Watchlist.js";
import { getPrices } from "../services/priceService.js";
import Holding from "../models/Holding.js";


// ── Helper ───────────────────────────────────────────────────────────────────
const parseItem = (item) => {
  const w = item.toObject();
  return {
    ...w,
    priceAlertThreshold: w.priceAlertThreshold
      ? parseFloat(w.priceAlertThreshold)
      : null,
  };
};

// ── GET /api/watchlist ───────────────────────────────────────────────────────
export const getWatchlist = async (req, res) => {
  try {
    const items = await Watchlist.find({ userId: req.user._id }).sort({
      priority: 1,
      createdAt: -1,
    });

    res.json(items.map(parseItem));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/watchlist/:id ───────────────────────────────────────────────────
export const getWatchlistItemById = async (req, res) => {
  try {
    const item = await Watchlist.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: "Watchlist item not found" });
    }

    res.json(parseItem(item));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/watchlist/prices
export const getWatchlistPrices = async (req, res) => {
  try {
    const items = await Watchlist.find({ userId: req.user._id });

    if (items.length === 0) return res.json({});

    // Deduplicate
    const seen = new Set();
    const tickerList = [];
    for (const item of items) {
      const key = `${item.exchange}:${item.symbol}`;
      if (!seen.has(key)) {
        seen.add(key);
        tickerList.push({ ticker: item.symbol, exchange: item.exchange });
      }
    }

    const prices = await getPrices(tickerList);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/watchlist ──────────────────────────────────────────────────────
export const createWatchlistItem = async (req, res) => {
  try {
    const {
      symbol,
      exchange,
      action,
      priority,
      notes,
      priceAlertThreshold,
      alertDirection,
    } = req.body;

    // alertDirection requires priceAlertThreshold and vice versa
    if (alertDirection && !priceAlertThreshold) {
      return res.status(400).json({
        message: "alertDirection requires a priceAlertThreshold",
      });
    }

    if (priceAlertThreshold && !alertDirection) {
      return res.status(400).json({
        message: "priceAlertThreshold requires an alertDirection (above/below)",
      });
    }

    const item = await Watchlist.create({
      userId: req.user._id,
      symbol,
      exchange,
      action,
      priority,
      notes,
      priceAlertThreshold: priceAlertThreshold ?? null,
      alertDirection: alertDirection ?? null,
      alertTriggered: false,
    });

    res.status(201).json(parseItem(item));
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// ── PUT /api/watchlist/:id ───────────────────────────────────────────────────
export const updateWatchlistItem = async (req, res) => {
  try {
    const item = await Watchlist.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: "Watchlist item not found" });
    }

    const allowedFields = [
  "symbol", "exchange", "action", "priority",
  "notes", "priceAlertThreshold", "alertDirection",
  "alertTriggered", "plannedQty", 
];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        item[field] = req.body[field];
      }
    });

    // Re-validate alert pairing after update
    if (item.alertDirection && !item.priceAlertThreshold) {
      return res.status(400).json({
        message: "alertDirection requires a priceAlertThreshold",
      });
    }

    if (item.priceAlertThreshold && !item.alertDirection) {
      return res.status(400).json({
        message: "priceAlertThreshold requires an alertDirection (above/below)",
      });
    }

    const updated = await item.save();
    res.json(parseItem(updated));
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// ── DELETE /api/watchlist/:id ────────────────────────────────────────────────
export const deleteWatchlistItem = async (req, res) => {
  try {
    const item = await Watchlist.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: "Watchlist item not found" });
    }

    res.json({ message: "Watchlist item deleted", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getEnrichedWatchlist = async (req, res) => {
  try {
    const [items, holdings] = await Promise.all([
      Watchlist.find({ userId: req.user._id }),
      Holding.find({ userId: req.user._id, isTracking: true }),
    ]);

    if (items.length === 0) return res.json([]);

    // Build ticker list — include watchlist tickers not in price cache
    const seen = new Set();
    const tickerList = [];
    for (const item of items) {
      const key = `${item.exchange}:${item.symbol}`;
      if (!seen.has(key)) {
        seen.add(key);
        tickerList.push({ ticker: item.symbol, exchange: item.exchange });
      }
    }

    const prices = await getPrices(tickerList);

    // Build holdings map — group by ticker for ownership lookup
    const holdingsMap = {};
    for (const h of holdings) {
      const key = h.ticker;
      if (!holdingsMap[key]) holdingsMap[key] = [];
      holdingsMap[key].push(h);
    }

    // Compute weighted avg buy price from holdings
    const getAvgBuyPrice = (ticker) => {
      const lots = holdingsMap[ticker];
      if (!lots || lots.length === 0) return null;

      let totalInvested = 0;
      let totalQty      = 0;

      for (const lot of lots) {
        if (lot.isFreeAllotment) continue;
        const qty      = parseFloat(lot.qty);
        const buyPrice = parseFloat(lot.buyPrice);
        totalInvested += qty * buyPrice;
        totalQty      += qty;
      }

      return totalQty > 0
        ? parseFloat((totalInvested / totalQty).toFixed(2))
        : null;
    };

    const getTotalOwnedQty = (ticker) => {
      const lots = holdingsMap[ticker];
      if (!lots) return 0;
      return lots.reduce((sum, h) => sum + parseFloat(h.qty), 0);
    };

    // Enrich each watchlist item
    const enriched = items.map((item) => {
      const priceKey  = `${item.exchange}:${item.symbol}`;
      const priceData = prices[priceKey];
      const livePrice = priceData?.price ?? null;

      const isOwned      = !!holdingsMap[item.symbol];
      const avgBuyPrice  = getAvgBuyPrice(item.symbol);
      const totalOwnedQty = getTotalOwnedQty(item.symbol);
      const plannedQty   = item.plannedQty ? parseFloat(item.plannedQty) : null;
      const targetPrice  = item.priceAlertThreshold
        ? parseFloat(item.priceAlertThreshold)
        : null;

      // Buy calculations
      const costAtTarget = plannedQty && targetPrice
        ? parseFloat((plannedQty * targetPrice).toFixed(2))
        : null;
      const costAtLive = plannedQty && livePrice
        ? parseFloat((plannedQty * livePrice).toFixed(2))
        : null;

      // Sell calculations
      const pnlAtTarget = plannedQty && targetPrice && avgBuyPrice
        ? parseFloat(((targetPrice - avgBuyPrice) * plannedQty).toFixed(2))
        : null;
      const pnlAtLive = plannedQty && livePrice && avgBuyPrice
        ? parseFloat(((livePrice - avgBuyPrice) * plannedQty).toFixed(2))
        : null;
      const pnlPctAtTarget = pnlAtTarget && avgBuyPrice && plannedQty
        ? parseFloat(((pnlAtTarget / (avgBuyPrice * plannedQty)) * 100).toFixed(2))
        : null;
      const pnlPctAtLive = pnlAtLive && avgBuyPrice && plannedQty
        ? parseFloat(((pnlAtLive / (avgBuyPrice * plannedQty)) * 100).toFixed(2))
        : null;

      // Alert hit check
      const alertHit = targetPrice && livePrice
        ? item.alertDirection === "above"
          ? livePrice >= targetPrice
          : livePrice <= targetPrice
        : false;

      return {
        _id:            item._id,
        symbol:         item.symbol,
        exchange:       item.exchange,
        action:         item.action,
        priority:       item.priority,
        notes:          item.notes,
        alertDirection: item.alertDirection,
        alertTriggered: item.alertTriggered,
        plannedQty,
        targetPrice,
        // Price data
        livePrice,
        dayPercent:     priceData?.dayPercent  ?? null,
        weeklyHigh52:   priceData?.weeklyHigh52 ?? null,
        weeklyLow52:    priceData?.weeklyLow52  ?? null,
        sector:         priceData?.sector       ?? null,
        // Ownership
        isOwned,
        avgBuyPrice,
        totalOwnedQty,
        // Calculations
        costAtTarget,
        costAtLive,
        pnlAtTarget,
        pnlAtLive,
        pnlPctAtTarget,
        pnlPctAtLive,
        alertHit,
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
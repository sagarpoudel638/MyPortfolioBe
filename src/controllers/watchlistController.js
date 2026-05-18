// controllers/watchlistController.js
import Watchlist from "../models/Watchlist.js";
import { getPrices } from "../services/priceService.js";

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
      "symbol",
      "exchange",
      "action",
      "priority",
      "notes",
      "priceAlertThreshold",
      "alertDirection",
      "alertTriggered",
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
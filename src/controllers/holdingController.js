// controllers/holdingController.js
import Holding from "../models/Holding.js";

// ── Helper: parse Decimal128 fields for clean JSON output ──────────────────
const parseHolding = (holding) => {
  const h = holding.toObject({ virtuals: true });
  return {
    ...h,
    qty: parseFloat(h.qty),
    buyPrice: parseFloat(h.buyPrice),
    manualCurrentPrice: h.manualCurrentPrice
      ? parseFloat(h.manualCurrentPrice)
      : null,
    invested: h.invested,
  };
};

// ── GET /api/holdings ───────────────────────────────────────────────────────
// Returns all holdings for the logged-in user
export const getHoldings = async (req, res) => {
  try {
    const holdings = await Holding.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.json(holdings.map(parseHolding));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/holdings/:id ───────────────────────────────────────────────────
// Returns a single holding (must belong to logged-in user)
export const getHoldingById = async (req, res) => {
  try {
    const holding = await Holding.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!holding) {
      return res.status(404).json({ message: "Holding not found" });
    }

    res.json(parseHolding(holding));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/holdings ──────────────────────────────────────────────────────
// Create a new holding
export const createHolding = async (req, res) => {
  try {
    const {
      platform,
      exchange,
      currency,
      ticker,
      name,
      qty,
      buyPrice,
      purchaseDate,
      isFreeAllotment,
      isTracking,
      manualCurrentPrice,
      notes,
    } = req.body;

    const holding = await Holding.create({
      userId: req.user._id,
      platform,
      exchange,
      currency,
      ticker,
      name,
      qty,
      buyPrice,
      purchaseDate,
      isFreeAllotment,
      isTracking,
      manualCurrentPrice: manualCurrentPrice ?? null,
      notes,
    });

    res.status(201).json(parseHolding(holding));
  } catch (error) {
    // Catches enum validation errors cleanly
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// ── PUT /api/holdings/:id ───────────────────────────────────────────────────
// Update a holding (must belong to logged-in user)
export const updateHolding = async (req, res) => {
  try {
    const holding = await Holding.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!holding) {
      return res.status(404).json({ message: "Holding not found" });
    }

    const allowedFields = [
      "platform",
      "exchange",
      "currency",
      "ticker",
      "name",
      "qty",
      "buyPrice",
      "purchaseDate",
      "isFreeAllotment",
      "isTracking",
      "manualCurrentPrice",
      "notes",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        holding[field] = req.body[field];
      }
    });

    const updated = await holding.save();
    res.json(parseHolding(updated));
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// ── DELETE /api/holdings/:id ────────────────────────────────────────────────
// Delete a holding (must belong to logged-in user)
export const deleteHolding = async (req, res) => {
  try {
    const holding = await Holding.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!holding) {
      return res.status(404).json({ message: "Holding not found" });
    }

    res.json({ message: "Holding deleted", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
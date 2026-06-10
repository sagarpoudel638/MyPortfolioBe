// controllers/holdingController.js
import Holding from "../models/Holding.js";

// ── Validation ──────────────────────────────────────────────────────────────
const VALID_EXCHANGES = ["ASX", "NYSE", "NASDAQ", "NEPSE"];
const VALID_CURRENCIES = ["AUD", "USD", "NPR"];

const validateHoldingInput = ({ exchange, currency, ticker, name, qty, buyPrice }) => {
  if (!exchange || !VALID_EXCHANGES.includes(exchange))
    return `exchange must be one of: ${VALID_EXCHANGES.join(", ")}.`;
  if (!currency || !VALID_CURRENCIES.includes(currency))
    return `currency must be one of: ${VALID_CURRENCIES.join(", ")}.`;
  if (!ticker || typeof ticker !== "string" || ticker.trim().length === 0 || ticker.trim().length > 20)
    return "ticker is required and must be ≤ 20 characters.";
  if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100)
    return "name is required and must be ≤ 100 characters.";
  const qtyNum = Number(qty);
  if (isNaN(qtyNum) || qtyNum <= 0)
    return "qty must be a positive number.";
  const priceNum = Number(buyPrice);
  if (isNaN(priceNum) || priceNum < 0)
    return "buyPrice must be a non-negative number.";
  return null;
};

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
      broker,
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

    const validationError = validateHoldingInput({ exchange, currency, ticker, name, qty, buyPrice });
    if (validationError) return res.status(400).json({ message: validationError });

    const holding = await Holding.create({
      userId: req.user._id,
      broker: broker || "",
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
      "broker",
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

    // Validate fields being updated
    const merged = {
      exchange: req.body.exchange ?? holding.exchange,
      currency: req.body.currency ?? holding.currency,
      ticker:   req.body.ticker   ?? holding.ticker,
      name:     req.body.name     ?? holding.name,
      qty:      req.body.qty      ?? holding.qty,
      buyPrice: req.body.buyPrice ?? holding.buyPrice,
    };
    const validationError = validateHoldingInput(merged);
    if (validationError) return res.status(400).json({ message: validationError });

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
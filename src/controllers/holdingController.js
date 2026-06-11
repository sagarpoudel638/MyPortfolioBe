// controllers/holdingController.js
import Holding from "../models/Holding.js";

// ── Validation ──────────────────────────────────────────────────────────────
const VALID_EXCHANGES = ["ASX", "NYSE", "NASDAQ", "NEPSE"];
const VALID_CURRENCIES = ["AUD", "USD", "NPR"];

const validateHoldingInput = ({ exchange, currency, ticker, name, qty, buyPrice, purchaseDate }) => {
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
  if (purchaseDate) {
    const d = new Date(purchaseDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // allow today
    if (!isNaN(d) && d > today)
      return "Purchase date cannot be in the future.";
  }
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
// Create a new holding — auto-merges if same ticker+exchange already exists.
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

    const validationError = validateHoldingInput({ exchange, currency, ticker, name, qty, buyPrice, purchaseDate });
    if (validationError) return res.status(400).json({ message: validationError });

    const normalizedTicker = ticker.trim().toUpperCase();

    // Auto-merge: if a holding with the same ticker+exchange already exists,
    // compute weighted average buy price and update rather than create duplicate.
    const existing = await Holding.findOne({
      userId: req.user._id,
      ticker: normalizedTicker,
      exchange,
    });

    if (existing) {
      const existingQty   = parseFloat(existing.qty);
      const existingPrice = parseFloat(existing.buyPrice);
      const newQty        = Number(qty);
      const newPrice      = Number(buyPrice);
      const totalQty      = existingQty + newQty;
      const weightedPrice = totalQty > 0
        ? (existingQty * existingPrice + newQty * newPrice) / totalQty
        : 0;

      await Holding.updateOne(
        { _id: existing._id },
        { $set: { qty: parseFloat(totalQty.toFixed(8)), buyPrice: parseFloat(weightedPrice.toFixed(6)) } },
      );
      const updated = await Holding.findById(existing._id);
      return res.status(200).json({ ...parseHolding(updated), merged: true });
    }

    const holding = await Holding.create({
      userId: req.user._id,
      broker: broker || "",
      exchange,
      currency,
      ticker: normalizedTicker,
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
      exchange:     req.body.exchange     ?? holding.exchange,
      currency:     req.body.currency     ?? holding.currency,
      ticker:       req.body.ticker       ?? holding.ticker,
      name:         req.body.name         ?? holding.name,
      qty:          req.body.qty          ?? holding.qty,
      buyPrice:     req.body.buyPrice     ?? holding.buyPrice,
      purchaseDate: req.body.purchaseDate ?? holding.purchaseDate,
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

// ── PUT /api/holdings/:id/sell ───────────────────────────────────────────────
// Reduce qty by sellQty. Deletes the holding if qty reaches 0.
export const sellHolding = async (req, res) => {
  try {
    const sellNum = Number(req.body.sellQty);
    if (isNaN(sellNum) || sellNum <= 0) {
      return res.status(400).json({ message: "sellQty must be a positive number." });
    }

    const holding = await Holding.findOne({ _id: req.params.id, userId: req.user._id });
    if (!holding) return res.status(404).json({ message: "Holding not found." });

    const currentQty = parseFloat(holding.qty);
    if (sellNum > currentQty + 0.000001) {
      return res.status(400).json({
        message: `Cannot sell ${sellNum} — you only hold ${currentQty}.`,
      });
    }

    const remaining = parseFloat((currentQty - sellNum).toFixed(8));

    if (remaining <= 0.00001) {
      await Holding.deleteOne({ _id: holding._id });
      return res.json({ deleted: true, id: holding._id.toString() });
    }

    await Holding.updateOne({ _id: holding._id }, { $set: { qty: remaining } });
    const updated = await Holding.findById(holding._id);
    return res.json({ ...parseHolding(updated), deleted: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/holdings/merge ─────────────────────────────────────────────────
// Merge all holdings of the same ticker+exchange for a user into one,
// using weighted average buy price.
export const mergeHoldings = async (req, res) => {
  try {
    const { ticker, exchange } = req.body;
    if (!ticker || !exchange) {
      return res.status(400).json({ message: "ticker and exchange are required." });
    }

    const holdings = await Holding.find({
      userId:   req.user._id,
      ticker:   ticker.trim().toUpperCase(),
      exchange,
    });

    if (holdings.length <= 1) {
      return res.status(400).json({ message: "No duplicates found to merge." });
    }

    let totalQty    = 0;
    let weightedSum = 0;
    let earliestDate = null;

    for (const h of holdings) {
      const q = parseFloat(h.qty);
      const p = parseFloat(h.buyPrice);
      totalQty    += q;
      weightedSum += q * p;
      const d = h.purchaseDate ? new Date(h.purchaseDate) : null;
      if (d && (!earliestDate || d < earliestDate)) earliestDate = d;
    }

    const avgPrice = totalQty > 0 ? weightedSum / totalQty : 0;

    // Keep the first holding, delete the rest
    const [keeper, ...rest] = holdings;
    await Holding.updateOne(
      { _id: keeper._id },
      { $set: {
        qty:          parseFloat(totalQty.toFixed(8)),
        buyPrice:     parseFloat(avgPrice.toFixed(6)),
        purchaseDate: earliestDate || keeper.purchaseDate,
      }},
    );
    await Holding.deleteMany({ _id: { $in: rest.map((h) => h._id) } });

    const merged = await Holding.findById(keeper._id);
    return res.json({ ...parseHolding(merged), mergedCount: holdings.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
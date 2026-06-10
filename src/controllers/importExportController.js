// controllers/importExportController.js
import Holding from "../models/Holding.js";
import {
  detectFormat,
  parseMeroshare,
  parseCommSec,
  parseWebull,
  parseNative,
} from "../services/csvParsers.js";

const PARSERS = {
  meroshare: parseMeroshare,
  commsec:   parseCommSec,
  webull:    parseWebull,
  native:    parseNative,
};

// ── POST /api/import ─────────────────────────────────────────────────────────
// Accepts multipart/form-data: file (csv) + optional field "source"
export const importHoldings = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file uploaded." });
    }

    const csvText = req.file.buffer.toString("utf-8");

    // Determine parser: prefer explicit "source" field, fall back to auto-detect
    let source = (req.body.source || "").toLowerCase().trim();
    if (!source || !PARSERS[source]) {
      source = detectFormat(csvText);
    }
    if (!source || !PARSERS[source]) {
      return res.status(400).json({
        message: "Could not detect CSV format. Please specify source: meroshare, commsec, webull, or native.",
      });
    }

    // Parse
    let parsed;
    try {
      parsed = PARSERS[source](csvText);
    } catch (err) {
      return res.status(400).json({ message: `Parse error: ${err.message}` });
    }

    if (!parsed.length) {
      return res.status(400).json({ message: "No holdings found in the uploaded file." });
    }

    // Validate each holding
    const VALID_EXCHANGES = ["ASX", "NYSE", "NASDAQ", "NEPSE"];
    const VALID_CURRENCIES = ["AUD", "USD", "NPR"];

    const valid   = [];
    const invalid = [];
    for (const h of parsed) {
      if (!VALID_EXCHANGES.includes(h.exchange)) {
        invalid.push({ ticker: h.ticker, reason: `Unknown exchange: ${h.exchange}` });
        continue;
      }
      if (!VALID_CURRENCIES.includes(h.currency)) {
        invalid.push({ ticker: h.ticker, reason: `Unknown currency: ${h.currency}` });
        continue;
      }
      if (!h.ticker || h.qty <= 0) {
        invalid.push({ ticker: h.ticker || "?", reason: "Missing ticker or zero quantity" });
        continue;
      }
      valid.push(h);
    }

    // Check for duplicates already in DB (same ticker + exchange for this user)
    const existing = await Holding.find({
      userId: req.user._id,
      exchange: { $in: valid.map((h) => h.exchange) },
      ticker:   { $in: valid.map((h) => h.ticker) },
    }).select("ticker exchange");

    const existingSet = new Set(existing.map((e) => `${e.exchange}:${e.ticker}`));

    const toInsert = [];
    const skipped  = [];
    const warnings = [];

    for (const h of valid) {
      const key = `${h.exchange}:${h.ticker}`;
      if (existingSet.has(key)) {
        skipped.push({ ticker: h.ticker, exchange: h.exchange, reason: "Already exists" });
        continue;
      }
      if (h.warnings?.length) {
        warnings.push({ ticker: h.ticker, warnings: h.warnings });
      }
      toInsert.push({
        userId:          req.user._id,
        ticker:          h.ticker,
        name:            h.name,
        exchange:        h.exchange,
        currency:        h.currency,
        qty:             h.qty,
        buyPrice:        h.buyPrice,
        purchaseDate:    h.purchaseDate,
        broker:          h.broker || "",
        notes:           h.notes || "",
        isFreeAllotment: h.isFreeAllotment || false,
        isTracking:      h.isTracking !== false,
        manualCurrentPrice: null,
      });
    }

    // Bulk insert
    let inserted = [];
    if (toInsert.length) {
      inserted = await Holding.insertMany(toInsert, { ordered: false });
    }

    res.json({
      source,
      imported: inserted.length,
      skipped:  skipped.length,
      invalid:  invalid.length,
      skippedItems:  skipped,
      invalidItems:  invalid,
      warningItems:  warnings,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/export ──────────────────────────────────────────────────────────
// Returns all user holdings as a downloadable CSV (native format)
export const exportHoldings = async (req, res) => {
  try {
    const holdings = await Holding.find({ userId: req.user._id }).sort({ exchange: 1, ticker: 1 });

    const header = "ticker,name,exchange,currency,qty,buyPrice,purchaseDate,broker,notes,isFreeAllotment,isTracking";

    const rows = holdings.map((h) => {
      const escape = (v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      return [
        escape(h.ticker),
        escape(h.name),
        escape(h.exchange),
        escape(h.currency),
        parseFloat(h.qty),
        parseFloat(h.buyPrice),
        h.purchaseDate ? h.purchaseDate.toISOString().split("T")[0] : "",
        escape(h.broker || ""),
        escape(h.notes || ""),
        h.isFreeAllotment ? "true" : "false",
        h.isTracking     ? "true" : "false",
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="myportfolio-holdings-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

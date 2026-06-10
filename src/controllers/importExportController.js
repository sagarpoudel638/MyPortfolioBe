// controllers/importExportController.js
import Holding from "../models/Holding.js";
import {
  detectFormat,
  parseMeroshare,
  parseMeroshareMyShares,
  parseMeroshareJoined,
  parseCommSec,
  parseWebull,
  parseWebullMultiple,
  parseNative,
} from "../services/csvParsers.js";

// ── POST /api/import ─────────────────────────────────────────────────────────
// Accepts multipart/form-data:
//   file     (required) — primary CSV
//   fileWacc (optional) — Meroshare WACC Report CSV (when primary is My Shares)
//   source   (optional) — "meroshare" | "commsec" | "webull" | "native"
export const importHoldings = async (req, res) => {
  try {
    const primaryFiles = req.files?.file ?? (req.file ? [req.file] : []);
    if (!primaryFiles.length) {
      return res.status(400).json({ message: "No CSV file uploaded." });
    }

    const csvTexts        = primaryFiles.map((f) => f.buffer.toString("utf-8"));
    const csvText         = csvTexts[0];               // use first file for format detection
    const waccFile        = req.files?.fileWacc?.[0];
    const waccCsvText     = waccFile ? waccFile.buffer.toString("utf-8") : null;

    // Detect format of primary file
    const detectedFormat  = detectFormat(csvText);

    // Parse — choose the right strategy
    let parsed;
    let source = (req.body.source || "").toLowerCase().trim() || detectedFormat || "";

    try {
      // Meroshare: My Shares + optional WACC
      if (detectedFormat === "meroshare_myshares" || source === "meroshare") {
        if (waccCsvText) {
          // Validate the second file is actually a WACC report
          const waccFmt = detectFormat(waccCsvText);
          if (waccFmt !== "meroshare_wacc") {
            return res.status(400).json({ message: "Second file does not appear to be a Meroshare WACC Report." });
          }
          parsed = parseMeroshareJoined(csvText, waccCsvText);
          source = "meroshare (My Shares + WACC)";
        } else {
          parsed = parseMeroshareMyShares(csvText);
          source = "meroshare (My Shares only)";
        }
      } else if (detectedFormat === "meroshare_txn") {
        parsed = parseMeroshare(csvText);
        source = "meroshare (Transaction History)";
      } else if (detectedFormat === "commsec" || source === "commsec") {
        parsed = parseCommSec(csvText);
        source = "commsec";
      } else if (detectedFormat === "webull" || source === "webull") {
        parsed = csvTexts.length > 1
          ? parseWebullMultiple(csvTexts)
          : parseWebull(csvText);
        source = `webull (${csvTexts.length} file${csvTexts.length > 1 ? "s" : ""} combined)`;
        // Also validate all extra files are webull format
        for (let i = 1; i < csvTexts.length; i++) {
          if (detectFormat(csvTexts[i]) !== "webull") {
            return res.status(400).json({ message: `File ${i + 1} does not appear to be a Webull trade record CSV.` });
          }
        }
      } else if (detectedFormat === "native" || source === "native") {
        parsed = parseNative(csvText);
        source = "native";
      } else {
        return res.status(400).json({
          message: "Could not detect CSV format. Please select source: meroshare, commsec, webull, or native.",
        });
      }
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

// services/csvParsers.js
// Parsers for Meroshare (NEPSE), CommSec (ASX), Webull (NASDAQ/NYSE),
// and the app's own native CSV format.

import { parse } from "csv-parse/sync";

// ── Shared helpers ───────────────────────────────────────────────────────────

const toNum = (v) => {
  if (v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "-")
    return 0;
  return parseFloat(String(v).replace(/[,$]/g, "").trim()) || 0;
};

const toDate = (str) => {
  if (!str) return new Date();
  const d = new Date(str.trim().replace(/\//g, "-"));
  return isNaN(d) ? new Date() : d;
};

// ── Auto-detect format from CSV text ────────────────────────────────────────
export function detectFormat(csvText) {
  const head = csvText.slice(0, 500).toLowerCase();
  if (head.includes("credit quantity") || head.includes("scrip") && head.includes("balance after"))
    return "meroshare";
  if (head.includes("avail units") || head.includes("account number"))
    return "commsec";
  if (head.includes("buy/sell") && head.includes("trade price"))
    return "webull";
  if (head.includes("exchange") && head.includes("buyprice"))
    return "native";
  return null;
}

// ── 1. Meroshare (NEPSE) ─────────────────────────────────────────────────────
// Transaction history: S.N, Scrip, Transaction Date, Credit Quantity,
//                      Debit Quantity, Balance After Transaction, History Description
// Strategy: group by Scrip, latest row → current balance; no price data.
export function parseMeroshare(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  // Group by scrip
  const byTicker = {};
  for (const row of rows) {
    const ticker  = (row["Scrip"] || "").trim().toUpperCase();
    const date    = (row["Transaction Date"] || "").trim();
    const credit  = toNum(row["Credit Quantity"]);
    const debit   = toNum(row["Debit Quantity"]);
    const balance = toNum(row["Balance After Transaction"]);
    const desc    = (row["History Description"] || "").trim();

    if (!ticker) continue;

    if (!byTicker[ticker]) byTicker[ticker] = [];
    byTicker[ticker].push({ date, credit, debit, balance, desc });
  }

  const holdings = [];
  for (const [ticker, txns] of Object.entries(byTicker)) {
    // Sort descending so txns[0] is most recent
    txns.sort((a, b) => new Date(b.date) - new Date(a.date));

    const currentQty = txns[0].balance;
    if (currentQty <= 0) continue; // position fully sold/transferred

    // Earliest acquisition date (credit > 0)
    const buys = txns.filter((t) => t.credit > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
    const purchaseDate = buys.length > 0 ? toDate(buys[0].date) : toDate(txns[txns.length - 1].date);

    // Only bonus shares (CA-Bonus) are truly free — IPO/FPO allotments cost money
    const isOnlyFree = buys.length > 0 && buys.every(
      (t) => t.desc.startsWith("CA-Bonus")
    );

    holdings.push({
      ticker,
      name:           ticker,        // Meroshare has no company name
      exchange:       "NEPSE",
      currency:       "NPR",
      qty:            currentQty,
      buyPrice:       0,             // ⚠ not available in Meroshare CSV
      purchaseDate,
      broker:         "Meroshare",
      notes:          "⚠ Buy price not available — please update manually.",
      isFreeAllotment: isOnlyFree,
      isTracking:     true,
      warnings:       ["Buy price not available from Meroshare export — set to 0, please update."],
    });
  }

  return holdings;
}

// ── 2. CommSec (ASX) ─────────────────────────────────────────────────────────
// Holdings snapshot with 3 header rows then data rows.
// Real columns: Code, Avail Units, Purchase $, Last $, ...
export function parseCommSec(csvText) {
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Find the header row (contains "Code" and "Avail Units")
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Avail Units") || lines[i].toLowerCase().startsWith("code,")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("CommSec format not recognised — cannot find column headers.");

  // Re-parse from the header row onward
  const subset = lines.slice(headerIdx).join("\n");
  const rows   = parse(subset, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    relax_column_count: true,
  });

  const SKIP = new Set(["chess", "issuer sponsored holdings", "subtotal", "total", "there are no"]);

  const holdings = [];
  for (const row of rows) {
    const code = (row["Code"] || "").trim().toUpperCase();
    if (!code || SKIP.has(code.toLowerCase()) || code.toLowerCase().startsWith("there are")) continue;

    const qty      = toNum(row["Avail Units"]);
    const buyPrice = toNum(row["Purchase $"]);
    if (qty <= 0) continue;

    holdings.push({
      ticker:         code,
      name:           code,             // CommSec holdings CSV has no full name
      exchange:       "ASX",
      currency:       "AUD",
      qty,
      buyPrice,
      purchaseDate:   new Date(),       // not in CommSec CSV
      broker:         "CommSec",
      notes:          "Purchase date not available in CommSec export — set to today.",
      isFreeAllotment: false,
      isTracking:     true,
      warnings:       buyPrice === 0
        ? ["Purchase price missing — please update."]
        : [],
    });
  }

  return holdings;
}

// ── 3. Webull (NASDAQ / NYSE) ────────────────────────────────────────────────
// Trade history: Symbol, Name, Currency, Type, Trade Date, Time, Buy/Sell,
//               Quantity, Trade Price, Gross Amount, Net Amount, ..., Exchange
// Strategy: net positions per Symbol; weighted avg buy price.
const WEBULL_EXCHANGE_MAP = {
  NSQ: "NASDAQ", NAS: "NASDAQ", XNAS: "NASDAQ",
  PSE: "NYSE",   NYS: "NYSE",   XNYS: "NYSE",
  AMX: "NYSE",   BATS: "NASDAQ",
};

export function parseWebull(csvText) {
  const rows = parse(csvText, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    relax_column_count: true,
  });

  const bySymbol = {};
  for (const row of rows) {
    const sym  = (row["Symbol"] || "").trim().toUpperCase();
    const type = (row["Type"] || "").trim().toUpperCase();
    if (!sym || type !== "EQUITY") continue;

    const side     = (row["Buy/Sell"] || "").trim().toUpperCase();
    const qty      = Math.abs(toNum(row["Quantity"]));
    const price    = Math.abs(toNum(row["Trade Price"]));
    const date     = (row["Trade Date"] || "").trim();
    const name     = (row["Name"] || sym).trim();
    const currency = (row["Currency"] || "USD").trim();
    const exchCode = (row["Exchange"] || "").trim().toUpperCase();
    const exchange = WEBULL_EXCHANGE_MAP[exchCode] || "NASDAQ";

    if (!bySymbol[sym]) {
      bySymbol[sym] = {
        name, currency, exchange,
        buyQty: 0, sellQty: 0,
        weightedBuySum: 0,
        firstBuyDate: null,
      };
    }
    const s = bySymbol[sym];

    if (side === "BUY") {
      s.buyQty         += qty;
      s.weightedBuySum += qty * price;
      const d = toDate(date);
      if (!s.firstBuyDate || d < s.firstBuyDate) s.firstBuyDate = d;
    } else if (side === "SELL") {
      s.sellQty += qty;
    }
  }

  const holdings = [];
  for (const [ticker, s] of Object.entries(bySymbol)) {
    const netQty = parseFloat((s.buyQty - s.sellQty).toFixed(8));
    if (netQty <= 0.00001) continue; // fully sold or rounding

    const avgBuy = s.buyQty > 0 ? s.weightedBuySum / s.buyQty : 0;
    const warnings = [];
    if (avgBuy === 0) warnings.push("Buy price could not be calculated — please update.");

    holdings.push({
      ticker,
      name:           s.name,
      exchange:       s.exchange,
      currency:       s.currency,
      qty:            netQty,
      buyPrice:       parseFloat(avgBuy.toFixed(6)),
      purchaseDate:   s.firstBuyDate || new Date(),
      broker:         "Webull",
      notes:          "",
      isFreeAllotment: false,
      isTracking:     true,
      warnings,
    });
  }

  return holdings;
}

// ── 4. Native format (our own export) ────────────────────────────────────────
// ticker,name,exchange,currency,qty,buyPrice,purchaseDate,broker,notes,isFreeAllotment,isTracking
export function parseNative(csvText) {
  const rows = parse(csvText, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
  });

  return rows.map((row) => ({
    ticker:          (row.ticker || "").toUpperCase().trim(),
    name:            row.name || row.ticker,
    exchange:        (row.exchange || "").toUpperCase().trim(),
    currency:        (row.currency || "").toUpperCase().trim(),
    qty:             toNum(row.qty),
    buyPrice:        toNum(row.buyPrice),
    purchaseDate:    toDate(row.purchaseDate),
    broker:          row.broker || "",
    notes:           row.notes || "",
    isFreeAllotment: row.isFreeAllotment === "true" || row.isFreeAllotment === true,
    isTracking:      row.isTracking !== "false" && row.isTracking !== false,
    warnings:        [],
  })).filter((h) => h.ticker && h.qty > 0);
}

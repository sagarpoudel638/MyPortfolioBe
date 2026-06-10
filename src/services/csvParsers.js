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
  if (head.includes("wacc rate") || head.includes("wacc calculated"))
    return "meroshare_wacc";
  if (head.includes("current balance") && head.includes("free balance") && head.includes("scrip"))
    return "meroshare_myshares";
  if (head.includes("credit quantity") || (head.includes("scrip") && head.includes("balance after")))
    return "meroshare_txn";
  if (head.includes("avail units") || head.includes("account number"))
    return "commsec";
  if (head.includes("buy/sell") && head.includes("trade price"))
    return "webull";
  if (head.includes("exchange") && head.includes("buyprice"))
    return "native";
  return null;
}

// ── 1a. Meroshare — My Shares + WACC Report (preferred, gives real buy prices) ─
// My Shares:   S.N, Scrip, Current Balance, ...
// WACC Report: S.N, Demat, Scrip Name, WACC Calculated Quantity, WACC Rate, ...
// Strategy: My Shares = authoritative current holdings; WACC Report = buy price lookup.
export function parseMeroshareJoined(mySharesCsv, waccCsv) {
  // Parse My Shares — current holdings
  const shareRows = parse(mySharesCsv, { columns: true, skip_empty_lines: true, trim: true });
  // Parse WACC Report — build ticker→waccRate map
  const waccRows  = parse(waccCsv,     { columns: true, skip_empty_lines: true, trim: true });

  const waccMap = {};
  for (const row of waccRows) {
    const ticker = (row["Scrip Name"] || "").trim().toUpperCase();
    const rate   = toNum(row["WACC Rate"]);
    if (ticker) waccMap[ticker] = rate;
  }

  const holdings = [];
  for (const row of shareRows) {
    const ticker     = (row["Scrip"] || "").trim().toUpperCase();
    const currentQty = toNum(row["Current Balance"]);
    if (!ticker || currentQty <= 0) continue;

    const buyPrice = waccMap[ticker] ?? null;
    const warnings = buyPrice === null
      ? [`${ticker} not found in WACC Report — buy price set to 0, please update manually.`]
      : [];

    holdings.push({
      ticker,
      name:            ticker,
      exchange:        "NEPSE",
      currency:        "NPR",
      qty:             currentQty,
      buyPrice:        buyPrice ?? 0,
      purchaseDate:    new Date(),   // My Shares has no purchase date
      broker:          "Meroshare",
      notes:           buyPrice === null ? "⚠ Buy price not found in WACC Report." : "",
      isFreeAllotment: false,
      isTracking:      true,
      warnings,
    });
  }
  return holdings;
}

// ── 1b. Meroshare — My Shares only (no WACC) ─────────────────────────────────
// Used when user uploads only the My Shares CSV.
export function parseMeroshareMyShares(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  const holdings = [];
  for (const row of rows) {
    const ticker  = (row["Scrip"] || "").trim().toUpperCase();
    const qty     = toNum(row["Current Balance"]);
    if (!ticker || qty <= 0) continue;
    holdings.push({
      ticker,
      name:            ticker,
      exchange:        "NEPSE",
      currency:        "NPR",
      qty,
      buyPrice:        0,
      purchaseDate:    new Date(),
      broker:          "Meroshare",
      notes:           "⚠ Buy price not available — upload WACC Report for automatic prices.",
      isFreeAllotment: false,
      isTracking:      true,
      warnings:        ["Buy price set to 0 — re-import with a WACC Report CSV for automatic prices."],
    });
  }
  return holdings;
}

// ── 1c. Meroshare — Transaction History (legacy fallback) ────────────────────
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

// ── 3b. Webull — multiple CSV files (24-month export limit workaround) ───────
// Concatenates all trade history files, strips duplicate header rows,
// then runs the same netting logic as parseWebull.
export function parseWebullMultiple(csvTexts) {
  if (!csvTexts || csvTexts.length === 0) return [];
  if (csvTexts.length === 1) return parseWebull(csvTexts[0]);

  // Keep header from first file, strip it from the rest.
  // Normalise line endings first so \r doesn't corrupt column values.
  const combined = csvTexts
    .map((text, i) => {
      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
      return i === 0 ? lines.join("\n") : lines.slice(1).join("\n");
    })
    .join("\n");

  return parseWebull(combined);
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

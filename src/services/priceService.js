// services/priceService.js
import YahooFinance from "yahoo-finance2";
import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";
import PriceCache, { parseCacheEntry } from "../models/PriceCache.js";
import { getCacheTtl } from "./tradingHours.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── Yahoo Finance fetcher (ASX + US) ─────────────────────────────────────────
const fetchYahooPrice = async (ticker, exchange) => {
  const yahooSymbol = exchange === "ASX" ? `${ticker}.AX` : ticker;
  const quote = await yahooFinance.quote(yahooSymbol);

  return {
    price:        quote.regularMarketPrice,
    dayPercent:   quote.regularMarketChangePercent ?? null,
    weeklyHigh52: quote.fiftyTwoWeekHigh ?? null,
    weeklyLow52:  quote.fiftyTwoWeekLow ?? null,
    lastTraded:   quote.regularMarketTime ?? null,
    sector:       null,
  };
};

// ── Merolagani scraper (NEPSE) ────────────────────────────────────────────────
const fetchNepsePrice = async (ticker) => {
  const url = `https://merolagani.com/CompanyDetail.aspx?symbol=${ticker}`;

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    httpsAgent,
    timeout: 10000,
  });

  const $ = cheerio.load(data);

  // ── Define getTdByTh BEFORE using it ─────────────────────────────────────
  const getTdByTh = (thText) => {
    let value = null;
    $("tr").each((i, row) => {
      const th = $(row).find("th").first().text().trim();
      if (th === thText) {
        value = $(row).find("td").first().text().trim();
        return false;
      }
    });
    return value;
  };

  const cleanNumber = (str) =>
    str ? parseFloat(str.replace(/,|%|\s/g, "")) || null : null;

  const priceText      = getTdByTh("Market Price");
  const dayPercentText = getTdByTh("% Change");
  const high52Text     = getTdByTh("52 Weeks High - Low");
  const lastTradedText = getTdByTh("Last Traded On");
  const sectorText     = getTdByTh("Sector"); // ← moved AFTER getTdByTh definition

  const price = cleanNumber(priceText);

  if (!price) {
    throw new Error(`Could not parse price for NEPSE:${ticker}`);
  }

  let weeklyHigh52 = null;
  let weeklyLow52  = null;

  if (high52Text) {
    const parts = high52Text.split("-");
    if (parts.length === 2) {
      weeklyHigh52 = cleanNumber(parts[0]);
      weeklyLow52  = cleanNumber(parts[1]);
    }
  }

  const lastTraded = lastTradedText
    ? new Date(lastTradedText.replace(/\//g, "-"))
    : new Date();

  return {
    price,
    dayPercent:   cleanNumber(dayPercentText),
    weeklyHigh52,
    weeklyLow52,
    lastTraded,
    sector:       sectorText || null, // ← sector is part of priceData
  };
};

// ── Core: get price for one ticker (cache-first) ─────────────────────────────
export const getPrice = async (ticker, exchange) => {
  const cacheKey = `${exchange}:${ticker}`;

  const cached = await PriceCache.findById(cacheKey);
  if (cached) return parseCacheEntry(cached);

  let priceData;
  try {
    if (exchange === "NEPSE") {
      priceData = await fetchNepsePrice(ticker);
    } else {
      priceData = await fetchYahooPrice(ticker, exchange);
    }
  } catch (error) {
    throw new Error(`Failed to fetch price for ${exchange}:${ticker} — ${error.message}`);
  }

  const ttlSeconds = getCacheTtl(exchange);
  const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

  const doc = await PriceCache.findByIdAndUpdate(
    cacheKey,
    {
      _id: cacheKey,
      exchange,
      ticker,
      ...priceData, // sector is inside priceData — no need to spread separately
      fetchedAt: new Date(),
      expiresAt,
    },
    { upsert: true, returnDocument: "after" }
  );

  return parseCacheEntry(doc);
};

// ── Batch: get prices for multiple tickers ───────────────────────────────────
export const getPrices = async (tickerList) => {
  const cacheKeys = tickerList.map(({ ticker, exchange }) => `${exchange}:${ticker}`);

  const cached = await PriceCache.find({ _id: { $in: cacheKeys } });
  const cachedMap = Object.fromEntries(
    cached.map((doc) => [doc._id, parseCacheEntry(doc)])
  );

  const missing = tickerList.filter(
    ({ ticker, exchange }) => !cachedMap[`${exchange}:${ticker}`]
  );

  const yahooMissing = missing.filter((t) => t.exchange !== "NEPSE");
  const nepseMissing = missing.filter((t) => t.exchange === "NEPSE");

  const results = { ...cachedMap };

  // Yahoo batch fetch
  if (yahooMissing.length > 0) {
    const symbols = yahooMissing.map(({ ticker, exchange }) =>
      exchange === "ASX" ? `${ticker}.AX` : ticker
    );

    try {
      const quotes      = await yahooFinance.quote(symbols);
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

      for (let i = 0; i < yahooMissing.length; i++) {
        const { ticker, exchange } = yahooMissing[i];
        const quote    = quotesArray[i];
        const cacheKey = `${exchange}:${ticker}`;

        const priceData = {
          price:        quote.regularMarketPrice,
          dayPercent:   quote.regularMarketChangePercent ?? null,
          weeklyHigh52: quote.fiftyTwoWeekHigh ?? null,
          weeklyLow52:  quote.fiftyTwoWeekLow ?? null,
          lastTraded:   quote.regularMarketTime ?? null,
          sector:       null,
        };

        const ttlSeconds = getCacheTtl(exchange);
        const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

        const doc = await PriceCache.findByIdAndUpdate(
          cacheKey,
          { _id: cacheKey, exchange, ticker, ...priceData, fetchedAt: new Date(), expiresAt },
          { upsert: true, returnDocument: "after" }
        );

        results[cacheKey] = parseCacheEntry(doc);
      }
    } catch (error) {
      console.error("Yahoo batch fetch failed:", error.message);
      for (const { ticker, exchange } of yahooMissing) {
        results[`${exchange}:${ticker}`] = null;
      }
    }
  }

  // NEPSE individual fetches
  for (const { ticker, exchange } of nepseMissing) {
    const cacheKey = `${exchange}:${ticker}`;
    try {
      const priceData  = await fetchNepsePrice(ticker);
      const ttlSeconds = getCacheTtl(exchange);
      const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

      const doc = await PriceCache.findByIdAndUpdate(
        cacheKey,
        { _id: cacheKey, exchange, ticker, ...priceData, fetchedAt: new Date(), expiresAt },
        { upsert: true, returnDocument: "after" }
      );

      results[cacheKey] = parseCacheEntry(doc);
    } catch (error) {
      console.error(`NEPSE fetch failed for ${ticker}:`, error.message);
      results[cacheKey] = null;
    }
  }

  return results;
};
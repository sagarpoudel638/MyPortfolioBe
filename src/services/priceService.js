// services/priceService.js
import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";
import PriceCache, { parseCacheEntry } from "../models/PriceCache.js";
import { getCacheTtl } from "./tradingHours.js";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const ASX_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
};

// ── ASX scraper (stockanalysis.com) ──────────────────────────────────────────
const fetchASXPrice = async (ticker) => {
  const { data } = await axios.get(
    `https://stockanalysis.com/quote/asx/${ticker}/`,
    { headers: ASX_HEADERS, timeout: 15000 }
  );

  const $ = cheerio.load(data);

  let scriptText = "";
  $("script").each((i, el) => {
    const text = $(el).html() || "";
    if (text.includes("h52")) {
      scriptText = text;
      return false;
    }
  });

  if (!scriptText) {
    throw new Error(`Could not find price data for ASX:${ticker}`);
  }

  const extract = (key) => {
    const match = scriptText.match(new RegExp(`${key}:([-\\d.]+)`));
    return match ? parseFloat(match[1]) : null;
  };

  const extractStr = (key) => {
    const match = scriptText.match(new RegExp(`${key}:"([^"]+)"`));
    return match ? match[1] : null;
  };

  const price = extract("pd");
  if (!price) throw new Error(`Could not parse price for ASX:${ticker}`);

  return {
    price,
    dayPercent:   extract("cp"),
    weeklyHigh52: extract("h52"),
    weeklyLow52:  extract("l52"),
    lastTraded:   extractStr("td") ? new Date(extractStr("td")) : new Date(),
    sector:       null,
  };
};

// ── Tiingo fetcher (US — NYSE/NASDAQ) ─────────────────────────────────────────
const fetchTiingoPrice = async (ticker) => {
  const apiKey = process.env.TIINGO_API_KEY;

  const { data: daily } = await axios.get(
    `https://api.tiingo.com/tiingo/daily/${ticker.toLowerCase()}/prices`,
    {
      headers: { Authorization: `Token ${apiKey}` },
      params: {
        startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
          .toISOString().split("T")[0],
      },
      timeout: 15000,
    }
  );

  if (!daily || daily.length === 0) {
    throw new Error(`No data returned for ${ticker}`);
  }

  const latest = daily[daily.length - 1];
  const prev   = daily.length > 1 ? daily[daily.length - 2] : null;

  const highs = daily.map((d) => d.high).filter(Boolean);
  const lows  = daily.map((d) => d.low).filter(Boolean);

  const dayPercent = prev?.close && latest?.close
    ? parseFloat((((latest.close - prev.close) / prev.close) * 100).toFixed(2))
    : null;

  return {
    price:        latest.close,
    dayPercent,
    weeklyHigh52: highs.length > 0 ? Math.max(...highs) : null,
    weeklyLow52:  lows.length  > 0 ? Math.min(...lows)  : null,
    lastTraded:   new Date(latest.date),
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
  const sectorText     = getTdByTh("Sector");

  const price = cleanNumber(priceText);
  if (!price) throw new Error(`Could not parse price for NEPSE:${ticker}`);

  let weeklyHigh52 = null;
  let weeklyLow52  = null;

  if (high52Text) {
    const parts = high52Text.split("-");
    if (parts.length === 2) {
      weeklyHigh52 = cleanNumber(parts[0]);
      weeklyLow52  = cleanNumber(parts[1]);
    }
  }

  return {
    price,
    dayPercent:   cleanNumber(dayPercentText),
    weeklyHigh52,
    weeklyLow52,
    lastTraded:   lastTradedText
      ? new Date(lastTradedText.replace(/\//g, "-"))
      : new Date(),
    sector: sectorText || null,
  };
};

// ── Route fetch by exchange ───────────────────────────────────────────────────
const fetchPrice = async (ticker, exchange) => {
  if (exchange === "NEPSE") return fetchNepsePrice(ticker);
  if (exchange === "ASX")   return fetchASXPrice(ticker);
  return fetchTiingoPrice(ticker); // NYSE, NASDAQ
};

// ── Scheduled fetch — called by cron jobs in server.js ───────────────────────
export const scheduledPriceFetch = async (tickerList) => {
  for (const { ticker, exchange } of tickerList) {
    const cacheKey = `${exchange}:${ticker}`;
    try {
      const priceData  = await fetchPrice(ticker, exchange);
      const ttlSeconds = getCacheTtl(exchange);
      const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

      await PriceCache.findByIdAndUpdate(
        cacheKey,
        { _id: cacheKey, exchange, ticker, ...priceData, fetchedAt: new Date(), expiresAt },
        { upsert: true, returnDocument: "after" }
      );

      console.log(`[Price] ✅ ${cacheKey}: ${priceData.price}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Price] ❌ ${cacheKey}:`, error.message);
    }
  }
};

// ── Core: get price for one ticker (cache-first) ──────────────────────────────
export const getPrice = async (ticker, exchange) => {
  const cacheKey = `${exchange}:${ticker}`;

  const cached = await PriceCache.findById(cacheKey);
  if (cached) return parseCacheEntry(cached);

  let priceData;
  try {
    priceData = await fetchPrice(ticker, exchange);
  } catch (error) {
    throw new Error(`Failed to fetch price for ${exchange}:${ticker} — ${error.message}`);
  }

  const ttlSeconds = getCacheTtl(exchange);
  const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

  const doc = await PriceCache.findByIdAndUpdate(
    cacheKey,
    { _id: cacheKey, exchange, ticker, ...priceData, fetchedAt: new Date(), expiresAt },
    { upsert: true, returnDocument: "after" }
  );

  return parseCacheEntry(doc);
};

// ── Batch: get prices for multiple tickers (cache-first) ─────────────────────
export const getPrices = async (tickerList) => {
  const cacheKeys = tickerList.map(({ ticker, exchange }) => `${exchange}:${ticker}`);

  const cached = await PriceCache.find({ _id: { $in: cacheKeys } });
  const cachedMap = Object.fromEntries(
    cached.map((doc) => [doc._id, parseCacheEntry(doc)])
  );

  const missing = tickerList.filter(
    ({ ticker, exchange }) => !cachedMap[`${exchange}:${ticker}`]
  );

  const results = { ...cachedMap };

  for (const { ticker, exchange } of missing) {
    const cacheKey = `${exchange}:${ticker}`;
    try {
      const priceData  = await fetchPrice(ticker, exchange);
      const ttlSeconds = getCacheTtl(exchange);
      const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

      const doc = await PriceCache.findByIdAndUpdate(
        cacheKey,
        { _id: cacheKey, exchange, ticker, ...priceData, fetchedAt: new Date(), expiresAt },
        { upsert: true, returnDocument: "after" }
      );

      results[cacheKey] = parseCacheEntry(doc);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Fetch failed for ${cacheKey}:`, error.message);
      results[cacheKey] = null;
    }
  }

  return results;
};
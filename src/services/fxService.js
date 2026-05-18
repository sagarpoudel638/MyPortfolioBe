// services/fxService.js
import axios from "axios";
import { getFxCacheDuration } from "./tradingHours.js";

let fxCache = {
  rates: null,
  fetchedAt: null,
};

// const CACHE_DURATION_MS = 15 * 60 * 1000;

export const getFxRates = async (baseCurrency = "AUD") => {
  const now = Date.now();
  const CACHE_DURATION_MS = getFxCacheDuration(); // dynamic per trading hours

  if (
    fxCache.rates &&
    fxCache.fetchedAt &&
    now - fxCache.fetchedAt < CACHE_DURATION_MS
  ) {
    return fxCache.rates;
  }

  try {
    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/latest/${baseCurrency}`
    );

    fxCache = {
      rates: response.data.conversion_rates,
      fetchedAt: now,
    };

    return fxCache.rates;
  } catch (error) {
    if (fxCache.rates) {
      console.warn("FX fetch failed — using stale cache");
      return fxCache.rates;
    }
    throw new Error(`Failed to fetch FX rates: ${error.message}`);
  }
};

// Convert any currency amount to AUD
export const toAUD = (amount, fromCurrency, rates) => {
  if (fromCurrency === "AUD") return amount;
  const rate = rates[fromCurrency];
  if (!rate) throw new Error(`No FX rate for ${fromCurrency}`);
  return amount / rate;
};
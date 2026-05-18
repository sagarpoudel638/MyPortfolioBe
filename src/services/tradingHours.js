// services/tradingHours.js
import { DateTime } from "luxon";

const EXCHANGES = {
  ASX: {
    timezone: "Australia/Sydney",
    open:  { hour: 10, minute: 0 },
    close: { hour: 16, minute: 0 },
    days:  [1, 2, 3, 4, 5], // Mon-Fri
  },
  NEPSE: {
  timezone: "Asia/Kathmandu",
  open:  { hour: 11, minute: 0 },
  close: { hour: 15, minute: 0 },
  days:  [1, 2, 3, 4, 5], // Mon-Fri — updated per NEPSE notice Chaitra 2082
},
  NYSE: {
    timezone: "America/New_York",
    open:  { hour: 9,  minute: 30 },
    close: { hour: 16, minute: 0 },
    days:  [1, 2, 3, 4, 5], // Mon-Fri
  },
  NASDAQ: {
    timezone: "America/New_York",
    open:  { hour: 9,  minute: 30 },
    close: { hour: 16, minute: 0 },
    days:  [1, 2, 3, 4, 5], // Mon-Fri
  },
};

export const isMarketOpen = (exchange) => {
  const config = EXCHANGES[exchange];
  if (!config) return false;

  const now = DateTime.now().setZone(config.timezone);
  const dayOfWeek = now.weekday % 7; // luxon: 1=Mon...7=Sun → convert to JS: 0=Sun

  // Check if today is a trading day
  if (!config.days.includes(dayOfWeek)) return false;

  // Check if current time is within trading hours
  const openTime  = now.set({ hour: config.open.hour,  minute: config.open.minute,  second: 0 });
  const closeTime = now.set({ hour: config.close.hour, minute: config.close.minute, second: 0 });

  return now >= openTime && now < closeTime;
};

// Returns cache TTL in seconds based on whether market is open
export const getCacheTtl = (exchange) => {
  const open = isMarketOpen(exchange);
  const activeTtl  = parseInt(process.env.PRICE_CACHE_ACTIVE_SECONDS)  || 900;   // 15 min
  const inactiveTtl = parseInt(process.env.PRICE_CACHE_INACTIVE_SECONDS) || 3600; // 1 hour
  return open ? activeTtl : inactiveTtl;
};

// Returns FX cache duration in ms
export const getFxCacheDuration = () => {
  // FX is active if any major market is open
  const anyOpen = ["ASX", "NEPSE", "NYSE", "NASDAQ"].some(isMarketOpen);
  const activeFx   = parseInt(process.env.FX_CACHE_ACTIVE_MS)   || 3600000;  // 1 hour
  const inactiveFx = parseInt(process.env.FX_CACHE_INACTIVE_MS) || 86400000; // 24 hours
  return anyOpen ? activeFx : inactiveFx;
};
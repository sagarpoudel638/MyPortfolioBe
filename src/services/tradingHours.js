// services/tradingHours.js
import { DateTime } from "luxon";

const EXCHANGES = {
  ASX: {
    timezone: "Australia/Sydney",
    open:  { hour: 10, minute: 0 },
    close: { hour: 16, minute: 0 },
    days:  [1, 2, 3, 4, 5],
  },
  NEPSE: {
    timezone: "Asia/Kathmandu",
    open:  { hour: 11, minute: 0 },
    close: { hour: 15, minute: 0 },
    days:  [1, 2, 3, 4, 5],
  },
  NYSE: {
    timezone: "America/New_York",
    open:  { hour: 9,  minute: 30 },
    close: { hour: 16, minute: 0 },
    days:  [1, 2, 3, 4, 5],
  },
  NASDAQ: {
    timezone: "America/New_York",
    open:  { hour: 9,  minute: 30 },
    close: { hour: 16, minute: 0 },
    days:  [1, 2, 3, 4, 5],
  },
};

export const isMarketOpen = (exchange) => {
  const config = EXCHANGES[exchange];
  if (!config) return false;

  const now       = DateTime.now().setZone(config.timezone);
  const dayOfWeek = now.weekday % 7;

  if (!config.days.includes(dayOfWeek)) return false;

  const openTime  = now.set({ hour: config.open.hour,  minute: config.open.minute,  second: 0 });
  const closeTime = now.set({ hour: config.close.hour, minute: config.close.minute, second: 0 });

  return now >= openTime && now < closeTime;
};

export const getMarketStatus = (exchange) => {
  const config = EXCHANGES[exchange];
  if (!config) return null;

  const now       = DateTime.now().setZone(config.timezone);
  const dayOfWeek = now.weekday % 7;
  const isWeekday = config.days.includes(dayOfWeek);
  const isOpen    = isMarketOpen(exchange);

  const openTime  = now.set({ hour: config.open.hour,  minute: config.open.minute,  second: 0 });
  const closeTime = now.set({ hour: config.close.hour, minute: config.close.minute, second: 0 });

  let nextEventMs;
  let nextEventLabel;

  if (isOpen) {
    // Market is open — time until close
    nextEventMs    = closeTime.toMillis() - now.toMillis();
    nextEventLabel = "closes";
  } else {
    // Market is closed — find next open
    let nextOpen = openTime;

    if (now >= closeTime || !isWeekday) {
      // After close or weekend — find next trading day
      let daysAhead = 1;
      while (daysAhead <= 7) {
        const candidate    = now.plus({ days: daysAhead });
        const candidateDay = candidate.weekday % 7;
        if (config.days.includes(candidateDay)) {
          nextOpen = candidate.set({
            hour:   config.open.hour,
            minute: config.open.minute,
            second: 0,
          });
          break;
        }
        daysAhead++;
      }
    }

    nextEventMs    = nextOpen.toMillis() - now.toMillis();
    nextEventLabel = "opens";
  }

  return {
    exchange,
    isOpen,
    nextEventMs:    Math.max(0, Math.round(nextEventMs / 1000)) * 1000, // in ms
    nextEventLabel, // "opens" or "closes"
    timezone:       config.timezone,
  };
};

export const getCacheTtl = (exchange) => {
  const open      = isMarketOpen(exchange);
  const activeTtl   = parseInt(process.env.PRICE_CACHE_ACTIVE_SECONDS)   || 900;
  const inactiveTtl = parseInt(process.env.PRICE_CACHE_INACTIVE_SECONDS) || 3600;
  return open ? activeTtl : inactiveTtl;
};

export const getFxCacheDuration = () => {
  const anyOpen  = ["ASX", "NEPSE", "NYSE", "NASDAQ"].some(isMarketOpen);
  const activeFx   = parseInt(process.env.FX_CACHE_ACTIVE_MS)   || 3600000;
  const inactiveFx = parseInt(process.env.FX_CACHE_INACTIVE_MS) || 86400000;
  return anyOpen ? activeFx : inactiveFx;
};
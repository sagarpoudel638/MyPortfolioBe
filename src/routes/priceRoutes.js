// routes/priceRoutes.js
import express from "express";
import { getPortfolioPrices } from "../controllers/priceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { isMarketOpen, getCacheTtl, getFxCacheDuration, getMarketStatus } from "../services/tradingHours.js";
import { DateTime } from "luxon";
const router = express.Router();

router.use(protect);

router.get("/", getPortfolioPrices);
router.get("/market-status", protect, (req, res) => {
  const exchanges = ["ASX", "NEPSE", "NYSE", "NASDAQ"];
  const TIMEZONES = {
    ASX:    "Australia/Sydney",
    NEPSE:  "Asia/Kathmandu",
    NYSE:   "America/New_York",
    NASDAQ: "America/New_York",
  };

  const status = {};
  for (const ex of exchanges) {
    const localTime = DateTime.now().setZone(TIMEZONES[ex]);
    status[ex] = {
      isOpen:          isMarketOpen(ex),
      cacheTtlSeconds: getCacheTtl(ex),
      cacheTtlMinutes: Math.round(getCacheTtl(ex) / 60),
      localTime:       localTime.toFormat("yyyy-MM-dd HH:mm:ss"),
      localDay:        localTime.weekdayLong,
    };
  }

  res.json({
    exchanges: status,
    fxCacheDurationMs:    getFxCacheDuration(),
    fxCacheDurationHours: Math.round(getFxCacheDuration() / 3600000),
  });
});

router.get("/market-status", protect, (req, res) => {
  const markets = [
    { label: "ASX",   exchanges: ["ASX"]            },
    { label: "NYSE",  exchanges: ["NYSE", "NASDAQ"]  },
    { label: "NEPSE", exchanges: ["NEPSE"]           },
  ];

  const status = markets.map(({ label, exchanges }) => {
    // Use first exchange for status (NYSE and NASDAQ same hours)
    const s = getMarketStatus(exchanges[0]);
    return {
      label,
      isOpen:         s.isOpen,
      nextEventMs:    s.nextEventMs,
      nextEventLabel: s.nextEventLabel,
    };
  });

  res.json(status);
});
export default router;
// routes/priceRoutes.js
import express from "express";
import { getPortfolioPrices } from "../controllers/priceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { isMarketOpen, getCacheTtl, getFxCacheDuration, getMarketStatus } from "../services/tradingHours.js";

const router = express.Router();

router.use(protect);

router.get("/", getPortfolioPrices);

router.get("/market-status", (req, res) => {
  const markets = [
    { label: "ASX",   exchanges: ["ASX"]           },
    { label: "NYSE",  exchanges: ["NYSE", "NASDAQ"] },
    { label: "NEPSE", exchanges: ["NEPSE"]          },
  ];

  const status = markets.map(({ label, exchanges }) => {
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
// routes/priceRoutes.js
import express from "express";
import { getPortfolioPrices } from "../controllers/priceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { isMarketOpen, getCacheTtl, getFxCacheDuration, getMarketStatus } from "../services/tradingHours.js";
import { getPrices } from "../services/priceService.js";

const router = express.Router();

router.use(protect);

router.get("/", getPortfolioPrices);

// GET /api/prices/verify?ticker=NABIL&exchange=NEPSE
// Lightweight ticker check — returns { found, price } without blocking the caller.
router.get("/verify", async (req, res) => {
  const ticker   = (req.query.ticker   || "").trim().toUpperCase();
  const exchange = (req.query.exchange || "").trim().toUpperCase();

  if (!ticker || !exchange) {
    return res.status(400).json({ message: "ticker and exchange are required." });
  }

  try {
    const results = await getPrices([{ ticker, exchange }]);
    const entry   = results[`${exchange}:${ticker}`];
    const found   = entry !== null && entry !== undefined;
    return res.json({ found, price: found ? (entry.current ?? null) : null });
  } catch {
    return res.json({ found: false, price: null });
  }
});

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
// routes/priceRoutes.js
import express from "express";
import { getPortfolioPrices } from "../controllers/priceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getPortfolioPrices);

export default router;
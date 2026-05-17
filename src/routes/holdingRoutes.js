// routes/holdingRoutes.js
import express from "express";
import {
  getHoldings,
  getHoldingById,
  createHolding,
  updateHolding,
  deleteHolding,
} from "../controllers/holdingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // all holdings routes require auth

router.get("/", getHoldings);
router.get("/:id", getHoldingById);
router.post("/", createHolding);
router.put("/:id", updateHolding);
router.delete("/:id", deleteHolding);

export default router;
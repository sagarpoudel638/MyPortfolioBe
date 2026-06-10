// routes/holdingRoutes.js
import express from "express";
import {
  getHoldings,
  getHoldingById,
  createHolding,
  updateHolding,
  deleteHolding,
  sellHolding,
  mergeHoldings,
} from "../controllers/holdingController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.use(protect); // all holdings routes require auth

router.get("/", getHoldings);
router.post("/merge", mergeHoldings);                          // before /:id to avoid param capture
router.get("/:id", validateObjectId, getHoldingById);
router.post("/", createHolding);
router.put("/:id/sell", validateObjectId, sellHolding);
router.put("/:id", validateObjectId, updateHolding);
router.delete("/:id", validateObjectId, deleteHolding);

export default router;
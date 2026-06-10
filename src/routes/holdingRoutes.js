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
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.use(protect); // all holdings routes require auth

router.get("/", getHoldings);
router.get("/:id", validateObjectId, getHoldingById);
router.post("/", createHolding);
router.put("/:id", validateObjectId, updateHolding);
router.delete("/:id", validateObjectId, deleteHolding);

export default router;
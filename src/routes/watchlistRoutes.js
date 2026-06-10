// routes/watchlistRoutes.js
import express from "express";
import {
  getWatchlist, getWatchlistItemById, createWatchlistItem,
  updateWatchlistItem, deleteWatchlistItem,
  getWatchlistPrices, getEnrichedWatchlist,
} from "../controllers/watchlistController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validateObjectId } from "../middleware/validateObjectId.js";


const router = express.Router();

router.use(protect);

router.get("/", getWatchlist);
router.get("/prices", getWatchlistPrices);
router.get("/enriched", getEnrichedWatchlist);
router.get("/:id", validateObjectId, getWatchlistItemById);
router.post("/", createWatchlistItem);
router.put("/:id", validateObjectId, updateWatchlistItem);
router.delete("/:id", validateObjectId, deleteWatchlistItem);


export default router;
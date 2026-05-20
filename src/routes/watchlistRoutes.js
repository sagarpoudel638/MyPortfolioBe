// routes/watchlistRoutes.js
import express from "express";
import {
  getWatchlist, getWatchlistItemById, createWatchlistItem,
  updateWatchlistItem, deleteWatchlistItem,
  getWatchlistPrices, getEnrichedWatchlist,
} from "../controllers/watchlistController.js";import { protect } from "../middleware/authMiddleware.js";


const router = express.Router();

router.use(protect);

router.get("/", getWatchlist);
router.get("/prices", getWatchlistPrices);
router.get("/enriched", getEnrichedWatchlist);
router.get("/:id", getWatchlistItemById);
router.post("/", createWatchlistItem);
router.put("/:id", updateWatchlistItem);
router.delete("/:id", deleteWatchlistItem);


export default router;
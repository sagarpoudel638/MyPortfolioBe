// models/Watchlist.js
import mongoose from "mongoose";

const watchlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    exchange: {
      type: String,
      enum: ["ASX", "NYSE", "NASDAQ", "NEPSE"],
      required: true,
    },

    action: {
      type: String,
      enum: ["Buy", "Sell"],
      required: true,
    },

    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    priceAlertThreshold: {
      type: mongoose.Schema.Types.Decimal128,
      default: null, // null = no alert set
    },

    alertDirection: {
      type: String,
      enum: ["above", "below", null],
      default: null,
    },

    alertTriggered: {
      type: Boolean,
      default: false,
    },
    plannedQty: {
  type: mongoose.Schema.Types.Decimal128,
  default: null,
},
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
watchlistSchema.index({ userId: 1 });
watchlistSchema.index({ userId: 1, symbol: 1 });

export default mongoose.model("Watchlist", watchlistSchema);
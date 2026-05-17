// models/Holding.js
import mongoose from "mongoose";

const holdingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    platform: {
      type: String,
      enum: ["CommBank", "CommSecPocket", "Webull", "Meroshare"],
      required: true,
    },

    exchange: {
      type: String,
      enum: ["ASX", "NYSE", "NASDAQ", "NEPSE"],
      required: true,
    },

    currency: {
      type: String,
      enum: ["AUD", "USD", "NPR"],
      required: true,
    },

    ticker: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    qty: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    buyPrice: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      min: 0, // 0 allowed — free allotments
    },

    purchaseDate: {
      type: Date,
      required: true,
    },

    isFreeAllotment: {
      type: Boolean,
      default: false, // if true, excluded from Return%
    },

    isTracking: {
      type: Boolean,
      default: true, // if false, excluded from all value calcs
    },

    manualCurrentPrice: {
      type: mongoose.Schema.Types.Decimal128,
      default: null, // null = use live price API
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

// ── Virtual: invested (qty × buyPrice) ──────────────────────────────────────
holdingSchema.virtual("invested").get(function () {
  const qty = parseFloat(this.qty);
  const buyPrice = parseFloat(this.buyPrice);
  return parseFloat((qty * buyPrice).toFixed(4));
});

holdingSchema.set("toJSON", { virtuals: true });
holdingSchema.set("toObject", { virtuals: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
holdingSchema.index({ userId: 1, platform: 1 });
holdingSchema.index({ userId: 1, ticker: 1 });

export default mongoose.model("Holding", holdingSchema);
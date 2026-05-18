// models/PriceCache.js
import mongoose from "mongoose";

const priceCacheSchema = new mongoose.Schema(
  {
    _id: {
      type: String, // composite key e.g. "ASX:CBA", "NEPSE:NABIL", "NASDAQ:TSLA"
    },

    exchange: {
      type: String,
      enum: ["ASX", "NYSE", "NASDAQ", "NEPSE"],
      required: true,
    },

    ticker: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    price: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    dayPercent: {
      type: mongoose.Schema.Types.Decimal128,
      default: null, // % change today
    },

    weeklyHigh52: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },

    weeklyLow52: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },

    lastTraded: {
      type: Date,
      default: null,
    },

    fetchedAt: {
  type: Date,
  default: Date.now,
},

expiresAt: {
  type: Date,
  default: () => new Date(Date.now() + 3600 * 1000), // default 1 hour
},
  },
  {
    timestamps: false, // fetchedAt handles this manually
    _id: false,        // disable auto ObjectId — we set _id manually
  }
);

priceCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── Helper: parse Decimal128 fields ─────────────────────────────────────────
export const parseCacheEntry = (doc) => ({
  id: doc._id,
  exchange: doc.exchange,
  ticker: doc.ticker,
  price: parseFloat(doc.price),
  dayPercent: doc.dayPercent ? parseFloat(doc.dayPercent) : null,
  weeklyHigh52: doc.weeklyHigh52 ? parseFloat(doc.weeklyHigh52) : null,
  weeklyLow52: doc.weeklyLow52 ? parseFloat(doc.weeklyLow52) : null,
  lastTraded: doc.lastTraded,
  fetchedAt: doc.fetchedAt,
});

export default mongoose.model("PriceCache", priceCacheSchema);
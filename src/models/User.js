// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    refreshTokenHash: {
      type: String,
      default: null,
    },

    baseCurrency: {
      type: String,
      enum: ["AUD", "USD", "NPR"],
      default: "AUD",
    },

    manualFxRates: {
      audNpr: { type: Number, default: null }, // null = use live API
      audUsd: { type: Number, default: null },
    },

    notifications: {
      stopLossAlerts:  { type: Boolean, default: true },
      targetHitAlerts: { type: Boolean, default: true },
      priceAlerts:     { type: Boolean, default: true },
      dailySummary:    { type: Boolean, default: false },
    },
    isVerified: {
  type: Boolean,
  default: false,
},

verifyToken: {
  type: String,
  default: null,
},

verifyTokenExpiry: {
  type: Date,
  default: null,
},
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
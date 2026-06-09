// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["price_alert", "portfolio_summary"],
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional — populated for price_alert notifications
    ticker: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },

    exchange: {
      type: String,
      trim: true,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);

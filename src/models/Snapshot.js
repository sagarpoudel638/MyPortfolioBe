// models/Snapshot.js
import mongoose from "mongoose";

const snapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    totalValueAUD: {
      type: Number,
      required: true,
    },

    totalInvestedAUD: {
      type: Number,
      required: true,
    },

    platforms: {
      commbank:      { value: Number, currency: String },
      commsecpocket: { value: Number, currency: String },
      webull:        { value: Number, currency: String },
      meroshare:     { value: Number, currency: String },
    },
  },
  { timestamps: true }
);

// One snapshot per user per day
snapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

snapshotSchema.index(
  { date: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 } // 1 year
);
export default mongoose.model("Snapshot", snapshotSchema);
/**
 * Migration: platform → broker
 *
 * Copies the old `platform` field value into the new `broker` field,
 * then removes `platform` from all holding documents.
 *
 * Run once: node migrate-platform-to-market.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const PLATFORM_TO_BROKER = {
  CommBank:      "CommBank",
  CommSecPocket: "CommSec Pocket",
  Webull:        "Webull",
  Meroshare:     "Meroshare",
};

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const collection = mongoose.connection.collection("holdings");

  // Find all holdings that still have a platform field
  const holdings = await collection.find({ platform: { $exists: true } }).toArray();
  console.log(`Found ${holdings.length} holdings to migrate`);

  let updated = 0;
  for (const h of holdings) {
    const broker = PLATFORM_TO_BROKER[h.platform] || h.platform;
    await collection.updateOne(
      { _id: h._id },
      {
        $set:   { broker },
        $unset: { platform: "" },
      }
    );
    updated++;
  }

  console.log(`Migrated ${updated} holdings`);
  await mongoose.disconnect();
  console.log("Done");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

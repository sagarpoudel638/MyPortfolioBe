// server.js
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import cron from "node-cron";
import app from "./app.js";
import { takeSnapshotsForAllUsers } from "./services/snapshotService.js";

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");

    // Midnight UTC daily snapshot
    cron.schedule("0 0 * * *", async () => {
      console.log("[Cron] Running daily snapshot...");
      await takeSnapshotsForAllUsers();
    }, { timezone: "UTC" });

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.log("MongoDB connection error:", error.message);
  });
// routes/snapshotRoutes.js
import express from "express";
import { getSnapshots, triggerSnapshot } from "../controllers/snapshotController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);

router.get("/", getSnapshots);
router.post("/trigger", triggerSnapshot);

export default router;
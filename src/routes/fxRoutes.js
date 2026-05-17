// routes/fxRoutes.js
import express from "express";
import { getFx } from "../controllers/fxController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/", getFx);

export default router;
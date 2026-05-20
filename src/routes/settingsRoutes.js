// routes/settingsRoutes.js
import express from "express";
import {
  getProfile,
  updateProfile,
  updateNotifications,
  deleteAccount,
} from "../controllers/settingsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);

router.get("/profile",       getProfile);
router.put("/profile",       updateProfile);
router.put("/notifications", updateNotifications);
router.delete("/account",    deleteAccount);

export default router;
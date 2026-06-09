// routes/notificationRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(protect);

router.get("/",                  getNotifications);
router.put("/read-all",          markAllAsRead);
router.put("/:id/read",          markAsRead);

export default router;

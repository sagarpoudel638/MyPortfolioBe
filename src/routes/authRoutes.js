import express from "express";
import {
  registerUser,
  loginUser,
  refreshToken,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register",        registerUser);
router.post("/login",           loginUser);
router.post("/refresh",         refreshToken);
router.post("/logout",          logout);
router.get("/verify-email",     verifyEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password",  resetPassword);
router.put("/change-password",  protect, changePassword);

export default router;
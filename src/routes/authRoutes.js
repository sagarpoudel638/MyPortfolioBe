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
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  refreshLimiter,
} from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/register",        registerLimiter,       registerUser);
router.post("/login",           loginLimiter,          loginUser);
router.post("/refresh",         refreshLimiter,        refreshToken);
router.post("/logout",          logout);
router.get("/verify-email",     verifyEmail);
router.post("/forgot-password", passwordResetLimiter,  forgotPassword);
router.post("/reset-password",  passwordResetLimiter,  resetPassword);
router.put("/change-password",  protect,               changePassword);

export default router;
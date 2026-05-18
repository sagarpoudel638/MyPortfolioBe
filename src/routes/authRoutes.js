import express from "express";
import { registerUser, loginUser, refreshToken, logout, verifyEmail } from "../controllers/authController.js";


const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh", refreshToken);
router.post("/logout", logout);
router.get("/verify-email", verifyEmail); 

export default router;
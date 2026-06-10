// controllers/authController.js
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import crypto from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateTokens.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/emailService.js";

// ── Validation helpers ──────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateRegisterInput = ({ name, email, password }) => {
  if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50)
    return "Name must be between 2 and 50 characters.";
  if (!email || !EMAIL_RE.test(email))
    return "A valid email address is required.";
  if (!password || password.length < 8 || password.length > 128)
    return "Password must be between 8 and 128 characters.";
  return null;
};

// REGISTER
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const validationError = validateRegisterInput({ name, email, password });
    if (validationError) return res.status(400).json({ message: validationError });

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      verifyToken,
      verifyTokenExpiry,
      isVerified: false,
    });

    // Send verification email
    await sendVerificationEmail(email.toLowerCase().trim(), name.trim(), verifyToken);

    res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Lockout constants ───────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// LOGIN
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      // Don't reveal whether the account exists
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        message: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Use updateOne to avoid triggering full document validation on failure path
      const attempts = (user.failedLoginAttempts || 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await User.updateOne(
          { _id: user._id },
          { $set: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS), failedLoginAttempts: 0 } }
        );
        return res.status(429).json({
          message: "Too many failed attempts. Account locked for 15 minutes.",
        });
      }
      await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts } });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Successful login — reset lockout counters then save refresh token in one write
    if (!user.isVerified) {
      await User.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 0, lockedUntil: null } }
      );
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        unverified: true,
      });
    }

    const rawRefresh = generateRefreshToken();
    user.refreshTokenHash = hashToken(rawRefresh);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    res.json({
      accessToken: generateAccessToken(user._id),
      refreshToken: rawRefresh,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        baseCurrency: user.baseCurrency,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// REFRESH
export const refreshToken = async (req, res) => {
  const { refreshToken: rawToken } = req.body;

  if (!rawToken) {
    return res.status(400).json({ message: "Refresh token required" });
  }

  try {
    const hashed = hashToken(rawToken);
    const user = await User.findOne({ refreshTokenHash: hashed });

    if (!user) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const newRawRefresh = generateRefreshToken();
    user.refreshTokenHash = hashToken(newRawRefresh);
    await user.save();

    res.json({
      accessToken: generateAccessToken(user._id),
      refreshToken: newRawRefresh,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGOUT
export const logout = async (req, res) => {
  const { refreshToken: rawToken } = req.body;

  if (!rawToken) {
    return res.status(400).json({ message: "Refresh token required" });
  }

  try {
    const hashed = hashToken(rawToken);
    const user = await User.findOne({ refreshTokenHash: hashed });

    if (!user) {
      return res.status(200).json({ message: "Logged out" });
    }

    user.refreshTokenHash = null;
    await user.save();

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Verify Email
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Verification token missing" });
    }

    const user = await User.findOne({
      verifyToken: token,
      verifyTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification link" });
    }

    user.isVerified = true;
    user.verifyToken = null;
    user.verifyTokenExpiry = null;
    await user.save();

    return res.json({ message: "Email verified successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// FORGOT PASSWORD
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    // Always return success — don't reveal if email exists
    if (!user) {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    const resetToken  = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetToken       = resetToken;
    user.resetTokenExpiry = resetExpiry;
    await user.save();

    await sendPasswordResetEmail(user.email, user.name, resetToken);

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// RESET PASSWORD (via email token)
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    user.password         = await bcrypt.hash(password, 10);
    user.resetToken       = null;
    user.resetTokenExpiry = null;
    // Invalidate any existing refresh tokens
    user.refreshTokenHash = null;
    await user.save();

    res.json({ message: "Password reset successfully. Please log in." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// CHANGE PASSWORD (authenticated — for settings)
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both fields are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user._id);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from current" });
    }

    user.password         = await bcrypt.hash(newPassword, 10);
    user.refreshTokenHash = null; // force re-login on other devices
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
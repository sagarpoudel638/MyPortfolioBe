// controllers/authController.js
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import crypto from "crypto";
import { sendVerificationEmail } from "../services/emailService.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateTokens.js";

// REGISTER
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      verifyToken,
      verifyTokenExpiry,
      isVerified: false,
    });

    // Send verification email
    await sendVerificationEmail(email, name, verifyToken);

    res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Block unverified users
    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        unverified: true,
      });
    }

    const rawRefresh = generateRefreshToken();
    user.refreshTokenHash = hashToken(rawRefresh);
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

    // Redirect to login with success flag
    return res.redirect(
      `${process.env.CLIENT_URL}/login?verified=true`
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
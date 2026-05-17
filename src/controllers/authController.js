// controllers/authController.js
import bcrypt from "bcryptjs";
import User from "../models/User.js";
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

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    // Don't issue tokens on register — force explicit login
    res.status(201).json({
      message: "Registration successful. Please log in.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
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
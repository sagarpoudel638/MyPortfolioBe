// controllers/settingsController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";

// GET /api/settings/profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -refreshTokenHash -resetToken -resetTokenExpiry -verifyToken -verifyTokenExpiry"
    );
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/settings/profile
export const updateProfile = async (req, res) => {
  try {
    const { name, baseCurrency, manualFxRates } = req.body;

    const user = await User.findById(req.user._id);

    if (name)         user.name         = name.trim();
    if (baseCurrency) user.baseCurrency = baseCurrency;

    if (manualFxRates !== undefined) {
      user.manualFxRates.audNpr = manualFxRates.audNpr ?? null;
      user.manualFxRates.audUsd = manualFxRates.audUsd ?? null;
    }

    await user.save();

    res.json({
      message: "Profile updated",
      user: {
        name:          user.name,
        baseCurrency:  user.baseCurrency,
        manualFxRates: user.manualFxRates,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/settings/notifications
export const updateNotifications = async (req, res) => {
  try {
    const { stopLossAlerts, targetHitAlerts, priceAlerts, dailySummary } = req.body;

    const user = await User.findById(req.user._id);

    if (stopLossAlerts  !== undefined) user.notifications.stopLossAlerts  = stopLossAlerts;
    if (targetHitAlerts !== undefined) user.notifications.targetHitAlerts = targetHitAlerts;
    if (priceAlerts     !== undefined) user.notifications.priceAlerts     = priceAlerts;
    if (dailySummary    !== undefined) user.notifications.dailySummary    = dailySummary;

    await user.save();
    res.json({ message: "Notifications updated", notifications: user.notifications });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/settings/account
export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // Delete all user data
    await Promise.all([
      import("../models/Holding.js").then(({ default: Holding }) =>
        Holding.deleteMany({ userId: req.user._id })
      ),
      import("../models/Watchlist.js").then(({ default: Watchlist }) =>
        Watchlist.deleteMany({ userId: req.user._id })
      ),
      import("../models/Snapshot.js").then(({ default: Snapshot }) =>
        Snapshot.deleteMany({ userId: req.user._id })
      ),
      User.findByIdAndDelete(req.user._id),
    ]);

    res.json({ message: "Account deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
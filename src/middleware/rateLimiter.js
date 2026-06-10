// middleware/rateLimiter.js
import rateLimit from "express-rate-limit";

const windowMs = 15 * 60 * 1000; // 15 minutes

// Applied to all API routes
export const generalLimiter = rateLimit({
  windowMs,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

// Login — prevent brute force
export const loginLimiter = rateLimit({
  windowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
});

// Register — prevent account spam
export const registerLimiter = rateLimit({
  windowMs,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created from this IP. Please try again in 15 minutes." },
});

// Forgot password / reset — prevent email flooding
export const passwordResetLimiter = rateLimit({
  windowMs,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again in 15 minutes." },
});

// Token refresh — prevent token cycling abuse
export const refreshLimiter = rateLimit({
  windowMs,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many token refresh attempts. Please try again later." },
});

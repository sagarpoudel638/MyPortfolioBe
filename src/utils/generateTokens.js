
import jwt from "jsonwebtoken";
import crypto from "crypto";

export const generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });

export const generateRefreshToken = () =>
  crypto.randomBytes(64).toString("hex"); // not a JWT — just a secure random token

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
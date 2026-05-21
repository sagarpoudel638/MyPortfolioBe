// services/emailService.js
import nodemailer from "nodemailer";

export const sendVerificationEmail = async (toEmail, name, token) => {
  // Create transporter inside the function — guarantees env vars are loaded
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    family: 4, // ← force IPv4
  });

  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"PortfolioTracker" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Verify your PortfolioTracker account",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #162741; color: #e8edf5; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 48px; height: 48px; background: #00c896; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 12px;">📈</div>
          <h2 style="margin: 0; font-size: 20px;">PortfolioTracker</h2>
        </div>
        <p style="font-size: 15px; margin-bottom: 8px;">Hi ${name},</p>
        <p style="font-size: 13px; color: #8fa3bf; margin-bottom: 24px;">
          Thanks for signing up. Click the button below to verify your email address. This link expires in 24 hours.
        </p>
        <a href="${verifyUrl}"
          style="display: block; background: #1a6bbc; color: #fff; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 24px;">
          Verify Email Address
        </a>
        <p style="font-size: 11px; color: #5d7a9a; text-align: center;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (toEmail, name, token) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    family: 4, // ← force IPv4
  });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"PortfolioTracker" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Reset your PortfolioTracker password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #162741; color: #e8edf5; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 48px; height: 48px; background: #00c896; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 12px;">📈</div>
          <h2 style="margin: 0; font-size: 20px;">PortfolioTracker</h2>
        </div>
        <p style="font-size: 15px; margin-bottom: 8px;">Hi ${name},</p>
        <p style="font-size: 13px; color: #8fa3bf; margin-bottom: 24px;">
          We received a request to reset your password. Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}"
          style="display: block; background: #1a6bbc; color: #fff; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 24px;">
          Reset Password
        </a>
        <p style="font-size: 11px; color: #5d7a9a; text-align: center;">
          If you didn't request a password reset, you can safely ignore this email. Your password will not change.
        </p>
      </div>
    `,
  });
};
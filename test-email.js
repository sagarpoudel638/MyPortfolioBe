// test-email.js
import dotenv from "dotenv";
dotenv.config();

console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "loaded" : "MISSING");
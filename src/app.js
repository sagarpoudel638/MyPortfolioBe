import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import { sanitize as mongoSanitize } from "express-mongo-sanitize";
import { generalLimiter } from "./middleware/rateLimiter.js";
import priceRoutes from "./routes/priceRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import holdingRoutes from "./routes/holdingRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import fxRoutes from "./routes/fxRoutes.js";
import snapshotRoutes from "./routes/snapshotRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import importExportRoutes from "./routes/importExportRoutes.js";

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

app.use(helmet({
  contentSecurityPolicy: false,             // not needed for a JSON API
  crossOriginEmbedderPolicy: false,         // not needed for a JSON API
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow FE to read responses
}));                                        // keeps HSTS, X-Frame-Options, noSniff, etc.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "50kb" }));   // reject oversized JSON bodies
// express-mongo-sanitize's middleware tries to overwrite req.query which is
// a read-only getter in Express 5. Use the sanitize function directly instead.
app.use((req, _res, next) => {
  if (req.body)   req.body   = mongoSanitize(req.body);
  if (req.params) req.params = mongoSanitize(req.params);
  // req.query intentionally skipped — read-only in Express 5,
  // and query params should never reach Mongoose operators directly.
  next();
});
app.use(morgan("dev"));
app.use(generalLimiter);                    // global 200 req/15min per IP

// public routes
app.use("/api/auth", authRoutes);

// protected feature routes
app.use("/api/holdings", holdingRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/prices", priceRoutes);
app.use("/api/snapshots", snapshotRoutes);
app.use("/api/test", testRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/fx", fxRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api",               importExportRoutes);   // /api/import and /api/export


export default app;
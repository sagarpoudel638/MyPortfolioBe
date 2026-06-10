import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
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
app.use(mongoSanitize());                   // strip $ and . from req.body/query/params
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


export default app;
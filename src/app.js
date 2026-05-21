import express from "express";
import cors from "cors";
import morgan from "morgan";
import priceRoutes from "./routes/priceRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import holdingRoutes from "./routes/holdingRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import fxRoutes from "./routes/fxRoutes.js";
import snapshotRoutes from "./routes/snapshotRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

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


export default app;
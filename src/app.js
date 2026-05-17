import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes.js";
import holdingRoutes from "./routes/holdingRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// public routes
app.use("/api/auth", authRoutes);

// protected feature routes
app.use("/api/holdings", holdingRoutes);
app.use("/api/watchlist", watchlistRoutes);


app.use("/api/test", testRoutes);

export default app;
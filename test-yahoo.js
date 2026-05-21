// test-all-prices.js
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { getPrices } from "./src/services/priceService.js";

// Connect to MongoDB first
await mongoose.connect(process.env.MONGO_URI);
console.log("MongoDB connected");

const tickers = [
  { ticker: "A200",  exchange: "ASX"    },
  { ticker: "IOZ",   exchange: "ASX"    },
  { ticker: "NDQ",   exchange: "ASX"    },
  { ticker: "AAPL",  exchange: "NASDAQ" },
  { ticker: "TSLA",  exchange: "NASDAQ" },
  { ticker: "NABIL", exchange: "NEPSE"  },
];

const prices = await getPrices(tickers);
console.log(JSON.stringify(prices, null, 2));

await mongoose.disconnect();
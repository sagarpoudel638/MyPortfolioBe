# MyPortfolio — Backend

Node.js/Express REST API for the MyPortfolio app. Handles authentication, portfolio holdings, price data, FX rates, watchlists, snapshots, and dashboard aggregations.

## Tech Stack

- **Runtime:** Node.js (ESM)
- **Framework:** Express 5
- **Database:** MongoDB via Mongoose
- **Auth:** JWT (access + refresh tokens) + email verification
- **Email:** Nodemailer (Gmail)
- **Price data:** Tiingo API, Yahoo Finance, NEPSE scraper (Cheerio)
- **FX rates:** ExchangeRate API
- **Scheduling:** node-cron (daily portfolio snapshots)

## Project Structure

```
src/
├── app.js                  # Express app setup, middleware, routes
├── server.js               # DB connection, cron jobs, server start
├── controllers/            # Route handlers
│   ├── authController.js
│   ├── dashboardController.js
│   ├── fxController.js
│   ├── holdingController.js
│   ├── priceController.js
│   ├── settingsController.js
│   ├── snapshotController.js
│   └── watchlistController.js
├── middleware/
│   └── authMiddleware.js   # JWT verification
├── models/                 # Mongoose schemas
│   ├── Holding.js
│   ├── PriceCache.js
│   ├── Snapshot.js
│   ├── User.js
│   └── Watchlist.js
├── routes/                 # Express routers
├── services/               # Business logic
│   ├── emailService.js
│   ├── fxService.js
│   ├── priceService.js
│   ├── snapshotService.js
│   └── tradingHours.js
└── utils/
    └── generateTokens.js
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance (local or Atlas)

### Installation

```bash
cd myportfoliobe
npm install
```

### Environment Variables

Create a `.env` file in the root of `myportfoliobe/`:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/myportfolio

# JWT
JWT_SECRET=your_jwt_secret_min_64_chars
JWT_ACCESS_EXPIRES=10m

# Email (Gmail)
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_gmail_app_password

# External APIs
TIINGO_API_KEY=your_tiingo_key
ALPHA_VANTAGE_KEY=your_alpha_vantage_key
EXCHANGERATE_API_KEY=your_exchangerate_key

# CORS
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

# Price cache TTL (seconds)
PRICE_CACHE_ACTIVE_SECONDS=900
PRICE_CACHE_INACTIVE_SECONDS=3600

# FX cache duration (ms)
FX_CACHE_ACTIVE_MS=3600000
FX_CACHE_INACTIVE_MS=86400000
```

### Running

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3000` by default.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login, returns access + refresh tokens |
| POST | `/api/auth/logout` | — | Invalidate refresh token |
| POST | `/api/auth/refresh` | — | Refresh access token |
| GET | `/api/auth/verify-email` | — | Verify email via token |
| POST | `/api/auth/forgot-password` | — | Send password reset email |
| POST | `/api/auth/reset-password` | — | Reset password via token |
| GET | `/api/dashboard` | ✓ | Aggregated portfolio summary |
| GET | `/api/holdings` | ✓ | List all holdings |
| POST | `/api/holdings` | ✓ | Add a holding |
| PUT | `/api/holdings/:id` | ✓ | Update a holding |
| DELETE | `/api/holdings/:id` | ✓ | Delete a holding |
| GET | `/api/watchlist` | ✓ | Get watchlists with live prices |
| POST | `/api/watchlist` | ✓ | Create a watchlist |
| POST | `/api/watchlist/:id/items` | ✓ | Add item to watchlist |
| DELETE | `/api/watchlist/:id/items/:itemId` | ✓ | Remove item from watchlist |
| GET | `/api/prices` | ✓ | Get prices for given tickers |
| GET | `/api/fx` | ✓ | Get FX rates |
| GET | `/api/snapshots` | ✓ | Get portfolio snapshots |
| GET | `/api/settings` | ✓ | Get user settings |
| PUT | `/api/settings` | ✓ | Update user settings |
| DELETE | `/api/settings/account` | ✓ | Delete account |

All `✓` routes require `Authorization: Bearer <access_token>` header.

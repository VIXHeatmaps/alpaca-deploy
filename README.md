# Alpaca Strategy App - Production

Clean production deployment of the Alpaca trading strategy app.

## Features

- **Dashboard**: View Alpaca account info, current strategy, and snapshots
- **Strategy Builder**: Build and backtest trading strategies with visual UI

## Structure

```
├── backend/          # Node.js/Express backend API
├── frontend/         # React/Vite frontend UI
└── indicator-service/ # Python FastAPI indicator calculations
```

## Required Environment Variables

### Backend (Railway)
```
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
INDICATOR_SERVICE_URL=https://your-indicator.up.railway.app
ALPACA_FEED=sip
```

### Frontend (Vercel)
```
VITE_BACKEND_URL=https://your-backend.up.railway.app
VITE_INDICATOR_URL=https://your-indicator.up.railway.app
```

### Indicator Service (Railway)
```
PORT=8001
```

## Deployment

1. **Backend**: Deploy to Railway from `/backend` directory
2. **Indicator Service**: Deploy to Railway from `/indicator-service` directory
3. **Frontend**: Deploy to Vercel from `/frontend` directory

## API Endpoints

**Backend:**
- `GET /api/account` - Get Alpaca account info
- `GET /api/strategy` - Get current strategy
- `GET /api/strategy/snapshots` - Get strategy snapshots
- `POST /api/liquidate` - Liquidate positions
- `POST /api/backtest_strategy` - Run backtest
- `POST /api/batch_backtest_strategy` - Batch backtest
- `GET /api/batch_backtest_strategy/:id` - Get batch status

**Indicator Service:**
- `POST /indicator` - Calculate indicators
- `POST /metrics/quantstats` - Calculate QuantStats metrics

# Alpaca Deploy - Quick TODO

**Last Updated:** 2025-10-09

---

## 🔥 Priority Features

### 1. Dashboard - Multi-Strategy Tracking
- [ ] Support multiple active strategies simultaneously
- [ ] Display holdings per strategy (virtual divisions)
- [ ] Show aggregate portfolio view
- [ ] Add equity curve chart
- [ ] Real-time performance tracking

### 2. Database Migration
- [ ] Move strategies from JSON files to PostgreSQL
- [ ] Move variables to DB

### 3. Live Trading Improvements
- [ ] Fix equity tracking (currently shows $0)
- [ ] Add position history logging
- [ ] Improve rebalancing reliability
- [ ] Add order execution logs

---

## 📋 Feature Backlog

### Builder Enhancement
- [x] **UI Reorganization (Completed 2025-10-09)**
  - [x] Move strategy tabs to top (editable via double-click)
  - [x] Move version controls to toolbar
  - [x] Move backtest button and config to results header
  - [x] Make backtest bar always visible
  - [x] Add animated collapse/expand controls
- [ ] Scale logic
- [ ] Sort logic
- [ ] Filter logic

### Strategy Management
- [ ] Strategy templates/library
- [ ] Share strategies between users
- [ ] Clone/fork existing strategies

### Backtesting
- [ ] Save backtest history to DB
- [ ] Compare multiple backtests

### QuantStats Integration
- [ ] make QS metrics available in all locations

### Platform
- [ ] Email notifications for rebalancing
- [ ] Dark mode

---

## 🐛 Known Issues

- [ ] Dashboard equity shows $0 (snapshots not working)
- [ ] Active strategy lost on server restart
- [ ] No error handling for failed rebalances
- [ ] Credentials stored in localStorage (dev only)

---

## 🔐 Security & Production

- [ ] Encrypt API keys in database
- [ ] Add API rate limiting
- [ ] Enable Redis authentication
- [ ] Add HTTPS enforcement
- [ ] Implement session expiry

---

## 📊 Performance & Scale

- [ ] Add batch backtest worker pool (parallel execution)
- [ ] Optimize indicator caching strategy
- [ ] Add database query optimization
- [ ] Implement CDN for frontend assets

---

## 📚 Documentation

- [ ] User guide / tutorial
- [ ] API documentation
- [ ] Strategy builder guide
- [ ] Deployment guide

---

## 💡 Ideas / Research

- [ ] Options trading support
- [ ] Forex/crypto support
- [ ] ML-based strategy optimization
- [ ] Automated strategy discovery
- [ ] Social trading features

---

**Quick Links:**
- Full details: [TASK_BACKLOG.md](./TASK_BACKLOG.md)
- Project snapshot: [PROJECT_SNAPSHOT_2025-10-09.md](./PROJECT_SNAPSHOT_2025-10-09.md)
- Database schema: [COMPLETE_DATABASE_SCHEMA.md](./COMPLETE_DATABASE_SCHEMA.md)

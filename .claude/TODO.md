# Alpaca Deploy - Quick TODO

**Last Updated:** 2025-10-09

---

## 🔥 Priority Features

### 1. Dashboard - Multi-Strategy Tracking
- [x] Support multiple active strategies simultaneously ✅
- [x] Display holdings per strategy (virtual divisions) ✅
- [x] Show aggregate portfolio view ✅
- [ ] Add equity curve chart


### 2. Database Migration ✅ COMPLETE
- [x] Move strategies from JSON files to PostgreSQL ✅
- [x] Move variables to DB ✅
- [x] Move active strategies to DB ✅
- [x] Move batch jobs to DB ✅
- [x] Add multi-user isolation with user_id ✅

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
- [ ] Extend ticker hover metadata with historical coverage (first/last bar tracking)

### Strategy Management
- [x] Strategy library
- [ ] Share strategies between users
- [ ] Clone/fork existing strategies

### Backtesting

### QuantStats Integration
- [ ] make QS metrics available in all locations

### Platform
- [ ] Email notifications for rebalancing
- [ ] Dark mode

---

## 🐛 Known Issues

- [x] ~~Dashboard equity shows $0 (snapshots not working)~~ - Need to verify with live data
- [x] ~~Active strategy lost on server restart~~ - Fixed with DB persistence ✅
- [ ] No error handling for failed rebalances
- [x] ~~Credentials stored in localStorage (dev only)~~ - Now using Discord OAuth ✅

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

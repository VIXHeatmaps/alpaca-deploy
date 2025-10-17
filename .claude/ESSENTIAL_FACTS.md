# ESSENTIAL FACTS - NEVER FORGET

## Deployment Infrastructure

### Railway (Backend Infrastructure)
- **Backend API**: `alpaca-deploy` service
- **Indicator Service**: `happy-achievement` service (Python, port 8001)
- **Database**: PostgreSQL (Postgres service)
- **Cache**: Redis service

### Vercel (Frontend)
- **Frontend**: React application

---

## Critical Notes
- When user says something is ESSENTIAL, add it to this file
- **USER ONLY WORKS IN LIVE/PRODUCTION APP (Railway/Vercel) - NEVER LOCAL**
- All testing, bug reports, and feedback submissions happen on the live deployed app
- Local development environment is NOT used by the user
- Railway services are NOT the same as local development
- Local uses Docker for Redis/Postgres, Railway uses Railway-hosted services
- Environment variables must be set separately in Railway dashboard
- **Always define new terminology before using it** - e.g., explain what "verbosity" means before discussing logging changes

## Trading Window Constraints
- **We work during market close. We are NOT available during market hours.**
- The trading window and all trades happen while we're away from the computer
- All trading issues must be debugged the following day after trades have executed
- We cannot observe live order placement in real-time
- Comprehensive logging is critical for post-mortem debugging of deployment issues

## Batch Backtest Scale Requirements
- **User will run batches of 200k+ backtests eventually**
- These large batches will take many hours to complete
- System must be prepared for multi-hour batch jobs
- Railway log rate limit: 500 logs/sec (hit with just 260 backtests, dropped 695,084 messages)
- All architecture decisions must account for this massive scale

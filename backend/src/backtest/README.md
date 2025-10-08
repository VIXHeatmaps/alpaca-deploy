# Backtest Engine Structure

## Overview

This folder contains both the legacy and v2 backtest implementations, running in parallel during the migration period.

## Structure

```
backtest/
├── legacy/     # Legacy backtest system (currently kept inline in index.ts)
└── v2/         # New Redis-cached backtest system (under development)
    └── engine.ts
```

## Usage

Toggle between engines using the `USE_NEW_ENGINE` environment variable:

### Use Legacy Engine (default)
```bash
USE_NEW_ENGINE=false npm run dev
# or just:
npm run dev
```

### Use V2 Engine (testing)
```bash
USE_NEW_ENGINE=true npm run dev
```

## Migration Status

**Current:** Legacy engine is default and fully functional

**V2 Engine Status:** Stub implementation (returns mock data)

## Development

- **DO NOT modify legacy code** - it's frozen for fallback/comparison
- **All new development** happens in `v2/` folder
- Test frequently by toggling between engines
- Compare results between legacy and v2 to ensure correctness

## Removal Plan

Once V2 is verified and production-ready:
1. Make V2 the default (`USE_NEW_ENGINE=true`)
2. Monitor for 1 week
3. Remove legacy code entirely
4. Remove toggle mechanism
5. Promote v2 to main backtest system

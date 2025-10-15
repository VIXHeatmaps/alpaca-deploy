# Strategy Backtest Error - Debug Context

## Issue Summary

A complex strategy built in the builder UI appears to work correctly in the frontend, but when running a backtest, it reverts to the builder without displaying an equity curve or daily positions. An error message eventually appears.

## Error Message

```
Error: Sort "Sort1" branch sort:Sort2 missing indicator inputs for date 2020-01-02
```

## Context

### When This Occurred
- After completing a major DRY refactor of builder card components
- User built a large/complex strategy in the preview deployment
- UI appeared to work correctly throughout the building process
- Error only manifested when attempting to run backtest

### User Confirmation
- User confirmed: "refactor seems to work"
- This suggests the error may be **unrelated to the UI refactor**
- Error appears to be about **missing indicator data** on a specific date (2020-01-02)
- Error is backend/backtest logic, not frontend/UI issue

## Technical Details

### Error Analysis
- **Element:** Sort "Sort1"
- **Branch:** sort:Sort2
- **Issue:** Missing indicator inputs
- **Date:** 2020-01-02 (first trading day after New Year's Day 2020)
- **Error Type:** Data availability issue, not UI/validation issue

### Relevant Components

**Sort Card** - [frontend/src/components/builder/SortCard.tsx](frontend/src/components/builder/SortCard.tsx)
- Allows sorting universe by indicators
- Can have child sort elements (branches)
- Uses indicator inputs to determine sort order

**Strategy Structure** (from user's complex strategy):
- Contains nested Sort elements (Sort1 → Sort2)
- Sort2 is a branch/child of Sort1
- Sort2 requires indicator inputs that are missing for 2020-01-02

## Potential Root Causes

1. **Data Gap Issue**
   - Indicator data not available for 2020-01-02 (day after New Year's)
   - Market may have been closed or data not fetched for that date
   - Backend may not handle missing indicator data gracefully

2. **Dependency Chain Issue**
   - Sort2 depends on indicator calculations
   - Indicators may depend on earlier data
   - First trading day of year may not have sufficient lookback data

3. **Validation Gap**
   - Frontend validation may not catch this data availability issue
   - Backend validation happens during backtest execution
   - Error surfaces too late in the process

4. **Date Handling Issue**
   - Special handling needed for first trading day of year
   - Holiday/weekend date logic may have edge case
   - 2020-01-01 was New Year's Day (Wednesday), market closed
   - 2020-01-02 was first trading day of 2020

## Files to Review

### Frontend (UI/Validation)
- [frontend/src/components/builder/SortCard.tsx](frontend/src/components/builder/SortCard.tsx) - Sort card component
- [frontend/src/components/builder/GateCard.tsx](frontend/src/components/builder/GateCard.tsx) - Parent card that can contain Sort elements
- [frontend/src/utils/validation.ts](frontend/src/utils/validation.ts) - Validation logic

### Backend (Backtest Logic)
- Backend strategy execution engine (need to locate)
- Indicator calculation logic (need to locate)
- Sort element processing (need to locate)
- Date/data availability handling (need to locate)

**Note:** Backend file paths unknown - need to explore codebase to find:
- Backtest execution entry point
- Sort element handler
- Indicator data fetching/validation
- Date range handling for backtests

## Reproduction Steps

1. Build complex strategy with nested Sort elements in builder UI
2. Configure Sort elements to use indicator inputs
3. Attempt to run backtest
4. Observe: No equity curve displayed, returns to builder
5. Wait for error message to appear
6. Error appears: "Sort "Sort1" branch sort:Sort2 missing indicator inputs for date 2020-01-02"

## Questions to Answer

1. **Where is the backend backtest logic located?**
   - Need to find entry point for strategy execution
   - Need to find Sort element processing code

2. **How are indicator inputs fetched and validated?**
   - What happens when data is missing for a date?
   - Is there a fallback or error handling mechanism?

3. **Why doesn't frontend validation catch this?**
   - Should we add data availability checks before allowing backtest?
   - Should we validate date ranges against data availability?

4. **Is this specific to 2020-01-02 or a general issue?**
   - Does it happen on other first-trading-days-of-year?
   - Does it happen on other dates with potential data gaps?

5. **What is the expected behavior?**
   - Should backtest skip dates with missing data?
   - Should backtest fail with clear error message immediately?
   - Should frontend prevent backtests with insufficient data?

## Next Steps for New Chat

1. **Locate Backend Code**
   - Search for backtest execution entry point
   - Find Sort element processing logic
   - Identify indicator data fetching mechanism

2. **Understand Data Flow**
   - How does strategy JSON get sent to backend?
   - How does backend execute Sort elements?
   - How are indicator inputs resolved?

3. **Reproduce and Debug**
   - Understand the exact strategy structure that caused error
   - Trace execution path for Sort1 → Sort2
   - Identify why indicator data is missing for 2020-01-02

4. **Determine Fix Strategy**
   - Backend: Better error handling for missing indicator data
   - Frontend: Pre-flight validation for data availability
   - Both: Clearer error messages to user

## Related Context

### Recent Refactor (Completed - Merged to Main)
- DRY refactor of builder card components
- Split monolithic GateCard.tsx into separate files
- Created reusable TickerInput component
- All changes tested and confirmed working
- **This refactor is unrelated to the backtest error**

### Current Branch
- On `main` branch (refactor merged and pushed)
- No pending commits or uncommitted changes
- Production deployment should be up-to-date

### Technology Stack
- **Frontend:** React 19.1.1, TypeScript, Radix UI, Framer Motion
- **Backend:** (unknown - need to explore)
- **Deployment:** Vercel (frontend), Railway (backend likely)
- **Data:** Alpaca API for market data

## Screenshot Reference

User provided screenshot showing complex strategy with multiple nested elements including Sort1 and Sort2. Screenshot shows builder UI with the strategy successfully constructed, but backtest fails to execute.

---

**Priority:** High - Blocks user from testing complex strategies
**Complexity:** Medium - Backend debugging required
**Impact:** Affects all strategies using Sort elements with indicator inputs

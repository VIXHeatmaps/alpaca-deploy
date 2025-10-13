## Frontend Refactor Summary

### 1. Shared API Client & Data Hooks
- **Engineer Detail:** Introduced `frontend/src/api/client.ts` to centralize Axios configuration (base URL + `withCredentials`) and built reusable hooks for account, strategy, position, and snapshot data in `frontend/src/hooks/useAccountInfo.ts`, `frontend/src/hooks/useActiveStrategies.ts`, `frontend/src/hooks/usePositions.ts`, and `frontend/src/hooks/useStrategySnapshots.ts`. These hooks enforce typed responses via `frontend/src/types/alpaca.ts`, normalize backend payloads, and expose consistent loading/error state, while barrel-exporting through `frontend/src/hooks/index.ts` for ergonomic imports elsewhere.
- **Non-Coder Explainer:** We now have one shared toolkit that grabs brokerage data for every screen, making network calls faster to reuse and less error-prone when new UI needs them.

### 2. Modular Builder State & Overlays
- **Engineer Detail:** Refactored the strategy builder by extracting UI cards and modals into dedicated components (`frontend/src/components/builder/*.tsx`), moved type utilities to `frontend/src/types/builder.ts` and `frontend/src/utils/builder.ts`, and replaced the monolithic state in `frontend/src/components/VerticalUI2.tsx` with the `useBuilderState`, `useBatchJobs`, and `useVariableLists` hooks under `frontend/src/hooks/`. The builder now imports `GateCard`, `TickerCard`, `WeightCard`, and modal components from the `builder` barrel while delegating persistence and history management to the new hooks, shrinking inline logic and clarifying responsibilities.
- **Non-Coder Explainer:** The strategy editor was split into small building blocks and its memory handling got tidied up, so future updates are easier and the screen should feel snappier and more reliable.

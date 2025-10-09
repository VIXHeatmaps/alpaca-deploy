# Strategy Storage Analysis & Recommendations

## Current Implementation

### Frontend Storage (localStorage)
**Location:** [VerticalUI2.tsx:2249-2705](../frontend/src/components/VerticalUI2.tsx#L2249-L2705)

#### What's Stored:
```typescript
type StrategyTab = {
  id: string;                    // UUID
  elements: Element[];           // Strategy definition (gates, weights, tickers)
  history: Element[][];          // Undo/redo history
  historyIndex: number;          // Current position in history
  benchmarkSymbol: string;       // e.g., "SPY"
  startDate: string;             // e.g., "max" or "2020-01-01"
  endDate: string;               // e.g., "2024-12-31"
  backtestResults: any;          // Last backtest results (ephemeral)
  strategyName: string;          // User-given name
  versioningEnabled: boolean;    // Semantic versioning toggle
  version: {                     // Semantic version
    major: number;
    minor: number;
    patch: number;
    fork: string;                // e.g., "a", "b", "c"
  };
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
};
```

#### How It Works:
1. **Auto-save**: Every change to `strategyTabs` triggers localStorage save (line 2473-2479)
2. **Multiple tabs**: Array of strategies stored as `verticalUI2_strategy_tabs`
3. **Active tab**: ID stored separately as `verticalUI2_active_tab_id`
4. **Versioning**: Manual version bump functions (patch, minor, major, fork, reset)
5. **Export/Import**: JSON download/upload functionality exists

**Key localStorage Keys:**
- `verticalUI2_strategy_tabs` - Array of all strategy tabs
- `verticalUI2_active_tab_id` - Currently selected tab
- `verticalUI2_strategy_v2` - Individual strategy (used by versioning saves)

### Backend Storage (File System)
**Location:** [backend/src/storage/](../backend/src/storage/)

#### 1. Active Strategy ([activeStrategy.ts](../backend/src/storage/activeStrategy.ts))
- **Purpose**: Single live/paper trading strategy
- **Storage**: JSON file at `backend/data/activeStrategy.json`
- **What's stored**:
  - Strategy definition (flowData with nodes/edges)
  - Current holdings
  - Investment amount
  - Last rebalance timestamp
  - Pending orders

#### 2. Strategy Snapshots ([strategySnapshots.ts](../backend/src/storage/strategySnapshots.ts))
- **Purpose**: Daily equity tracking for active strategy
- **Storage**: JSON files at `backend/data/snapshots/{strategyId}.json`
- **What's stored**:
  - Daily portfolio values
  - Holdings with prices
  - Total return metrics
  - Rebalance type

**Problems with Current Backend Storage:**
- ❌ File-based (doesn't scale)
- ❌ Lost on server restart if file corrupted
- ❌ No versioning or history
- ❌ Only ONE active strategy at a time
- ❌ Different format than frontend (flowData vs elements)

### Database Schema (Already Defined)
**Location:** [COMPLETE_DATABASE_SCHEMA.md](./COMPLETE_DATABASE_SCHEMA.md#L51-L89)

The `strategies` table is **already defined** but not implemented:
```sql
CREATE TABLE strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),

  name VARCHAR(500) NOT NULL,
  description TEXT,
  elements JSONB NOT NULL DEFAULT '[]',

  benchmark_symbol VARCHAR(50) DEFAULT 'SPY',
  start_date DATE,
  end_date DATE,

  tags VARCHAR(255)[],
  is_public BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Redis Cache Analysis

**Finding:** There is **NO Redis cache** for strategies!

Redis is only used for:
1. **Indicator cache** ([indicatorCache.ts](../backend/src/backtest/v2/indicatorCache.ts)) - Technical indicator calculations
2. **Data cache** ([cacheService.ts](../backend/src/backtest/v2/cacheService.ts)) - Price bar data

Redis is **NOT** currently used for strategy storage at all.

---

## Arguments: Database vs localStorage vs Both

### Option 1: Database Only (Recommended ✅)

**Architecture:**
- Frontend: Remove localStorage auto-save
- Frontend: Add explicit "Save" button
- Backend: Store in PostgreSQL `strategies` table
- Keep localStorage for: Draft state only (unsaved changes)

**Pros:**
- ✅ **Single source of truth** - Database is authoritative
- ✅ **Cross-device sync** - Access strategies from anywhere
- ✅ **Multi-user support** - Ready for team features
- ✅ **Proper versioning** - Database can track full history
- ✅ **No data loss** - Survived browser cache clears
- ✅ **Search/filter** - Query by name, tags, date, etc.
- ✅ **Sharing** - `is_public` flag for community strategies
- ✅ **Backup/restore** - Standard DB backup tools
- ✅ **Scalability** - No localStorage 5-10MB limits
- ✅ **Analytics** - Track most used strategies, etc.
- ✅ **Cleaner UX** - Explicit save = user understands what's persisted

**Cons:**
- ⚠️ Requires network call to save (slight latency)
- ⚠️ Need offline handling (keep draft in localStorage)
- ⚠️ More complex: need save/load/conflict resolution

**User Flow:**
1. User builds strategy → Draft saved in localStorage (auto)
2. User clicks "Save" → POST to `/api/strategies`
3. Server returns strategy with ID
4. Frontend marks as "saved" (no unsaved changes)
5. User edits → Draft marked as "modified"
6. User clicks "Save" again → PUT to `/api/strategies/:id`

---

### Option 2: localStorage Only (Current, Not Scalable ❌)

**Pros:**
- ✅ Simple - no backend needed
- ✅ Fast - instant save
- ✅ Works offline

**Cons:**
- ❌ Lost on cache clear
- ❌ Can't share across devices
- ❌ Can't share with other users
- ❌ No backup/restore
- ❌ 5-10MB storage limit
- ❌ No query/search capabilities
- ❌ No multi-user support

**Verdict:** Not viable for production app

---

### Option 3: Both (Cache + Database)

**Architecture:**
- localStorage: Write-through cache for recent strategies
- Database: Authoritative source
- Sync: Background sync or explicit save

**Pros:**
- ✅ Fast reads (from cache)
- ✅ Works offline (reads)
- ✅ Persistent (database)

**Cons:**
- ❌ **Complexity**: Cache invalidation is hard
- ❌ **Sync conflicts**: What if cache and DB diverge?
- ❌ **Stale data**: Cache might show old version
- ❌ **More code**: Need sync logic, conflict resolution
- ❌ **Confusing UX**: When does save actually happen?
- ❌ **Not needed**: Strategy building is not high-frequency

**Verdict:** Over-engineered for this use case

---

### Option 4: Database + Draft State (Recommended Hybrid ✨)

**Architecture:**
- **Database**: All saved strategies
- **localStorage**: ONLY unsaved draft of current strategy
- **Clear distinction**: Saved vs Draft

**How it works:**
1. User opens saved strategy → Load from DB into state
2. User edits → State changes, draft saved to localStorage
3. User sees "Unsaved changes" indicator
4. User clicks "Save" → POST/PUT to DB
5. On successful save → Clear draft from localStorage
6. On browser refresh → Prompt: "You have unsaved changes. Load draft or discard?"

**Pros:**
- ✅ **Best of both worlds**: Fast editing + reliable persistence
- ✅ **Clear UX**: User knows when saved vs unsaved
- ✅ **Offline editing**: Can build strategies offline
- ✅ **No sync issues**: Draft is temporary, DB is truth
- ✅ **Simple**: No complex cache invalidation
- ✅ **Recoverable**: Crash recovery from draft
- ✅ **Familiar pattern**: Like Google Docs, VS Code, etc.

**Cons:**
- ⚠️ Slightly more code than pure DB
- ⚠️ Need conflict detection if user opens same strategy on two devices

**Draft localStorage structure:**
```typescript
// Only store the CURRENT draft being edited
const draft = {
  strategyId: number | null,  // null = new strategy
  lastSaved: string | null,   // timestamp of last DB save
  elements: Element[],        // current state
  benchmarkSymbol: string,
  startDate: string,
  endDate: string,
  strategyName: string,
};
localStorage.setItem('strategy_draft', JSON.stringify(draft));
```

---

## Recommendation: Option 4 (Database + Draft State)

### Why This is Best:

1. **User Expectations**: Users expect explicit save (like every other app)
2. **Data Safety**: Database ensures no data loss
3. **Scalability**: Ready for multi-user, sharing, templates
4. **Performance**: Draft state keeps editing fast
5. **Simplicity**: Clear separation of concerns

### Implementation Strategy:

#### Phase 1: Add Save Functionality (No Breaking Changes)
- Keep current localStorage auto-save
- Add new "Save to Library" button
- Add API endpoints for strategies CRUD
- Strategies appear in Library alongside Variables/Batch Tests
- Users can load saved strategies into tabs

#### Phase 2: Migrate to Draft State
- Change localStorage to only store draft
- Add "unsaved changes" indicator
- Add "Load Draft" prompt on startup
- Remove multi-tab localStorage (tabs become ephemeral)

#### Phase 3: Enhanced Features
- Strategy library with search/filter
- Strategy templates
- Public strategy sharing
- Version history (via database snapshots)

---

## Database vs Redis Cache?

**Should we use Redis for strategies?**

**No.** Here's why:

### Redis is Good For:
- ✅ **Ephemeral data**: Session state, API rate limits
- ✅ **High-frequency reads**: Prices, indicator calculations
- ✅ **Expiring data**: Cache with TTL
- ✅ **Pub/sub**: Real-time updates

### Strategies Are NOT:
- ❌ Ephemeral (need permanent storage)
- ❌ High-frequency (edit once, save occasionally)
- ❌ Expiring (keep forever)
- ❌ Real-time (no need for pub/sub)

### Current Redis Usage (Correct):
```typescript
// backend/src/backtest/v2/indicatorCache.ts
// Caches indicator calculations (RSI, SMA, etc.)
// TTL: Cleared at 4pm/8pm ET daily
// Perfect use case: Avoid re-calculating same indicators
```

**Verdict:** Keep Redis for indicator/price caching only. Use PostgreSQL for strategies.

---

## Summary Table

| Feature | localStorage Only | Database Only | Both (Cache) | **DB + Draft** |
|---------|------------------|---------------|--------------|----------------|
| Persistence | ❌ Lost on clear | ✅ Permanent | ✅ Permanent | ✅ Permanent |
| Cross-device | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| Offline work | ✅ Yes | ❌ No | ⚠️ Complex | ✅ Yes (draft) |
| Speed | ✅ Instant | ⚠️ Network | ✅ Fast reads | ✅ Fast edits |
| Sharing | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| Complexity | ✅ Simple | ✅ Simple | ❌ High | ⚠️ Medium |
| UX clarity | ⚠️ Auto-save | ✅ Explicit | ❌ Confusing | ✅ Clear |
| Multi-user | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Score** | 3/8 | 6/8 | 5/8 | **8/8** |

---

## Next Steps

1. **Design UI/UX** for:
   - Save button placement
   - "Unsaved changes" indicator
   - Draft recovery prompt
   - Strategy library view

2. **Create migration** for strategies table

3. **Build API endpoints**:
   - `GET /api/strategies` - List user's strategies
   - `POST /api/strategies` - Create new strategy
   - `GET /api/strategies/:id` - Get strategy
   - `PUT /api/strategies/:id` - Update strategy
   - `DELETE /api/strategies/:id` - Delete strategy

4. **Update frontend**:
   - Add save/load logic
   - Add draft state management
   - Add unsaved changes tracking
   - Add strategy library UI

5. **Migration path**:
   - Provide "Import from localStorage" button
   - Bulk import existing strategies
   - Clear localStorage after import

---

## Open Questions

1. **Version history**: Store as separate rows or JSONB column?
2. **Forking**: Copy strategy or reference original?
3. **Templates**: Separate table or flag in strategies?
4. **Tags**: Free text or predefined categories?
5. **Permissions**: Owner-only or team access?
6. **Soft delete**: Archive vs hard delete?

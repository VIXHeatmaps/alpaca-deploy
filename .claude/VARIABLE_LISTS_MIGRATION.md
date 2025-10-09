# Variable Lists Database Migration

## Summary

Successfully migrated variable lists from localStorage to PostgreSQL database with automatic migration support.

## What Was Done

### 1. Database Setup

#### Migrations Created:
- **[20251009000000_create_updated_at_function.ts](../backend/src/db/migrations/20251009000000_create_updated_at_function.ts)**: Creates the `update_updated_at_column()` trigger function
- **[20251009000002_create_variable_lists.ts](../backend/src/db/migrations/20251009000002_create_variable_lists.ts)**: Creates the `variable_lists` table

#### Table Schema:
```sql
CREATE TABLE variable_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,  -- 'ticker', 'number', 'date'
  values JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 2. Backend Service Layer

Created [variableListsDb.ts](../backend/src/db/variableListsDb.ts) with full CRUD operations:
- `createVariableList()`
- `getVariableListById()`
- `getVariableListByName()`
- `getAllVariableLists()`
- `updateVariableList()`
- `deleteVariableList()`
- `variableListNameExists()`
- `bulkImportVariableLists()` - for migration

### 3. API Endpoints

Added to [index.ts](../backend/src/index.ts:2755-2927):
- `GET /api/variables` - List all variable lists (with optional filters)
- `GET /api/variables/:id` - Get single variable list
- `POST /api/variables` - Create new variable list
- `PUT /api/variables/:id` - Update variable list
- `DELETE /api/variables/:id` - Delete variable list
- `POST /api/variables/bulk_import` - Bulk import (for migration)

### 4. Frontend Updates

#### API Client
Created [variables.ts](../frontend/src/api/variables.ts) with typed API client for all endpoints.

#### Migration Helpers
Updated [variables.ts](../frontend/src/types/variables.ts) with:
- `hasBeenMigrated()` - Check if migration completed
- `markAsMigrated()` - Mark migration as done
- `clearLocalStorage()` - Clean up after migration

#### UI Component
Updated [VariablesTab.tsx](../frontend/src/components/VariablesTab.tsx) to:
- Load from database on mount
- Auto-migrate from localStorage on first load
- Show loading/migrating states
- Display error messages
- Use API for all CRUD operations
- Added type selector UI

## Testing Results

All endpoints tested and working:

```bash
# Create
curl -X POST http://localhost:4000/api/variables \
  -H "Content-Type: application/json" \
  -d '{"name":"test_ticker","type":"ticker","values":["AAPL","MSFT","GOOGL"]}'
# ✓ Created with id=1

# Read all
curl http://localhost:4000/api/variables
# ✓ Returns array of variable lists

# Update
curl -X PUT http://localhost:4000/api/variables/1 \
  -H "Content-Type: application/json" \
  -d '{"values":["AAPL","MSFT","GOOGL","TSLA"]}'
# ✓ Updated successfully

# Bulk import
curl -X POST http://localhost:4000/api/variables/bulk_import \
  -H "Content-Type: application/json" \
  -d '{"lists":[{"name":"periods","type":"number","values":["10","14","20"]}]}'
# ✓ Imported 2 lists

# Delete
curl -X DELETE http://localhost:4000/api/variables/3
# ✓ Deleted successfully
```

## Migration Flow

1. User opens Variables tab
2. Frontend checks `localStorage.getItem("vars_migrated_to_db")`
3. If not migrated and localStorage has variables:
   - Show "Migrating variables from localStorage..." message
   - Call `POST /api/variables/bulk_import` with all variables
   - Mark as migrated in localStorage
   - Clear old localStorage data
4. If migrated or no local variables:
   - Load from database via `GET /api/variables`
5. All CRUD operations now use API instead of localStorage

## Benefits

1. **Persistence**: Variables survive browser cache clears
2. **Sharing**: Foundation for sharing variables between users (via `is_shared` flag)
3. **Queryability**: Can filter by type, search by name, etc.
4. **Scalability**: No localStorage size limits
5. **Backward Compatible**: Auto-migrates existing localStorage data
6. **Graceful Degradation**: Falls back to localStorage if migration fails

## Files Changed

### Backend
- [backend/src/db/migrations/20251009000000_create_updated_at_function.ts](../backend/src/db/migrations/20251009000000_create_updated_at_function.ts) (new)
- [backend/src/db/migrations/20251009000002_create_variable_lists.ts](../backend/src/db/migrations/20251009000002_create_variable_lists.ts) (new)
- [backend/src/db/variableListsDb.ts](../backend/src/db/variableListsDb.ts) (new)
- [backend/src/index.ts](../backend/src/index.ts) (updated)

### Frontend
- [frontend/src/api/variables.ts](../frontend/src/api/variables.ts) (new)
- [frontend/src/types/variables.ts](../frontend/src/types/variables.ts) (updated)
- [frontend/src/components/VariablesTab.tsx](../frontend/src/components/VariablesTab.tsx) (updated)

## Next Steps

Future enhancements could include:
1. User-specific variables (add `user_id` foreign key)
2. Shared variable libraries
3. Version history for variables
4. Import/export to CSV
5. Variable templates
6. Search and filtering UI

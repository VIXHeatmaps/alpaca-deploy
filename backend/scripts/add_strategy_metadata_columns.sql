-- Add metadata columns to strategies table
-- Run this with: psql $DATABASE_URL -f add_strategy_metadata_columns.sql

-- Add note column (short description)
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS note TEXT;

-- Add description column (long-form markdown)
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add deployed_at timestamp
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP;

-- Add liquidated_at timestamp
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS liquidated_at TIMESTAMP;

-- Add name_bar_expanded UI state
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS name_bar_expanded BOOLEAN DEFAULT false;

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'strategies'
AND column_name IN ('note', 'description', 'deployed_at', 'liquidated_at', 'name_bar_expanded')
ORDER BY column_name;

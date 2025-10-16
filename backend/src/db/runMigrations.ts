import db from './connection';

export async function runMigrations(): Promise<void> {
  try {
    console.log('[MIGRATIONS] Checking for missing columns...');

    // Check if status column exists on strategies table
    const statusColumnExists = await db.raw(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='strategies' AND column_name='status'
    `);

    if (statusColumnExists.rows.length === 0) {
      console.log('[MIGRATIONS] Adding status column to strategies table...');
      await db.raw(`
        ALTER TABLE strategies
        ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
      `);
      await db.raw(`
        CREATE INDEX idx_strategies_status ON strategies(status)
      `);
      console.log('[MIGRATIONS] ✓ Status column added successfully');
    } else {
      console.log('[MIGRATIONS] ✓ Status column already exists');
    }
  } catch (error: any) {
    console.error('[MIGRATIONS] ✗ Migration failed:', error.message);
    // Don't throw - allow server to start even if migration fails
  }
}

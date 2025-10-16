import db from './connection';

export async function runMigrations(): Promise<void> {
  try {
    console.log('[MIGRATIONS] Running database migrations...');

    // In production, fix migration records that reference .ts files to use .js
    if (process.env.NODE_ENV === 'production') {
      console.log('[MIGRATIONS] Fixing migration file extensions for production...');
      await db.raw(`
        UPDATE knex_migrations
        SET name = REPLACE(name, '.ts', '.js')
        WHERE name LIKE '%.ts'
      `);
    }

    const [batchNo, log] = await db.migrate.latest();

    if (log.length === 0) {
      console.log('[MIGRATIONS] ✓ Database is up to date');
    } else {
      console.log(`[MIGRATIONS] ✓ Batch ${batchNo} completed: ${log.length} migration(s)`);
      log.forEach((migration: string) => console.log(`[MIGRATIONS]   - ${migration}`));
    }
  } catch (error: any) {
    console.error('[MIGRATIONS] ✗ Migration failed:', error.message);
    throw error;
  }
}

import db from './connection';

export async function runMigrations(): Promise<void> {
  try {
    console.log('[MIGRATIONS] Running database migrations...');
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

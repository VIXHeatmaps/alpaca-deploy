const knex = require('knex');
const path = require('path');

async function runMigrations() {
  // Find the correct migrations directory
  // When running from project root or Railway, migrations are in dist/db/migrations
  const migrationsDir = path.join(process.cwd(), 'dist', 'db', 'migrations');

  console.log('Migrations directory:', migrationsDir);
  console.log('Database URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Not set ✗');

  const db = knex({
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      tableName: 'knex_migrations',
      directory: migrationsDir,
      extension: 'js',
    },
  });

  try {
    console.log('Running migrations...');
    const [batchNo, log] = await db.migrate.latest();

    if (log.length === 0) {
      console.log('✓ Already up to date');
    } else {
      console.log(`✓ Batch ${batchNo} run: ${log.length} migrations`);
      log.forEach(migration => console.log(`  - ${migration}`));
    }

    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigrations();

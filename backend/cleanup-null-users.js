// Cleanup script to remove data with NULL user_id
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

async function cleanup() {
  console.log('Checking for data with user_id = NULL...\n');

  // Check variable_lists
  const variables = await db('variable_lists').whereNull('user_id');
  console.log(`Found ${variables.length} variable_lists with NULL user_id:`);
  variables.forEach(v => console.log(`  - ${v.name} (id: ${v.id})`));

  // Check strategies
  const strategies = await db('strategies').whereNull('user_id');
  console.log(`\nFound ${strategies.length} strategies with NULL user_id:`);
  strategies.forEach(s => console.log(`  - ${s.name} (id: ${s.id})`));

  // Check batch_jobs
  const batches = await db('batch_jobs').whereNull('user_id');
  console.log(`\nFound ${batches.length} batch_jobs with NULL user_id`);

  // Check active_strategies
  const active = await db('active_strategies').whereNull('user_id');
  console.log(`Found ${active.length} active_strategies with NULL user_id\n`);

  // Delete them
  console.log('Deleting NULL user_id records...');
  await db('variable_lists').whereNull('user_id').del();
  await db('strategies').whereNull('user_id').del();
  await db('batch_jobs').whereNull('user_id').del();
  await db('active_strategies').whereNull('user_id').del();

  console.log('✓ Cleanup complete!');
  await db.destroy();
}

cleanup().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

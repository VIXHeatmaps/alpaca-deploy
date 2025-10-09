// Check all variables in production
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

async function check() {
  const variables = await db('variable_lists').select('*');
  console.log(`Total variable_lists: ${variables.length}\n`);

  variables.forEach(v => {
    console.log(`- ${v.name} (type: ${v.type}, user_id: ${v.user_id || 'NULL'})`);
  });

  await db.destroy();
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

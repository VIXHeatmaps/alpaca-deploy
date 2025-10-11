/**
 * Ensure required tables exist (bypass Knex migrations for simple tables)
 */

import db from './connection';

export async function ensureFeedbackTable() {
  const exists = await db.schema.hasTable('feedback');

  if (!exists) {
    console.log('[DB] Creating feedback table...');
    await db.schema.createTable('feedback', (table) => {
      table.uuid('id').primary();
      table.string('type').notNullable();
      table.string('title').notNullable();
      table.text('description');
      table.string('screenshot');
      table.string('user_id');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index('type');
      table.index('created_at');
      table.index('user_id');
    });
    console.log('[DB] ✓ Feedback table created');
  }
}

export async function ensureAllTables() {
  try {
    await ensureFeedbackTable();
  } catch (err: any) {
    console.error('[DB] Error ensuring tables:', err.message);
  }
}

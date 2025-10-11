import type { Knex } from "knex";

/**
 * Migration: Create feedback table for bug reports and feature requests
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('feedback', (table) => {
    table.uuid('id').primary();
    table.string('type').notNullable(); // 'bug' or 'feature'
    table.string('title').notNullable();
    table.text('description');
    table.string('screenshot'); // filename
    table.string('user_id');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('type');
    table.index('created_at');
    table.index('user_id');
  });

  console.log('✓ Created feedback table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('feedback');
  console.log('✓ Dropped feedback table');
}

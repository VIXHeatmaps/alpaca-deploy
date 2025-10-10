import type { Knex } from "knex";

/**
 * Make user_id columns NOT NULL to prevent accidental data without ownership.
 * This ensures all new data MUST have a user_id, preventing orphaned records.
 *
 * WARNING: This migration previously deleted NULL user_id records which caused
 * production data loss on 2025-10-10. Modified to fail safely instead.
 */
export async function up(knex: Knex): Promise<void> {
  // Check for NULL user_id records and FAIL if found (don't delete!)
  const nullStrategies = await knex('strategies').whereNull('user_id').count('* as count').first();
  const nullVariables = await knex('variable_lists').whereNull('user_id').count('* as count').first();
  const nullBatches = await knex('batch_jobs').whereNull('user_id').count('* as count').first();
  const nullActive = await knex('active_strategies').whereNull('user_id').count('* as count').first();

  const hasNulls =
    (nullStrategies?.count as number) > 0 ||
    (nullVariables?.count as number) > 0 ||
    (nullBatches?.count as number) > 0 ||
    (nullActive?.count as number) > 0;

  if (hasNulls) {
    throw new Error(
      `Cannot add NOT NULL constraint - found records with NULL user_id:\n` +
      `  strategies: ${nullStrategies?.count}\n` +
      `  variable_lists: ${nullVariables?.count}\n` +
      `  batch_jobs: ${nullBatches?.count}\n` +
      `  active_strategies: ${nullActive?.count}\n\n` +
      `Manual action required: Update NULL user_ids before running this migration.`
    );
  }

  // Make user_id NOT NULL
  await knex.schema.alterTable('strategies', (table) => {
    table.string('user_id').notNullable().alter();
  });

  await knex.schema.alterTable('variable_lists', (table) => {
    table.string('user_id').notNullable().alter();
  });

  await knex.schema.alterTable('batch_jobs', (table) => {
    table.string('user_id').notNullable().alter();
  });

  await knex.schema.alterTable('active_strategies', (table) => {
    table.string('user_id').notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revert to nullable
  await knex.schema.alterTable('strategies', (table) => {
    table.string('user_id').nullable().alter();
  });

  await knex.schema.alterTable('variable_lists', (table) => {
    table.string('user_id').nullable().alter();
  });

  await knex.schema.alterTable('batch_jobs', (table) => {
    table.string('user_id').nullable().alter();
  });

  await knex.schema.alterTable('active_strategies', (table) => {
    table.string('user_id').nullable().alter();
  });
}


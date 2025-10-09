import type { Knex } from "knex";

/**
 * Make user_id columns NOT NULL to prevent accidental data without ownership.
 * This ensures all new data MUST have a user_id, preventing orphaned records.
 */
export async function up(knex: Knex): Promise<void> {
  // First, delete any remaining NULL user_id records (there shouldn't be any in production now)
  await knex('strategies').whereNull('user_id').del();
  await knex('variable_lists').whereNull('user_id').del();
  await knex('batch_jobs').whereNull('user_id').del();
  await knex('active_strategies').whereNull('user_id').del();

  // Then make user_id NOT NULL
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


import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add user_id to strategies table
  await knex.schema.alterTable('strategies', (table) => {
    table.string('user_id').nullable();
    table.index('user_id');
  });

  // Add user_id to variable_lists table
  await knex.schema.alterTable('variable_lists', (table) => {
    table.string('user_id').nullable();
    table.index('user_id');
  });

  // Add user_id to batch_jobs table
  await knex.schema.alterTable('batch_jobs', (table) => {
    table.string('user_id').nullable();
    table.index('user_id');
  });

  // Add user_id to active_strategies table
  await knex.schema.alterTable('active_strategies', (table) => {
    table.string('user_id').nullable();
    table.index('user_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('strategies', (table) => {
    table.dropColumn('user_id');
  });

  await knex.schema.alterTable('variable_lists', (table) => {
    table.dropColumn('user_id');
  });

  await knex.schema.alterTable('batch_jobs', (table) => {
    table.dropColumn('user_id');
  });

  await knex.schema.alterTable('active_strategies', (table) => {
    table.dropColumn('user_id');
  });
}

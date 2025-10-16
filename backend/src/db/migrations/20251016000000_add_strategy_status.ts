import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add status column to strategies table
  await knex.schema.alterTable('strategies', (table) => {
    table.enum('status', ['DRAFT', 'LIVE', 'LIQUIDATED']).notNullable().defaultTo('DRAFT');
    table.index('status', 'idx_strategies_status');
  });

  console.log('✓ Added status column to strategies table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('strategies', (table) => {
    table.dropIndex('status', 'idx_strategies_status');
    table.dropColumn('status');
  });

  console.log('✓ Removed status column from strategies table');
}

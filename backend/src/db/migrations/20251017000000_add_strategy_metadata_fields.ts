import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('strategies', (table) => {
    // Rich metadata fields
    table.text('note').nullable(); // Short description (single line)
    table.text('description').nullable(); // Long-form markdown description

    // Timestamp fields
    table.timestamp('deployed_at').nullable(); // When went LIVE
    table.timestamp('liquidated_at').nullable(); // When liquidated

    // UI state persistence
    table.boolean('name_bar_expanded').defaultTo(false); // Remember expand/collapse state
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('strategies', (table) => {
    table.dropColumn('note');
    table.dropColumn('description');
    table.dropColumn('deployed_at');
    table.dropColumn('liquidated_at');
    table.dropColumn('name_bar_expanded');
  });
}

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create variable_lists table
  await knex.schema.createTable('variable_lists', (table) => {
    // Primary key
    table.increments('id').primary();

    // Variable definition
    table.string('name', 255).notNullable();
    table.string('type', 50).notNullable(); // 'ticker', 'number', 'date'

    // Values (stored as JSONB array)
    table.jsonb('values').notNullable().defaultTo('[]');

    // Metadata
    table.text('description').nullable();
    table.boolean('is_shared').defaultTo(false);

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('name', 'idx_variable_lists_name');
    table.index('created_at', 'idx_variable_lists_created_at');
  });

  // Create trigger for auto-updating updated_at
  await knex.raw(`
    CREATE TRIGGER update_variable_lists_updated_at
    BEFORE UPDATE ON variable_lists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✓ Created variable_lists table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('variable_lists');
  console.log('✓ Dropped variable_lists table');
}

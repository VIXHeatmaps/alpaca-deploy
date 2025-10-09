import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create strategies table
  await knex.schema.createTable('strategies', (table) => {
    // Primary key
    table.increments('id').primary();

    // Strategy name and version info
    table.string('name', 500).notNullable();
    table.boolean('versioning_enabled').notNullable().defaultTo(false);
    table.integer('version_major').notNullable().defaultTo(0);
    table.integer('version_minor').notNullable().defaultTo(0);
    table.integer('version_patch').notNullable().defaultTo(1);
    table.string('version_fork', 10).notNullable().defaultTo('');

    // Strategy definition (JSON) - the entire element tree
    table.jsonb('elements').notNullable();

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('name', 'idx_strategies_name');
    table.index('created_at', 'idx_strategies_created_at');
    table.index('updated_at', 'idx_strategies_updated_at');
  });

  // Add trigger to automatically update updated_at timestamp
  await knex.raw(`
    CREATE TRIGGER update_strategies_updated_at
    BEFORE UPDATE ON strategies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✓ Created strategies table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS update_strategies_updated_at ON strategies');
  await knex.schema.dropTableIfExists('strategies');
  console.log('✓ Dropped strategies table');
}

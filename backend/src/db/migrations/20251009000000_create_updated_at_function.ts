import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create the update_updated_at_column function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  console.log('✓ Created update_updated_at_column() function');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
  console.log('✓ Dropped update_updated_at_column() function');
}

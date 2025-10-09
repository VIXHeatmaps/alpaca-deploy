import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create active_strategies table
  await knex.schema.createTable('active_strategies', (table) => {
    // Primary key
    table.increments('id').primary();

    // Strategy reference
    table.integer('strategy_id').nullable().references('id').inTable('strategies').onDelete('SET NULL');

    // Strategy metadata (denormalized for fast access)
    table.string('name', 500).notNullable();
    table.jsonb('flow_data').notNullable(); // Snapshot of strategy flow at deployment

    // Execution mode
    table.string('mode', 50).notNullable().defaultTo('paper'); // 'paper' or 'live'

    // Status
    table.string('status', 50).notNullable().defaultTo('active'); // 'active', 'paused', 'stopped'

    // Capital allocation
    table.decimal('initial_capital', 15, 2).notNullable();
    table.decimal('current_capital', 15, 2).nullable();

    // Portfolio attribution (for multi-strategy support)
    // Tracks what % of account positions belong to this strategy
    table.jsonb('position_attribution').nullable();
    // Example: { "GLD": { "qty": 10.5, "allocation_pct": 0.35 }, "SPY": { "qty": 5.2, "allocation_pct": 0.20 } }

    // Holdings snapshot (denormalized for quick dashboard access)
    table.jsonb('holdings').notNullable().defaultTo('[]');
    // Example: [{ "symbol": "GLD", "qty": 10.5, "entry_price": 180.50 }]

    // Pending orders (awaiting market open)
    table.jsonb('pending_orders').nullable();

    // Timestamps
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('stopped_at').nullable();
    table.timestamp('last_rebalance_at').nullable();

    // Rebalancing schedule
    table.string('rebalance_frequency', 50).defaultTo('daily'); // 'daily', 'weekly', 'monthly'
    table.time('rebalance_time').defaultTo('15:50:00'); // T-10 default (3:50 PM ET)

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('strategy_id', 'idx_active_strategies_strategy_id');
    table.index('status', 'idx_active_strategies_status');
    table.index('started_at', 'idx_active_strategies_started_at');
  });

  // Add trigger to automatically update updated_at timestamp
  await knex.raw(`
    CREATE TRIGGER update_active_strategies_updated_at
    BEFORE UPDATE ON active_strategies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✓ Created active_strategies table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS update_active_strategies_updated_at ON active_strategies');
  await knex.schema.dropTableIfExists('active_strategies');
  console.log('✓ Dropped active_strategies table');
}

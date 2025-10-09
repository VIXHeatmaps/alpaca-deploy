import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create active_strategy_snapshots table
  await knex.schema.createTable('active_strategy_snapshots', (table) => {
    // Primary key
    table.increments('id').primary();

    // Foreign key to active strategy
    table.integer('active_strategy_id').notNullable()
      .references('id').inTable('active_strategies').onDelete('CASCADE');

    // Snapshot data
    table.date('snapshot_date').notNullable();
    table.decimal('equity', 15, 2).notNullable(); // Portfolio value at snapshot

    // Holdings at this snapshot
    // Example: [{"symbol": "SPY", "qty": 10, "price": 450.25, "value": 4502.50}, ...]
    table.jsonb('holdings').nullable();

    // Daily metrics
    table.decimal('daily_return', 10, 6).nullable(); // Daily % return
    table.decimal('cumulative_return', 10, 6).nullable(); // Total % return since inception

    // Total return in dollars
    table.decimal('total_return', 15, 2).nullable(); // equity - initial_capital

    // Rebalance metadata
    table.string('rebalance_type', 50).nullable(); // 'initial', 'daily', 'liquidation'

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Constraints
    table.unique(['active_strategy_id', 'snapshot_date'], {
      indexName: 'unique_active_strategy_snapshot_date'
    });

    // Indexes
    table.index('active_strategy_id', 'idx_active_strategy_snapshots_strategy_id');
    table.index('snapshot_date', 'idx_active_strategy_snapshots_date');
  });

  console.log('✓ Created active_strategy_snapshots table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('active_strategy_snapshots');
  console.log('✓ Dropped active_strategy_snapshots table');
}

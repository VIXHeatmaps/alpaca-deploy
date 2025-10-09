import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create batch_jobs table
  await knex.schema.createTable('batch_jobs', (table) => {
    // Primary key
    table.string('id', 255).primary();

    // Job metadata
    table.string('name', 500).notNullable();
    table.string('kind', 50).notNullable().defaultTo('server');
    table.string('status', 50).notNullable();

    // Progress tracking
    table.integer('total').notNullable().defaultTo(0);
    table.integer('completed').notNullable().defaultTo(0);

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();

    // Error tracking
    table.text('error').nullable();
    table.boolean('truncated').notNullable().defaultTo(false);

    // Variable definitions (JSON)
    table.jsonb('variables').notNullable().defaultTo('[]');

    // Strategy definition (JSON)
    table.jsonb('strategy_elements').notNullable();

    // Backtest configuration
    table.date('start_date').nullable();
    table.date('end_date').nullable();
    table.string('benchmark_symbol', 50).nullable();

    // Assignment preview (JSON - first 25 assignments)
    table.jsonb('assignments_preview').nullable();

    // Results summary (JSON)
    table.jsonb('summary').nullable();

    // Indexes
    table.index('status', 'idx_batch_jobs_status');
    table.index('created_at', 'idx_batch_jobs_created_at');
    table.index('kind', 'idx_batch_jobs_kind');
  });

  // Create batch_job_runs table
  await knex.schema.createTable('batch_job_runs', (table) => {
    table.increments('id').primary();
    table.string('batch_job_id', 255).notNullable()
      .references('id').inTable('batch_jobs').onDelete('CASCADE');

    // Run identification
    table.integer('run_index').notNullable();

    // Variable assignments for this run (JSON)
    table.jsonb('variables').notNullable();

    // Metrics for this run (JSON)
    table.jsonb('metrics').notNullable();

    // Timestamp
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint
    table.unique(['batch_job_id', 'run_index']);

    // Indexes
    table.index('batch_job_id', 'idx_batch_job_runs_batch_job_id');
  });

  console.log('✓ Created batch_jobs and batch_job_runs tables');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('batch_job_runs');
  await knex.schema.dropTableIfExists('batch_jobs');
  console.log('✓ Dropped batch_jobs and batch_job_runs tables');
}

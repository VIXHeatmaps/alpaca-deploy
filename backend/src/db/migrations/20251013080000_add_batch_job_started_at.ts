import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("batch_jobs", (table) => {
    table.timestamp("started_at").nullable();
  });

  // Backfill existing finished jobs so duration math has a baseline
  await knex("batch_jobs")
    .whereNotNull("completed_at")
    .update({
      started_at: knex.raw("COALESCE(started_at, created_at)"),
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("batch_jobs", (table) => {
    table.dropColumn("started_at");
  });
}

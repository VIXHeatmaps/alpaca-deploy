/**
 * Database service for batch jobs
 *
 * Provides CRUD operations for batch_jobs and batch_job_runs tables.
 */

import db from './connection';

export type BatchJobStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface BatchJobDb {
  id: string;
  name: string;
  kind: 'server' | 'local';
  status: BatchJobStatus;
  total: number;
  completed: number;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  error: string | null;
  truncated: boolean;
  variables: any; // JSONB
  strategy_elements: any; // JSONB
  start_date: string | null;
  end_date: string | null;
  benchmark_symbol: string | null;
  assignments_preview: any; // JSONB
  summary: any; // JSONB
}

export interface BatchJobRunDb {
  id: number;
  batch_job_id: string;
  run_index: number;
  variables: any; // JSONB
  metrics: any; // JSONB
  created_at: Date;
}

/**
 * Create a new batch job
 */
export async function createBatchJob(job: Omit<BatchJobDb, 'created_at' | 'updated_at'>): Promise<BatchJobDb> {
  // Manually stringify JSONB fields for pg driver
  const jobData: any = { ...job };
  jobData.variables = JSON.stringify(job.variables);
  jobData.strategy_elements = JSON.stringify(job.strategy_elements);
  jobData.assignments_preview = JSON.stringify(job.assignments_preview);
  jobData.summary = job.summary ? JSON.stringify(job.summary) : null;

  const [created] = await db('batch_jobs')
    .insert(jobData)
    .returning('*');

  // pg driver returns JSONB as strings, parse them back
  if (typeof created.variables === 'string') created.variables = JSON.parse(created.variables);
  if (typeof created.strategy_elements === 'string') created.strategy_elements = JSON.parse(created.strategy_elements);
  if (typeof created.assignments_preview === 'string') created.assignments_preview = JSON.parse(created.assignments_preview);
  if (created.summary && typeof created.summary === 'string') created.summary = JSON.parse(created.summary);

  return created;
}

/**
 * Get batch job by ID
 */
export async function getBatchJobById(id: string): Promise<BatchJobDb | null> {
  const job = await db('batch_jobs').where({ id }).first();
  return job || null;
}

/**
 * Get all batch jobs (with optional filters)
 */
export async function getAllBatchJobs(filters?: {
  status?: BatchJobStatus;
  limit?: number;
}): Promise<BatchJobDb[]> {
  let query = db('batch_jobs').orderBy('created_at', 'desc');

  if (filters?.status) {
    query = query.where({ status: filters.status });
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  return query;
}

/**
 * Get all batch jobs for a specific user (with optional filters)
 */
export async function getBatchJobsByUserId(
  userId: string,
  filters?: {
    status?: BatchJobStatus;
    limit?: number;
  }
): Promise<BatchJobDb[]> {
  let query = db('batch_jobs')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc');

  if (filters?.status) {
    query = query.where({ status: filters.status });
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  return query;
}

/**
 * Update batch job
 */
export async function updateBatchJob(
  id: string,
  updates: Partial<Omit<BatchJobDb, 'id' | 'created_at'>>
): Promise<BatchJobDb | null> {
  const [updated] = await db('batch_jobs')
    .where({ id })
    .update({
      ...updates,
      updated_at: db.fn.now(),
    })
    .returning('*');
  return updated || null;
}

/**
 * Delete batch job (cascades to runs)
 */
export async function deleteBatchJob(id: string): Promise<boolean> {
  const deleted = await db('batch_jobs').where({ id }).del();
  return deleted > 0;
}

/**
 * Delete stuck batch jobs (running or queued with 0 progress)
 */
export async function deleteStuckJobs(userId: string): Promise<number> {
  const deleted = await db('batch_jobs')
    .where({ user_id: userId })
    .whereIn('status', ['running', 'queued'])
    .where('completed', 0)
    .del();
  return deleted;
}

/**
 * Create batch job run
 */
export async function createBatchJobRun(run: Omit<BatchJobRunDb, 'id' | 'created_at'>): Promise<BatchJobRunDb> {
  const [created] = await db('batch_job_runs')
    .insert(run)
    .returning('*');
  return created;
}

/**
 * Create multiple batch job runs in bulk
 */
export async function createBatchJobRunsBulk(runs: Array<Omit<BatchJobRunDb, 'id' | 'created_at'>>): Promise<void> {
  if (runs.length === 0) return;

  // Insert in batches of 1000 for performance
  const batchSize = 1000;
  for (let i = 0; i < runs.length; i += batchSize) {
    const batch = runs.slice(i, i + batchSize);
    await db('batch_job_runs').insert(batch);
  }
}

/**
 * Get all runs for a batch job
 */
export async function getBatchJobRuns(batch_job_id: string): Promise<BatchJobRunDb[]> {
  return db('batch_job_runs')
    .where({ batch_job_id })
    .orderBy('run_index', 'asc');
}

/**
 * Get batch job with all runs
 */
export async function getBatchJobWithRuns(id: string): Promise<{
  job: BatchJobDb;
  runs: BatchJobRunDb[];
} | null> {
  const job = await getBatchJobById(id);
  if (!job) return null;

  const runs = await getBatchJobRuns(id);
  return { job, runs };
}

/**
 * Update batch job progress
 */
export async function updateBatchJobProgress(
  id: string,
  completed: number,
  status?: BatchJobStatus
): Promise<BatchJobDb | null> {
  const updates: any = { completed };

  if (status) {
    updates.status = status;
    if (status === 'finished' || status === 'failed') {
      updates.completed_at = db.fn.now();
    }
  }

  return updateBatchJob(id, updates);
}

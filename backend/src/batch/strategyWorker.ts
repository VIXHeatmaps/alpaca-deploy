import axios from 'axios';
import * as batchJobsDb from '../db/batchJobsDb';
import { getMarketDateToday } from '../utils/marketTime';
import { BATCH_CONCURRENCY, INTERNAL_API_BASE } from '../config/constants';
import { applyVariablesToElements, generateAllAssignments } from './helpers';
import { normalizeMetrics } from './metrics';

export const runBatchStrategyJob = async (
  jobId: string,
  assignments: Array<Record<string, string>>,
  apiKey: string,
  apiSecret: string
) => {
  const job = await batchJobsDb.getBatchJobById(jobId);
  if (!job) {
    console.error(`[BATCH] Job ${jobId} not found in database`);
    return;
  }

  let combos = assignments.length ? assignments : generateAllAssignments(JSON.parse(JSON.stringify(job.variables)));
  const total = combos.length;

  const startTime = Date.now();
  const startedAt = new Date(startTime);

  await batchJobsDb.updateBatchJob(jobId, {
    status: 'running',
    total,
    completed: 0,
    error: null,
    started_at: startedAt,
  });

  console.log(`[BATCH WORKER START] Job ${jobId} starting with ${total} backtests at ${startedAt.toISOString()}`);

  if (!job.strategy_elements) {
    await batchJobsDb.updateBatchJob(jobId, {
      status: 'failed',
      error: 'Missing strategy payload',
    });
    return;
  }

  let completedCount = 0;
  let successCount = 0;

  // Track summary stats incrementally to avoid memory accumulation
  let sumTotalReturn = 0;
  let bestTotalReturn = -Infinity;
  let worstTotalReturn = Infinity;

  const WRITE_BUFFER_SIZE = 200;
  const writeBuffer: Array<{ batch_job_id: string; run_index: number; variables: any; metrics: any }> = [];

  const flushBuffer = async () => {
    if (writeBuffer.length === 0) return;
    console.log(`[BATCH WORKER] Flushing ${writeBuffer.length} results to database...`);
    await batchJobsDb.createBatchJobRunsBulk(writeBuffer);
    writeBuffer.length = 0;
  };

  console.log(
    `[BATCH WORKER] Processing ${total} backtests with concurrency=${BATCH_CONCURRENCY}, write buffer=${WRITE_BUFFER_SIZE}`
  );

  for (let chunkStart = 0; chunkStart < combos.length; chunkStart += BATCH_CONCURRENCY) {
    const chunk = combos.slice(chunkStart, chunkStart + BATCH_CONCURRENCY);
    console.log(
      `[BATCH WORKER] Processing chunk ${Math.floor(chunkStart / BATCH_CONCURRENCY) + 1}/${Math.ceil(
        total / BATCH_CONCURRENCY
      )} (${chunk.length} backtests)`
    );

    const chunkPromises = chunk.map(async (assignment, chunkIdx) => {
      const idx = chunkStart + chunkIdx;
      try {
        const mutatedElements = applyVariablesToElements(JSON.parse(JSON.stringify(job.strategy_elements)), assignment);
        const payload = {
          elements: mutatedElements,
          benchmarkSymbol: job.benchmark_symbol || 'SPY',
          startDate: job.start_date || 'max',
          endDate: job.end_date || getMarketDateToday(),
          debug: false,
        };

        const response = await axios.post(`${INTERNAL_API_BASE}/api/backtest_strategy`, payload, {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
          timeout: 300000,
        });

        const resp = response?.data || {};
        const metricsRaw = resp.metrics || {};
        const metrics = normalizeMetrics(metricsRaw);

        writeBuffer.push({
          batch_job_id: jobId,
          run_index: idx,
          variables: assignment,
          metrics,
        });

        return {
          idx,
          variables: assignment,
          metrics,
        };
      } catch (err: any) {
        const errorMsg = err?.response?.data?.error || err?.message || 'Batch strategy backtest failed';
        console.error(`[BATCH WORKER] Run ${idx + 1}/${total} FAILED:`, errorMsg);
        console.error(`[BATCH WORKER] Full error:`, JSON.stringify(err?.response?.data || err?.message));

        writeBuffer.push({
          batch_job_id: jobId,
          run_index: idx,
          variables: assignment,
          metrics: { error: errorMsg },
        });

        return {
          idx,
          variables: assignment,
          metrics: { error: errorMsg },
          failed: true,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const result of chunkResults.sort((a, b) => a.idx - b.idx)) {
      if (!result.failed) {
        successCount++;
        // Update summary stats incrementally
        const totalReturn = (result.metrics as any)?.totalReturn ?? 0;
        sumTotalReturn += totalReturn;
        if (totalReturn > bestTotalReturn) bestTotalReturn = totalReturn;
        if (totalReturn < worstTotalReturn) worstTotalReturn = totalReturn;
      }
      completedCount++;
    }

    if (writeBuffer.length >= WRITE_BUFFER_SIZE) {
      await flushBuffer();
    }

    await batchJobsDb.updateBatchJobProgress(jobId, completedCount);

    if (completedCount % 100 === 0 || completedCount === total) {
      const percentComplete = ((completedCount / total) * 100).toFixed(1);
      console.log(
        `[BATCH WORKER] Progress: ${completedCount}/${total} (${percentComplete}%) - ${total - completedCount} remaining`
      );
    }
  }

  await flushBuffer();

  const endTime = Date.now();
  const durationMs = endTime - startTime;
  const durationSec = (durationMs / 1000).toFixed(1);
  console.log(
    `[BATCH WORKER] ✓ Batch completed in ${durationSec}s (${(successCount / (durationMs / 1000)).toFixed(
      1
    )} backtests/sec)`
  );

  // Build summary from incremental stats
  const summary = {
    totalRuns: completedCount,
    avgTotalReturn: successCount > 0 ? Number((sumTotalReturn / successCount).toFixed(4)) : 0,
    bestTotalReturn: successCount > 0 ? bestTotalReturn : 0,
    worstTotalReturn: successCount > 0 ? worstTotalReturn : 0,
    duration_ms: durationMs,
  };

  // Update job status and summary in a single atomic operation to avoid race conditions
  await batchJobsDb.updateBatchJob(jobId, {
    status: 'finished',
    completed: completedCount,
    completed_at: new Date(),
    summary,
  });
};

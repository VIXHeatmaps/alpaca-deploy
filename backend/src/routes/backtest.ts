import { Router, Request, Response } from 'express';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { requireAuth } from '../auth/jwt';
import { FEED, INDICATOR_SERVICE_URL, INTERNAL_API_BASE } from '../config/constants';
import {
  applyVariablesToElements,
  applyVariablesToNodes,
  buildSummary,
  clampNumber,
  generateAllAssignments,
  sanitizedVariables,
} from '../batch/helpers';
import { normalizeMetrics } from '../batch/metrics';
import { BatchJobRecord, BatchJobResult, FlowEdge, FlowGlobals, FlowNode } from '../batch/types';
import * as batchJobsDb from '../db/batchJobsDb';
import { spawnBatchStrategyWorker } from '../workers/spawnBatchStrategyWorker';
import { getMarketDateToday } from '../utils/marketTime';
import { toRFC3339End, toRFC3339Start } from '../utils/date';

const backtestRouter = Router();

const batchJobs = new Map<string, BatchJobRecord>();

const normalizeAssignment = (combo: Record<string, any>): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!combo) return out;
  for (const [k, v] of Object.entries(combo)) out[String(k)] = String(v);
  return out;
};

type BatchRequestBody = {
  jobId?: string;
  jobName?: string;
  variables?: Array<{ name: string; values: string[] }>;
  assignments?: Array<Record<string, string>>;
  truncated?: boolean;
  total?: number;
  flow?: {
    globals: FlowGlobals;
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
};

const startBatchJob = async (job: BatchJobRecord, assignments: Array<Record<string, string>>) => {
  let combos = assignments.length ? assignments : generateAllAssignments(job.variables);
  if (assignments.length && job.total && job.total !== combos.length) {
    job.truncated = true;
  }
  job.total = combos.length;

  job.status = 'running';
  job.completed = 0;
  job.updatedAt = new Date().toISOString();
  job.error = null;
  job.result = null;

  if (!job.flow) {
    job.status = 'failed';
    job.error = 'Missing flow payload';
    job.updatedAt = new Date().toISOString();
    return;
  }

  const runs: BatchJobResult['runs'] = [];

  for (let idx = 0; idx < combos.length; idx++) {
    const assignment = combos[idx];
    try {
      const mutatedNodes = applyVariablesToNodes(job.flow.nodes, assignment);
      const payload = {
        globals: job.flow.globals,
        nodes: mutatedNodes,
        edges: job.flow.edges,
      };
      const response = await axios.post(`${INTERNAL_API_BASE}/api/backtest_flow`, payload, {
        headers: {
          'APCA-API-KEY-ID': job.flow.apiKey,
          'APCA-API-SECRET-KEY': job.flow.apiSecret,
        },
      });

      const resp = response?.data || {};
      const metricsRaw = resp.metrics || {};
      runs.push({
        variables: assignment,
        metrics: normalizeMetrics(metricsRaw),
      });

      job.completed = idx + 1;
      job.updatedAt = new Date().toISOString();
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.response?.data?.error || err?.message || 'Batch backtest failed';
      job.updatedAt = new Date().toISOString();
      return;
    }
  }

  job.status = 'finished';
  job.completed = runs.length;
  job.updatedAt = new Date().toISOString();
  job.completedAt = new Date().toISOString();
  job.viewUrl = `/api/batch_backtest/${job.id}/view`;
  job.csvUrl = `/api/batch_backtest/${job.id}/results.csv`;
  job.result = {
    summary: buildSummary(runs, runs.length),
    runs,
  };
};

backtestRouter.post('/batch_backtest', (req: Request, res: Response) => {
  const body = (req.body || {}) as BatchRequestBody;
  const variables = sanitizedVariables(body.variables);
  const totalFromBody = clampNumber(body.total, 0);
  const assignmentsRaw = Array.isArray(body.assignments)
    ? body.assignments.map(normalizeAssignment)
    : [];
  const computedTotal = variables.length
    ? variables.reduce((acc, v) => acc * (v.values.length || 0), 1)
    : assignmentsRaw.length;
  const flowPayload = body.flow;
  if (!flowPayload || !flowPayload.globals || !Array.isArray(flowPayload.nodes) || !Array.isArray(flowPayload.edges)) {
    return res.status(400).json({ error: 'Flow payload is required for batch backtests' });
  }

  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').toString();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').toString();
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  const total = totalFromBody > 0 ? totalFromBody : computedTotal;

  const id = body.jobId || randomUUID();
  const createdAt = new Date().toISOString();

  const job: BatchJobRecord = {
    id,
    name: body.jobName || `Batch ${id.slice(0, 8)}`,
    status: total ? 'queued' : 'finished',
    total,
    completed: 0,
    createdAt,
    updatedAt: createdAt,
    variables,
    truncated: Boolean(body.truncated),
    error: null,
    assignmentsPreview: assignmentsRaw.slice(0, 25),
    result: null,
    viewUrl: null,
    csvUrl: null,
    completedAt: total ? null : createdAt,
    flow: {
      globals: flowPayload.globals,
      nodes: flowPayload.nodes.map((node) => ({ ...node, data: JSON.parse(JSON.stringify(node.data)) })),
      edges: flowPayload.edges.map((edge) => ({ ...edge })),
      apiKey,
      apiSecret,
    },
  };

  batchJobs.set(id, job);

  if (total) {
    startBatchJob(job, assignmentsRaw).catch((err: any) => {
      job.status = 'failed';
      job.error = err?.message || 'Batch backtest failed';
      job.updatedAt = new Date().toISOString();
    });
  } else {
    job.result = {
      summary: buildSummary([], 0),
      runs: [],
    };
    job.viewUrl = `/api/batch_backtest/${id}/view`;
    job.csvUrl = `/api/batch_backtest/${id}/results.csv`;
  }

  return res.status(202).json({
    jobId: id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    truncated: job.truncated,
  });
});

backtestRouter.get('/batch_backtest/:id', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    total: job.total,
    completed: job.completed,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    truncated: job.truncated || false,
    error: job.error || null,
    detail: job.variables.map((v) => ({ name: v.name, count: v.values.length })),
    viewUrl: job.viewUrl || null,
    csvUrl: job.csvUrl || null,
  });
});

backtestRouter.get('/batch_backtest/:id/view', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  if (!job.result) return res.status(202).json({ status: job.status, message: 'Batch still running' });
  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    summary: job.result.summary,
    truncated: job.truncated || false,
    total: job.total,
    completed: job.completed,
    detail: job.variables,
    runs: job.result.runs,
  });
});

backtestRouter.get('/batch_backtest/:id/results.csv', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  if (!job.result) return res.status(202).json({ status: job.status, message: 'Batch still running' });

  const headers = job.variables.map((v) => v.name);

  const metricKeys = new Set<string>();
  for (const run of job.result.runs) {
    for (const key of Object.keys(run.metrics || {})) {
      metricKeys.add(key);
    }
  }
  const metricHeaders = Array.from(metricKeys).sort();

  const csvRows: string[] = [];
  csvRows.push([...headers, ...metricHeaders].join(','));

  for (const run of job.result.runs) {
    const rowValues = headers.map((h) => JSON.stringify(run.variables[h] ?? ''));
    for (const metricKey of metricHeaders) {
      const val = run.metrics[metricKey];
      rowValues.push(val !== undefined && val !== null ? val.toString() : '');
    }
    csvRows.push(rowValues.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="batch-${job.id}.csv"`);
  return res.send(csvRows.join('\n'));
});

type BatchStrategyRequestBody = {
  jobId?: string;
  jobName?: string;
  variables?: Array<{ name: string; values: string[] }>;
  assignments?: Array<Record<string, string>>;
  truncated?: boolean;
  total?: number;
  elements?: any[];
  benchmarkSymbol?: string;
  startDate?: string;
  endDate?: string;
  debug?: boolean;
  baseStrategy?: {
    elements: any[];
    benchmarkSymbol?: string;
    startDate?: string;
    endDate?: string;
    debug?: boolean;
  };
};

backtestRouter.post('/batch_backtest_strategy', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const body = (req.body || {}) as BatchStrategyRequestBody;
  const variables = sanitizedVariables(body.variables);
  const totalFromBody = clampNumber(body.total, 0);
  const assignmentsRaw = Array.isArray(body.assignments)
    ? body.assignments.map(normalizeAssignment)
    : [];
  const computedTotal = variables.length
    ? variables.reduce((acc, v) => acc * (v.values.length || 0), 1)
    : assignmentsRaw.length;

  const elements = body.baseStrategy?.elements || body.elements;
  if (!elements || !Array.isArray(elements)) {
    return res.status(400).json({ error: 'Elements array is required for batch strategy backtests' });
  }

  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').toString();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').toString();
  console.log(`[BATCH STRATEGY] API Key: ${apiKey ? apiKey.slice(0, 8) + '...' : 'MISSING'}, Secret: ${apiSecret ? apiSecret.slice(0, 8) + '...' : 'MISSING'}`);
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  const total = totalFromBody > 0 ? totalFromBody : computedTotal;

  const id = body.jobId || randomUUID();

  const startDate = body.baseStrategy?.startDate || body.startDate;
  const endDate = body.baseStrategy?.endDate || body.endDate;

  const dbJob = await batchJobsDb.createBatchJob({
    id,
    name: body.jobName || `Batch Strategy ${id.slice(0, 8)}`,
    kind: 'server',
    status: total ? 'queued' : 'finished',
    total,
    completed: 0,
    user_id: userId,
    completed_at: total ? null : new Date(),
    error: null,
    truncated: Boolean(body.truncated),
    variables: variables as any,
    strategy_elements: elements as any,
    start_date: startDate && startDate !== 'max' ? startDate : null,
    end_date: endDate && endDate !== 'max' ? endDate : null,
    benchmark_symbol: body.baseStrategy?.benchmarkSymbol || body.benchmarkSymbol || 'SPY',
    assignments_preview: assignmentsRaw.slice(0, 25) as any,
    summary: null,
  });

  if (total) {
    const worker = spawnBatchStrategyWorker({
      jobId: id,
      assignments: assignmentsRaw,
      apiKey,
      apiSecret,
    });

    worker.on('error', async (err) => {
      console.error('[BATCH] Worker spawn error:', err);
      await batchJobsDb.updateBatchJob(id, {
        status: 'failed',
        error: err?.message || 'Batch worker failed to start',
      });
    });

    worker.on('exit', async (code) => {
      if (code && code !== 0) {
        console.error(`[BATCH] Worker exited with code ${code}`);
        await batchJobsDb.updateBatchJob(id, {
          status: 'failed',
          error: `Batch worker exited with status ${code}`,
        });
      }
    });
  } else {
    await batchJobsDb.updateBatchJob(id, {
      summary: buildSummary([], 0) as any,
    });
  }

  return res.status(202).json({
    jobId: id,
    status: dbJob.status,
    total: dbJob.total,
    completed: dbJob.completed,
    truncated: dbJob.truncated,
  });
});

backtestRouter.get('/batch_backtest_strategy/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const job = await batchJobsDb.getBatchJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }
  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    total: job.total,
    completed: job.completed,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at,
    truncated: job.truncated || false,
    error: job.error || null,
    detail: (job.variables as any[]).map((v) => ({ name: v.name, count: v.values?.length || 0 })),
    viewUrl: job.status === 'finished' ? `/api/batch_backtest_strategy/${job.id}/view` : null,
    csvUrl: job.status === 'finished' ? `/api/batch_backtest_strategy/${job.id}/results.csv` : null,
    summary: job.summary || null,
  });
});

backtestRouter.post('/batch_backtest_strategy/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const job = await batchJobsDb.getBatchJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  if (job.status !== 'running' && job.status !== 'queued') {
    return res.status(400).json({ error: 'Can only cancel running or queued jobs' });
  }

  const deleted = await batchJobsDb.deleteBatchJob(req.params.id);

  if (!deleted) {
    return res.status(500).json({ error: 'Failed to delete job' });
  }

  return res.json({ success: true, message: 'Job deleted' });
});

backtestRouter.get('/batch_backtest_strategy/:id/view', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const jobWithRuns = await batchJobsDb.getBatchJobWithRuns(req.params.id);
  if (!jobWithRuns) return res.status(404).json({ error: 'batch strategy job not found' });

  const { job, runs } = jobWithRuns;

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  if (job.status !== 'finished') {
    return res.status(202).json({ status: job.status, message: 'Batch still running' });
  }

  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    summary: job.summary,
    truncated: job.truncated || false,
    total: job.total,
    completed: job.completed,
    detail: job.variables,
    runs: runs.map((r) => ({
      variables: r.variables,
      metrics: r.metrics,
    })),
  });
});

backtestRouter.get('/batch_backtest_strategy/:id/results.csv', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const jobWithRuns = await batchJobsDb.getBatchJobWithRuns(req.params.id);
  if (!jobWithRuns) return res.status(404).json({ error: 'batch strategy job not found' });

  const { job, runs } = jobWithRuns;

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  if (job.status !== 'finished') {
    return res.status(202).json({ status: job.status, message: 'Batch still running' });
  }

  const headers = (job.variables as any[]).map((v) => v.name);

  const metricKeys = new Set<string>();
  for (const run of runs) {
    for (const key of Object.keys((run.metrics as any) || {})) {
      metricKeys.add(key);
    }
  }
  const metricHeaders = Array.from(metricKeys).sort();

  const csvRows: string[] = [];
  csvRows.push([...headers, ...metricHeaders].join(','));

  for (const run of runs) {
    const rowValues = headers.map((h) => JSON.stringify(run.variables[h] ?? ''));
    for (const metricKey of metricHeaders) {
      const val = run.metrics[metricKey];
      rowValues.push(val !== undefined && val !== null ? val.toString() : '');
    }
    csvRows.push(rowValues.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="batch-strategy-${job.id}.csv"`);
  return res.send(csvRows.join('\n'));
});

export default backtestRouter;

import { runBatchStrategyJob } from '../batch/strategyWorker';

type WorkerPayload = {
  jobId: string;
  assignments: Array<Record<string, string>>;
  apiKey: string;
  apiSecret: string;
};

const execute = async (payload: WorkerPayload) => {
  if (!payload?.jobId) {
    console.error('[BATCH WORKER] Missing jobId in payload');
    process.exit(1);
  }

  try {
    await runBatchStrategyJob(payload.jobId, payload.assignments || [], payload.apiKey, payload.apiSecret);
    process.exit(0);
  } catch (err: any) {
    console.error('[BATCH WORKER] Fatal error:', err?.stack || err?.message || err);
    process.exit(1);
  }
};

if (require.main === module) {
  const [serialized] = process.argv.slice(2);
  if (!serialized) {
    console.error('[BATCH WORKER] No payload provided via CLI');
    process.exit(1);
  }

  try {
    const payload = JSON.parse(Buffer.from(serialized, 'base64').toString('utf-8')) as WorkerPayload;
    execute(payload);
  } catch (err: any) {
    console.error('[BATCH WORKER] Failed to parse payload:', err?.message || err);
    process.exit(1);
  }
} else {
  process.on('message', (payload: WorkerPayload) => {
    execute(payload);
  });
}

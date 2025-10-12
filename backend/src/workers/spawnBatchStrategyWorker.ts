import path from 'path';
import { fork, ChildProcess } from 'child_process';

type WorkerPayload = {
  jobId: string;
  assignments: Array<Record<string, string>>;
  apiKey: string;
  apiSecret: string;
};

const resolveWorkerPath = () => {
  const runningTs = __filename.endsWith('.ts');
  const fileName = runningTs ? 'batchStrategyWorker.ts' : 'batchStrategyWorker.js';
  return {
    path: path.join(__dirname, fileName),
    execArgv: runningTs ? ['-r', 'ts-node/register'] : [],
  };
};

export const spawnBatchStrategyWorker = (payload: WorkerPayload): ChildProcess => {
  const { path: workerPath, execArgv } = resolveWorkerPath();
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
  const child = fork(workerPath, [encoded], {
    execArgv,
    env: process.env,
    stdio: 'inherit',
  });

  return child;
};

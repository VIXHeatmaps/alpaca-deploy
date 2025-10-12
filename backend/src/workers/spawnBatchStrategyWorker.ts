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
  const child = fork(workerPath, [], {
    execArgv,
    env: process.env,
    stdio: 'inherit',
  });

  child.send(payload);
  return child;
};

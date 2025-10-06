export type BatchJobStatus = "queued" | "running" | "finished" | "failed";

export type BatchJobVariable = {
  name: string;
  count: number;
  values: string[];
  label?: string;
  originalName?: string;
};

export type BatchJobPreviewItem = {
  vars: Record<string, string>;
  description: string;
};

export type BatchJob = {
  id: string;
  name: string;
  kind?: "server" | "local";
  status: BatchJobStatus;
  total: number;
  completed: number;
  createdAt: string;
  updatedAt: string;
  detail: BatchJobVariable[];
  error?: string | null;
  truncated?: boolean;
  viewUrl?: string | null;
  csvUrl?: string | null;
  completedAt?: string | null;
  preview?: BatchJobPreviewItem[];
};

export const BATCH_JOBS_KEY = "flow_batch_jobs_v1";

export const normalizeBatchJobStatus = (
  status: unknown,
  fallback: BatchJobStatus = "queued"
): BatchJobStatus => {
  if (typeof status === "string") {
    const lower = status.toLowerCase();
    if (lower === "queued" || lower === "running" || lower === "finished" || lower === "failed") {
      return lower as BatchJobStatus;
    }
  }
  return fallback;
};

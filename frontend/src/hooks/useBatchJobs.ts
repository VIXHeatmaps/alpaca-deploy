import { useCallback, useEffect, useState } from "react";
import { getAllJobs } from "../storage/batchJobsStore";
import type { BatchJob } from "../types/batchJobs";

const BATCH_JOBS_CACHE_KEY = "verticalUI2_batch_jobs";

const readCachedJobs = (): BatchJob[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BATCH_JOBS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read cached batch jobs", error);
    return [];
  }
};

const writeCachedJobs = (jobs: BatchJob[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BATCH_JOBS_CACHE_KEY, JSON.stringify(jobs));
  } catch (error) {
    console.warn("Failed to persist batch jobs cache", error);
  }
};

type BatchJobsUpdater = BatchJob[] | ((prev: BatchJob[]) => BatchJob[]);

export const useBatchJobs = () => {
  const [batchJobs, setBatchJobsState] = useState<BatchJob[]>(readCachedJobs);
  const [batchLoading, setBatchLoading] = useState(false);

  const setBatchJobs = useCallback((updater: BatchJobsUpdater) => {
    setBatchJobsState((previous) => {
      const nextValue = typeof updater === "function" ? (updater as (prev: BatchJob[]) => BatchJob[])(previous) : updater;
      return nextValue;
    });
  }, []);

  const refreshBatchJobs = useCallback(async () => {
    try {
      setBatchLoading(true);
      const jobs = await getAllJobs();
      setBatchJobsState(jobs);
    } catch (error) {
      console.error("Failed to load batch jobs:", error);
    } finally {
      setBatchLoading(false);
    }
  }, []);

  useEffect(() => {
    writeCachedJobs(batchJobs);
  }, [batchJobs]);

  useEffect(() => {
    refreshBatchJobs();
  }, [refreshBatchJobs]);

  return {
    batchJobs,
    batchLoading,
    setBatchJobs,
    refreshBatchJobs,
  };
};

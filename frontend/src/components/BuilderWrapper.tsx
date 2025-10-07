import { useState, useEffect } from "react";
import VerticalUI2 from "./VerticalUI2";
import { LibraryView } from "./LibraryView";
import type { BatchJob } from "../types/batchJobs";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

export type BuilderWrapperProps = {
  apiKey: string;
  apiSecret: string;
  view: "library" | "builder";
};

export function BuilderWrapper({ apiKey, apiSecret, view }: BuilderWrapperProps) {
  // Batch jobs state - load from localStorage (shared between Builder and Library)
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>(() => {
    try {
      const saved = localStorage.getItem('verticalUI2_batch_jobs');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      console.error('Failed to load batch jobs:', err);
    }
    return [];
  });

  const [batchLoading, setBatchLoading] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [showResultsViewer, setShowResultsViewer] = useState(false);
  const [viewingResults, setViewingResults] = useState<any>(null);

  // Poll for job updates every 2 seconds if there are running jobs
  useEffect(() => {
    const runningJobs = batchJobs.filter(j => j.status === 'queued' || j.status === 'running');
    if (runningJobs.length === 0) return;

    const pollJobs = async () => {
      const updates = await Promise.all(
        runningJobs.map(async (job) => {
          try {
            const response = await fetch(`${API_BASE}/api/batch_backtest_strategy/${job.id}`);
            if (response.ok) {
              const data = await response.json();
              return {
                ...job,
                status: data.status,
                completed: data.completed,
                updatedAt: data.updatedAt,
                viewUrl: data.viewUrl,
                csvUrl: data.csvUrl,
                error: data.error,
              };
            }
          } catch (err) {
            console.error(`Failed to poll job ${job.id}:`, err);
          }
          return job;
        })
      );

      // Update batch jobs with polling results
      setBatchJobs(prev => {
        const updated = prev.map(job => {
          const polled = updates.find(u => u.id === job.id);
          return polled || job;
        });
        localStorage.setItem('verticalUI2_batch_jobs', JSON.stringify(updated));
        return updated;
      });
    };

    const interval = setInterval(pollJobs, 2000);
    return () => clearInterval(interval);
  }, [batchJobs]);

  const handleViewBatchJob = async (job: BatchJob) => {
    if (!job.viewUrl) {
      alert('View URL not available for this job');
      return;
    }

    setLoadingResults(true);
    try {
      const response = await fetch(`${API_BASE}${job.viewUrl}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch results');
      }

      setViewingResults({
        jobId: job.id,
        name: job.name,
        summary: data.summary,
        truncated: data.truncated || false,
        total: data.total,
        detail: data.detail,
        runs: data.runs,
      });
      setShowResultsViewer(true);
    } catch (error: any) {
      alert(`Failed to load batch results: ${error.message}`);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleDownloadBatchCsv = async (job: BatchJob) => {
    if (!job.csvUrl) {
      alert('CSV download not available for this job');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}${job.csvUrl}`);
      if (!response.ok) {
        throw new Error('Failed to download CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.name}_results.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(`Failed to download CSV: ${error.message}`);
    }
  };

  const handleCancelJob = async (job: BatchJob) => {
    if (!confirm(`Cancel batch job "${job.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/batch_backtest_strategy/${job.id}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }

      // Update job status immediately
      setBatchJobs(prev => {
        const updated = prev.map(j =>
          j.id === job.id ? { ...j, status: 'failed' as const, error: 'Cancelled by user' } : j
        );
        localStorage.setItem('verticalUI2_batch_jobs', JSON.stringify(updated));
        return updated;
      });
    } catch (error: any) {
      alert(`Failed to cancel job: ${error.message}`);
    }
  };

  if (view === "library") {
    return (
      <LibraryView
        batchJobs={batchJobs}
        batchJobsLoading={batchLoading}
        onViewBatchJob={handleViewBatchJob}
        onDownloadBatchCsv={handleDownloadBatchCsv}
        onCancelJob={handleCancelJob}
      />
    );
  }

  return <VerticalUI2 apiKey={apiKey} apiSecret={apiSecret} />;
}

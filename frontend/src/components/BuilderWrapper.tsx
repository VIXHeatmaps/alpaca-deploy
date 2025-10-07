import { useState } from "react";
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

  if (view === "library") {
    return (
      <LibraryView
        batchJobs={batchJobs}
        batchJobsLoading={batchLoading}
        onViewBatchJob={handleViewBatchJob}
        onDownloadBatchCsv={handleDownloadBatchCsv}
      />
    );
  }

  return <VerticalUI2 apiKey={apiKey} apiSecret={apiSecret} />;
}

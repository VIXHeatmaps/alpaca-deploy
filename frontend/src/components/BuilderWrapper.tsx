import { useState, useEffect } from "react";
import VerticalUI2 from "./VerticalUI2";
import { LibraryView } from "./LibraryView";
import type { BatchJob } from "../types/batchJobs";
import { getAllJobs, putJob } from "../storage/batchJobsStore";
import type { Strategy } from "../api/strategies";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

export type BuilderWrapperProps = {
  apiKey: string;
  apiSecret: string;
  view: "library" | "builder";
  onLoadStrategy?: (strategy: Strategy) => void;
};

export function BuilderWrapper({ apiKey, apiSecret, view, onLoadStrategy }: BuilderWrapperProps) {
  // Batch jobs state - load from IndexedDB (shared between Builder and Library)
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);

  // Load batch jobs from IndexedDB on mount and when view changes to library
  useEffect(() => {
    if (view === "library") {
      getAllJobs().then((jobs) => {
        setBatchJobs(jobs);
      }).catch((err) => {
        console.error('Failed to load batch jobs:', err);
      });
    }
  }, [view]);

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
            const response = await fetch(`${API_BASE}/api/batch_backtest_strategy/${job.id}`, {
              credentials: 'include'
            });
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

      // Update batch jobs with polling results and persist to IndexedDB
      setBatchJobs(prev => {
        const updated = prev.map(job => {
          const polled = updates.find(u => u.id === job.id);
          return polled || job;
        });
        // Persist each updated job to IndexedDB
        updates.forEach(job => {
          putJob(job).catch(err => console.error('Failed to persist job:', err));
        });
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
      const response = await fetch(`${API_BASE}${job.viewUrl}`, {
        credentials: 'include'
      });
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
      const response = await fetch(`${API_BASE}${job.csvUrl}`, {
        credentials: 'include'
      });
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
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }

      // Update job status immediately and persist to IndexedDB
      const cancelledJob = {
        ...job,
        status: 'failed' as const,
        error: 'Cancelled by user',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      setBatchJobs(prev => prev.map(j =>
        j.id === job.id ? cancelledJob : j
      ));
      await putJob(cancelledJob);
    } catch (error: any) {
      alert(`Failed to cancel job: ${error.message}`);
    }
  };

  const handleOpenStrategy = (strategy: Strategy) => {
    if (onLoadStrategy) {
      onLoadStrategy(strategy);
    }
  };

  if (view === "library") {
    return (
      <>
        <LibraryView
          batchJobs={batchJobs}
          batchJobsLoading={batchLoading}
          onViewBatchJob={handleViewBatchJob}
          onDownloadBatchCsv={handleDownloadBatchCsv}
          onCancelJob={handleCancelJob}
          onOpenStrategy={handleOpenStrategy}
        />

        {/* Batch Results Viewer Modal */}
        {showResultsViewer && viewingResults && (
          <div
            onClick={() => setShowResultsViewer(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17,24,39,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 24,
                maxWidth: 900,
                width: "100%",
                maxHeight: "90vh",
                overflow: "auto",
                boxShadow: "0 20px 45px rgba(15,23,42,0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{viewingResults.name} - Results</div>
                <button
                  onClick={() => setShowResultsViewer(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 24,
                    cursor: "pointer",
                    color: "#666",
                    padding: 0,
                    width: 32,
                    height: 32,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Summary Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                <div style={{ background: "#f9fafb", padding: 16, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                    Total Runs
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>
                    {viewingResults.total}
                  </div>
                </div>
                <div style={{ background: "#f0fdf4", padding: 16, borderRadius: 8, border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                    Best Return
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>
                    {(viewingResults.summary.bestTotalReturn * 100).toFixed(2)}%
                  </div>
                </div>
                <div style={{ background: "#fef2f2", padding: 16, borderRadius: 8, border: "1px solid #fecaca" }}>
                  <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                    Worst Return
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#b91c1c" }}>
                    {(viewingResults.summary.worstTotalReturn * 100).toFixed(2)}%
                  </div>
                </div>
                <div style={{ background: "#eff6ff", padding: 16, borderRadius: 8, border: "1px solid #bfdbfe" }}>
                  <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                    Avg Return
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#1e40af" }}>
                    {(viewingResults.summary.avgTotalReturn * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Results Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>
                        #
                      </th>
                      {viewingResults.runs[0] && Object.keys(viewingResults.runs[0].variables).map((varName: string) => (
                        <th key={varName} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>
                          ${varName}
                        </th>
                      ))}
                      <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                        Total Return
                      </th>
                      <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                        Sharpe Ratio
                      </th>
                      <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                        Max Drawdown
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingResults.runs.map((run: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                          {idx + 1}
                        </td>
                        {Object.values(run.variables).map((value: any, vIdx: number) => (
                          <td key={vIdx} style={{ padding: "10px 12px", fontFamily: "monospace", color: "#111827" }}>
                            {value}
                          </td>
                        ))}
                        <td style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: 600,
                          color: run.metrics.totalReturn >= 0 ? "#15803d" : "#b91c1c",
                        }}>
                          {(run.metrics.totalReturn * 100).toFixed(2)}%
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>
                          {run.metrics.sharpeRatio?.toFixed(2) ?? 'N/A'}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "#b91c1c" }}>
                          {run.metrics.maxDrawdown ? `${(run.metrics.maxDrawdown * 100).toFixed(2)}%` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return <VerticalUI2 apiKey={apiKey} apiSecret={apiSecret} />;
}

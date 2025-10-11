import React, { useMemo } from "react";
import type { BatchJob } from "../types/batchJobs";

export type BatchTestsTabProps = {
  jobs: BatchJob[];
  loading: boolean;
  onViewJob: (job: BatchJob) => void;
  onDownloadCsv: (job: BatchJob) => void;
  onCancelJob: (job: BatchJob) => void;
};

export function BatchTestsTab({ jobs, loading, onViewJob, onDownloadCsv, onCancelJob }: BatchTestsTabProps) {
  const box: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 10,
    padding: 12,
    background: "#fff",
  };

  // Sort all jobs: in-progress at top, then completed by most recent
  const sortedJobs = useMemo(() => {
    const inProgress = jobs.filter((job) => job.status === "queued" || job.status === "running");
    const completed = jobs.filter((job) => job.status === "finished" || job.status === "failed");

    // Sort in-progress by creation time (oldest first)
    inProgress.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Sort completed by update time (most recent first)
    completed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return [...inProgress, ...completed];
  }, [jobs]);

  const tableStyles = {
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      background: "#fff",
      border: "1px solid #e6e6e6",
      borderRadius: 8,
    },
    th: {
      textAlign: "left" as const,
      padding: "10px 12px",
      borderBottom: "1px solid #e6e6e6",
      fontWeight: 600,
      fontSize: 12,
      color: "#666",
      textTransform: "uppercase" as const,
      letterSpacing: "0.5px",
    },
    td: {
      padding: "12px",
      borderBottom: "1px solid #f5f5f5",
      fontSize: 13,
    },
  };

  const JobRow = ({ job }: { job: BatchJob }) => {
    const viewDisabled = job.status !== "finished";
    const downloadDisabled = job.status !== "finished";
    const cancelDisabled = job.status !== "running" && job.status !== "queued";

    const getDuration = () => {
      // Prefer duration_ms from summary (actual processing time) over timestamp math
      let durationMs: number;

      if (job.summary?.duration_ms !== undefined && job.summary.duration_ms > 0) {
        durationMs = job.summary.duration_ms;
      } else if (job.completedAt && job.createdAt) {
        // Fallback to timestamp math for old jobs
        const start = new Date(job.createdAt).getTime();
        const end = new Date(job.completedAt).getTime();
        durationMs = end - start;
      } else {
        return "—";
      }

      const durationSec = Math.round(durationMs / 1000);

      if (durationSec < 60) {
        return `${durationSec}s`;
      }
      const minutes = Math.floor(durationSec / 60);
      const seconds = durationSec % 60;
      return `${minutes}m ${seconds}s`;
    };

    const getBacktestsPerSecond = () => {
      if (job.status !== "finished") return null;

      // Prefer duration_ms from summary (actual processing time) over timestamp math
      let durationMs: number;

      if (job.summary?.duration_ms !== undefined && job.summary.duration_ms > 0) {
        durationMs = job.summary.duration_ms;
      } else if (job.completedAt && job.createdAt) {
        // Fallback to timestamp math for old jobs
        const start = new Date(job.createdAt).getTime();
        const end = new Date(job.completedAt).getTime();
        durationMs = end - start;
      } else {
        return null;
      }

      const durationSec = durationMs / 1000;
      const bps = job.total / durationSec;
      return bps.toFixed(1);
    };

    const getStatusBadge = () => {
      const baseStyle = {
        fontSize: 10,
        fontWeight: 600,
        padding: "4px 8px",
        borderRadius: 4,
      };

      switch (job.status) {
        case "finished":
          return (
            <span style={{ ...baseStyle, background: "#e8f5ed", color: "#0f7a3a", border: "1px solid #b7e3c8" }}>
              FINISHED
            </span>
          );
        case "running":
          return (
            <span style={{ ...baseStyle, background: "#e3f2fd", color: "#1976d2", border: "1px solid #90caf9" }}>
              RUNNING {job.total ? `${job.completed}/${job.total}` : ""}
            </span>
          );
        case "queued":
          return (
            <span style={{ ...baseStyle, background: "#fff3e0", color: "#e65100", border: "1px solid #ffb74d" }}>
              QUEUED
            </span>
          );
        case "failed":
          return (
            <span style={{ ...baseStyle, background: "#fdecea", color: "#b00020", border: "1px solid #f2c0c0" }}>
              FAILED
            </span>
          );
        default:
          return <span style={{ ...baseStyle, background: "#f5f5f5", color: "#666", border: "1px solid #ddd" }}>{String(job.status).toUpperCase()}</span>;
      }
    };

    return (
      <tr>
        <td style={tableStyles.td}>
          <div style={{ fontWeight: 600 }}>{job.name}</div>
          {job.detail.length > 0 && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {job.detail.map((d) => `$${d.name} (${d.count})`).join(" × ")}
            </div>
          )}
        </td>
        <td style={tableStyles.td}>
          <div style={{ fontSize: 12, color: "#666" }}>
            {new Date(job.createdAt).toLocaleString()}
          </div>
        </td>
        <td style={tableStyles.td}>
          <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>
            {getDuration()}
          </div>
          {getBacktestsPerSecond() && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              {getBacktestsPerSecond()} backtests/sec
            </div>
          )}
        </td>
        <td style={tableStyles.td}>{getStatusBadge()}</td>
        <td style={{ ...tableStyles.td, textAlign: "center" as const }}>
          <button
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: "none",
              background: !viewDisabled ? "#1677ff" : "#ddd",
              color: !viewDisabled ? "#fff" : "#888",
              cursor: !viewDisabled ? "pointer" : "not-allowed",
            }}
            disabled={viewDisabled}
            onClick={() => !viewDisabled && onViewJob(job)}
          >
            View
          </button>
        </td>
        <td style={{ ...tableStyles.td, textAlign: "center" as const }}>
          <button
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: "none",
              background: !downloadDisabled ? "#0a7" : "#ddd",
              color: !downloadDisabled ? "#fff" : "#888",
              cursor: !downloadDisabled ? "pointer" : "not-allowed",
            }}
            disabled={downloadDisabled}
            onClick={() => !downloadDisabled && onDownloadCsv(job)}
          >
            Download CSV
          </button>
        </td>
        <td style={{ ...tableStyles.td, textAlign: "center" as const }}>
          <button
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: "none",
              background: !cancelDisabled ? "#ef4444" : "#ddd",
              color: !cancelDisabled ? "#fff" : "#888",
              cursor: !cancelDisabled ? "pointer" : "not-allowed",
            }}
            disabled={cancelDisabled}
            onClick={() => !cancelDisabled && onCancelJob(job)}
          >
            Cancel
          </button>
        </td>
      </tr>
    );
  };

  if (loading && sortedJobs.length === 0) {
    return (
      <div style={box}>
        <div style={{ color: "#666", fontSize: 13, padding: 12 }}>Loading saved batch runs…</div>
      </div>
    );
  }

  if (sortedJobs.length === 0) {
    return (
      <div style={box}>
        <div style={{ color: "#666", fontSize: 13, padding: 12 }}>No batch backtests yet.</div>
      </div>
    );
  }

  return (
    <div style={box}>
      <table style={tableStyles.table}>
        <thead>
          <tr>
            <th style={tableStyles.th}>Name</th>
            <th style={tableStyles.th}>Date</th>
            <th style={tableStyles.th}>Duration</th>
            <th style={tableStyles.th}>Status</th>
            <th style={{ ...tableStyles.th, textAlign: "center" as const }}>View</th>
            <th style={{ ...tableStyles.th, textAlign: "center" as const }}>Download CSV</th>
            <th style={{ ...tableStyles.th, textAlign: "center" as const }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedJobs.map((job) => <JobRow key={job.id} job={job} />)}
        </tbody>
      </table>
    </div>
  );
}

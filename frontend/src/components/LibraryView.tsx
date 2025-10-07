import { useState } from "react";
import { VariablesTab } from "./VariablesTab";
import { BatchTestsTab } from "./BatchTestsTab";
import type { BatchJob } from "../types/batchJobs";

export type LibraryViewProps = {
  batchJobs: BatchJob[];
  batchJobsLoading: boolean;
  onViewBatchJob: (job: BatchJob) => void;
  onDownloadBatchCsv: (job: BatchJob) => void;
  onCancelJob: (job: BatchJob) => void;
};

export function LibraryView({
  batchJobs,
  batchJobsLoading,
  onViewBatchJob,
  onDownloadBatchCsv,
  onCancelJob,
}: LibraryViewProps) {
  const [libraryTab, setLibraryTab] = useState<"strategies" | "variables" | "batchtests">("strategies");

  const tabBtn: React.CSSProperties = {
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 400,
    color: "#9ca3af",
    transition: "color 0.2s",
  };

  const tabBtnActive: React.CSSProperties = {
    ...tabBtn,
    color: "#1677ff",
    fontWeight: 500,
  };

  return (
    <div>
      {/* Library Sub-tabs */}
      <div style={{
        marginBottom: 24,
        display: "flex",
        gap: 8,
      }}>
        <button
          style={libraryTab === "strategies" ? tabBtnActive : tabBtn}
          onClick={() => setLibraryTab("strategies")}
        >
          Strategies
        </button>
        <button
          style={libraryTab === "variables" ? tabBtnActive : tabBtn}
          onClick={() => setLibraryTab("variables")}
        >
          Variables
        </button>
        <button
          style={libraryTab === "batchtests" ? tabBtnActive : tabBtn}
          onClick={() => setLibraryTab("batchtests")}
        >
          Batch Tests
        </button>
      </div>

      {/* Library Content */}
      {libraryTab === "strategies" && (
        <div style={{
          padding: 24,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          minHeight: 400,
        }}>
          <div style={{ fontSize: 14, color: "#666" }}>
            Strategy list coming soon. For now, use Builder to create and edit strategies.
          </div>
        </div>
      )}

      {libraryTab === "variables" && <VariablesTab />}

      {libraryTab === "batchtests" && (
        <BatchTestsTab
          jobs={batchJobs}
          loading={batchJobsLoading}
          onViewJob={onViewBatchJob}
          onDownloadCsv={onDownloadBatchCsv}
          onCancelJob={onCancelJob}
        />
      )}
    </div>
  );
}

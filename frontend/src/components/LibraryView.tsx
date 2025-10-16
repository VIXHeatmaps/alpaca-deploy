import { useState, useEffect } from "react";
import { VariablesTab } from "./VariablesTab";
import { BatchTestsTab } from "./BatchTestsTab";
import type { BatchJob } from "../types/batchJobs";
import * as strategiesApi from "../api/strategies";
import type { Strategy } from "../api/strategies";

export type LibraryViewProps = {
  tab: "strategies" | "variables" | "batchtests";
  batchJobs: BatchJob[];
  batchJobsLoading: boolean;
  onViewBatchJob: (job: BatchJob) => void;
  onDownloadBatchCsv: (job: BatchJob) => void;
  onCancelJob: (job: BatchJob) => void;
  onOpenStrategy?: (strategy: Strategy) => void;
};

type SortField = 'name' | 'status' | 'updated_at';
type SortDirection = 'asc' | 'desc';

export function LibraryView({
  tab,
  batchJobs,
  batchJobsLoading,
  onViewBatchJob,
  onDownloadBatchCsv,
  onCancelJob,
  onOpenStrategy,
}: LibraryViewProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Load strategies when tab is active
  useEffect(() => {
    if (tab === "strategies") {
      loadStrategies();
    }
  }, [tab]);

  const loadStrategies = async () => {
    setStrategiesLoading(true);
    try {
      const data = await strategiesApi.getAllStrategies();
      setStrategies(data);
    } catch (error: any) {
      console.error('Failed to load strategies:', error);
      alert(`Failed to load strategies: ${error.message}`);
    } finally {
      setStrategiesLoading(false);
    }
  };

  const handleDeleteStrategy = async (id: number, name: string) => {
    if (!window.confirm(`Delete strategy "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await strategiesApi.deleteStrategy(id);
      alert(`Strategy "${name}" deleted successfully`);
      await loadStrategies(); // Reload the list
    } catch (error: any) {
      console.error('Failed to delete strategy:', error);
      alert(`Failed to delete strategy: ${error.message}`);
    }
  };

  const formatVersion = (strategy: Strategy) => {
    const { version_major, version_minor, version_patch, version_fork } = strategy;
    const forkLower = version_fork.toLowerCase();

    // Special case for v0.0.1
    if (version_major === 0 && version_minor === 0 && version_patch === 1 && !version_fork) {
      return `v0.0.1`;
    }
    // Standard formatting: drop trailing zeros
    if (version_patch > 0) return `v${version_major}.${version_minor}.${version_patch}${forkLower}`;
    if (version_minor > 0) return `v${version_major}.${version_minor}${forkLower}`;
    return `v${version_major}${forkLower}`;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedStrategies = () => {
    return [...strategies].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'status':
          // Sort order: LIVE, DRAFT, LIQUIDATED
          const statusOrder = { LIVE: 0, DRAFT: 1, LIQUIDATED: 2 };
          aVal = statusOrder[a.status];
          bVal = statusOrder[b.status];
          break;
        case 'updated_at':
          aVal = new Date(a.updated_at).getTime();
          bVal = new Date(b.updated_at).getTime();
          break;
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const getStatusBadgeStyle = (status: string) => {
    const baseStyle = {
      padding: "4px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      display: "inline-block",
    };

    switch (status) {
      case 'LIVE':
        return { ...baseStyle, background: "#e8f5ed", color: "#0f7a3a", border: "1px solid #b7e3c8" };
      case 'LIQUIDATED':
        return { ...baseStyle, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
      case 'DRAFT':
      default:
        return { ...baseStyle, background: "#f3f4f6", color: "#6b7280", border: "1px solid #d1d5db" };
    }
  };

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
      {/* Library Content */}
      {tab === "strategies" && (
        <div style={{
          padding: 24,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          minHeight: 400,
        }}>
          {strategiesLoading ? (
            <div style={{ fontSize: 14, color: "#666" }}>Loading strategies...</div>
          ) : strategies.length === 0 ? (
            <div style={{ fontSize: 14, color: "#666" }}>
              No saved strategies yet. Use the Builder to create and save strategies.
            </div>
          ) : (
            <div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>
                  Saved Strategies ({strategies.length})
                </div>
                <button
                  onClick={loadStrategies}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    color: "#374151",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
                >
                  Refresh
                </button>
              </div>

              {/* Strategies table */}
              <div style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden"
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                      onClick={() => handleSort('name')}
                      >
                        Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                      onClick={() => handleSort('status')}
                      >
                        Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase"
                      }}>
                        Version
                      </th>
                      <th style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                      onClick={() => handleSort('updated_at')}
                      >
                        Updated {sortField === 'updated_at' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{
                        padding: "12px 16px",
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase"
                      }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedStrategies().map((strategy) => (
                      <tr key={strategy.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{
                          padding: "12px 16px",
                          fontSize: 14,
                          color: "#111827",
                          fontWeight: 500
                        }}>
                          {strategy.name}
                        </td>
                        <td style={{
                          padding: "12px 16px"
                        }}>
                          <span style={getStatusBadgeStyle(strategy.status)}>
                            {strategy.status}
                          </span>
                        </td>
                        <td style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#6b7280",
                          fontFamily: "monospace"
                        }}>
                          {formatVersion(strategy)}
                        </td>
                        <td style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#6b7280"
                        }}>
                          {new Date(strategy.updated_at).toLocaleDateString()} {new Date(strategy.updated_at).toLocaleTimeString()}
                        </td>
                        <td style={{
                          padding: "12px 16px",
                          textAlign: "right"
                        }}>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => onOpenStrategy?.(strategy)}
                              style={{
                                padding: "6px 12px",
                                fontSize: 12,
                                border: "1px solid #1677ff",
                                borderRadius: 6,
                                background: "#1677ff",
                                color: "#fff",
                                cursor: "pointer",
                                fontWeight: 500,
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "#0958d9"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "#1677ff"}
                            >
                              Open
                            </button>
                            <button
                              onClick={() => handleDeleteStrategy(strategy.id, strategy.name)}
                              style={{
                                padding: "6px 12px",
                                fontSize: 12,
                                border: "1px solid #dc2626",
                                borderRadius: 6,
                                background: "#fff",
                                color: "#dc2626",
                                cursor: "pointer",
                                fontWeight: 500,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#dc2626";
                                e.currentTarget.style.color = "#fff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#fff";
                                e.currentTarget.style.color = "#dc2626";
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "variables" && <VariablesTab />}

      {tab === "batchtests" && (
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

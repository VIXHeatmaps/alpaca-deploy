interface BatchResultRun {
  variables: Record<string, string>;
  metrics: Record<string, number>;
}

interface BatchResultsSummary {
  totalRuns: number;
  avgTotalReturn: number;
  bestTotalReturn: number;
  worstTotalReturn: number;
}

export interface BatchResultsData {
  jobId: string;
  name: string;
  summary: BatchResultsSummary;
  runs: BatchResultRun[];
}

interface BatchResultsModalProps {
  open: boolean;
  results: BatchResultsData | null;
  onClose: () => void;
}

export function BatchResultsModal({ open, results, onClose }: BatchResultsModalProps) {
  if (!open || !results) return null;

  const variableHeaders = results.runs[0] ? Object.keys(results.runs[0].variables) : [];

  return (
    <div
      onClick={onClose}
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
        onClick={(event) => event.stopPropagation()}
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
          <div style={{ fontSize: 18, fontWeight: 800 }}>{results.name} - Results</div>
          <button
            onClick={onClose}
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
            aria-label="Close results viewer"
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
              {results.summary.totalRuns}
            </div>
          </div>
          <div style={{ background: "#f0fdf4", padding: 16, borderRadius: 8, border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Best Return
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>
              {(results.summary.bestTotalReturn * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ background: "#fef2f2", padding: 16, borderRadius: 8, border: "1px solid #fecaca" }}>
            <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Worst Return
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#b91c1c" }}>
              {(results.summary.worstTotalReturn * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ background: "#eff6ff", padding: 16, borderRadius: 8, border: "1px solid #bfdbfe" }}>
            <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Avg Return
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e40af" }}>
              {(results.summary.avgTotalReturn * 100).toFixed(2)}%
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
                {variableHeaders.map((varName) => (
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
              {results.runs.map((run, index) => (
                <tr key={run.variables ? `${results.jobId}-${index}` : index} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{index + 1}</td>
                  {variableHeaders.map((header) => (
                    <td key={header} style={{ padding: "10px 12px", fontFamily: "monospace", color: "#111827" }}>
                      {run.variables[header]}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontWeight: 600,
                      color: (run.metrics.totalReturn ?? 0) >= 0 ? "#15803d" : "#b91c1c",
                    }}
                  >
                    {run.metrics.totalReturn !== undefined
                      ? `${(run.metrics.totalReturn * 100).toFixed(2)}%`
                      : "N/A"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>
                    {run.metrics.sharpeRatio !== undefined ? run.metrics.sharpeRatio.toFixed(2) : "N/A"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#b91c1c" }}>
                    {run.metrics.maxDrawdown !== undefined ? `${(run.metrics.maxDrawdown * 100).toFixed(2)}%` : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

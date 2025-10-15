import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

type DataDebugModalProps = {
  apiKey: string;
  apiSecret: string;
  onClose: () => void;
};

type DebugData = {
  active_strategies: any[];
  active_strategy_snapshots: any[];
  alpaca_positions: any[];
  alpaca_account: any[];
  calculated_attribution: any[];
};

const styles = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#fff",
    borderRadius: 12,
    maxWidth: "95vw",
    maxHeight: "90vh",
    width: 1400,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid #e6e6e6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#111",
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: 24,
    cursor: "pointer",
    color: "#666",
    padding: 0,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  tabsContainer: {
    borderBottom: "1px solid #e6e6e6",
    display: "flex",
    padding: "0 24px",
    background: "#fafafa",
  },
  tab: (isActive: boolean) => ({
    padding: "12px 16px",
    border: "none",
    background: isActive ? "#fff" : "transparent",
    color: isActive ? "#111" : "#666",
    fontWeight: isActive ? 600 : 400,
    fontSize: 14,
    cursor: "pointer",
    borderBottom: isActive ? "2px solid #1677ff" : "2px solid transparent",
    marginBottom: -1,
  }),
  content: {
    flex: 1,
    overflow: "auto",
    padding: 24,
  },
  tableContainer: {
    width: "100%",
    overflowX: "auto" as const,
    border: "1px solid #e6e6e6",
    borderRadius: 8,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
    fontFamily: "monospace",
  },
  th: {
    padding: "10px 12px",
    background: "#f5f5f5",
    borderBottom: "2px solid #e6e6e6",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 700,
    color: "#666",
    textTransform: "uppercase" as const,
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #f4f4f4",
    color: "#111",
  },
  loading: {
    padding: 40,
    textAlign: "center" as const,
    color: "#666",
    fontSize: 14,
  },
  error: {
    padding: 40,
    textAlign: "center" as const,
    color: "#b00020",
    fontSize: 14,
  },
  downloadButton: {
    background: "#1677ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 16,
  },
};

export function DataDebugModal({ apiKey, apiSecret, onClose }: DataDebugModalProps) {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof DebugData>("active_strategies");

  useEffect(() => {
    fetchDebugData();
  }, []);

  const fetchDebugData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_BASE}/api/debug/data`, {
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": apiSecret,
        },
        withCredentials: true,
        timeout: 30000,
      });

      setData(response.data);
    } catch (err: any) {
      console.error("Failed to fetch debug data:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to fetch debug data");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = (tableName: keyof DebugData) => {
    if (!data || !data[tableName] || data[tableName].length === 0) {
      alert("No data to download");
      return;
    }

    const rows = data[tableName];
    const headers = Object.keys(rows[0]);

    // Build CSV content
    let csvContent = headers.join(",") + "\n";

    for (const row of rows) {
      const values = headers.map(header => {
        const value = row[header];
        // Handle values that contain commas or quotes
        if (value === null || value === undefined) return "";
        const stringValue = String(value);
        if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvContent += values.join(",") + "\n";
    }

    // Create download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `${tableName}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderTable = (tableName: keyof DebugData) => {
    if (!data || !data[tableName] || data[tableName].length === 0) {
      return <div style={styles.loading}>No data available for {tableName}</div>;
    }

    const rows = data[tableName];
    const headers = Object.keys(rows[0]);

    return (
      <>
        <button
          style={styles.downloadButton}
          onClick={() => downloadCSV(tableName)}
        >
          Download CSV
        </button>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} style={styles.th}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, idx: number) => (
                <tr key={idx}>
                  {headers.map((header) => (
                    <td key={header} style={styles.td}>
                      {row[header] === null || row[header] === undefined
                        ? "—"
                        : String(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Data Debug View</div>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.tabsContainer}>
          <button
            style={styles.tab(activeTab === "active_strategies")}
            onClick={() => setActiveTab("active_strategies")}
          >
            active_strategies
          </button>
          <button
            style={styles.tab(activeTab === "active_strategy_snapshots")}
            onClick={() => setActiveTab("active_strategy_snapshots")}
          >
            active_strategy_snapshots
          </button>
          <button
            style={styles.tab(activeTab === "alpaca_positions")}
            onClick={() => setActiveTab("alpaca_positions")}
          >
            Alpaca Positions
          </button>
          <button
            style={styles.tab(activeTab === "alpaca_account")}
            onClick={() => setActiveTab("alpaca_account")}
          >
            Alpaca Account
          </button>
          <button
            style={styles.tab(activeTab === "calculated_attribution")}
            onClick={() => setActiveTab("calculated_attribution")}
          >
            Calculated Attribution
          </button>
        </div>

        <div style={styles.content}>
          {loading ? (
            <div style={styles.loading}>Loading debug data...</div>
          ) : error ? (
            <div style={styles.error}>{error}</div>
          ) : (
            renderTable(activeTab)
          )}
        </div>
      </div>
    </div>
  );
}

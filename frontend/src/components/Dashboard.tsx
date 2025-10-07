import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

type AccountInfo = {
  id: string;
  account_number: string;
  status: string;
  crypto_status?: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
  account_type?: string;
};

type StrategyHolding = {
  symbol: string;
  qty: number;
  marketValue: number;
};

type ActiveStrategy = {
  id: string;
  name: string;
  investAmount: number;
  currentValue: number;
  totalReturn?: number;
  totalReturnPct?: number;
  createdAt: string;
  lastRebalance: string | null;
  holdings: StrategyHolding[];
  flowData?: {
    nodes: any[];
    edges: any[];
    globals?: any;
  };
};

type StrategySnapshot = {
  strategyId: string;
  date: string;
  timestamp: string;
  portfolioValue: number;
  holdings: Array<{
    symbol: string;
    qty: number;
    price: number;
    value: number;
  }>;
  totalReturn: number;
  totalReturnPct: number;
  rebalanceType?: "initial" | "daily" | "liquidation";
};

export type DashboardProps = {
  apiKey: string;
  apiSecret: string;
  mask: boolean;
  connected: boolean | null;
  onApiKeyChange: (key: string) => void;
  onApiSecretChange: (secret: string) => void;
  onMaskToggle: () => void;
  onViewStrategyFlow?: (flowData: { nodes: any[]; edges: any[] }) => void;
};

const styles = {
  label: {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 6,
    color: "#333",
  } as React.CSSProperties,

  input: {
    width: "100%",
    padding: "8px 10px",
    background: "#fff",
    color: "#111",
    border: "1px solid #cfcfcf",
    borderRadius: 6,
    outline: "none",
  } as React.CSSProperties,

  btn: {
    background: "#1677ff",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,

  credsGrid: {
    display: "grid",
    gridTemplateColumns: "1.7fr 1.7fr auto",
    gap: 10,
    alignItems: "end",
    marginBottom: 16,
  } as React.CSSProperties,

  badge: (ok: boolean | null) =>
    ({
      fontSize: 12,
      padding: "6px 10px",
      borderRadius: 999,
      alignSelf: "center",
      background: ok ? "#e8f5ed" : "#fdecea",
      color: ok ? "#0f7a3a" : "#b00020",
      border: `1px solid ${ok ? "#b7e3c8" : "#f2c0c0"}`,
    } as React.CSSProperties),

  accountTypeBadge: (isPaper: boolean) =>
    ({
      fontSize: 12,
      padding: "6px 12px",
      borderRadius: 6,
      fontWeight: 700,
      background: isPaper ? "#fff3e0" : "#e8f5ed",
      color: isPaper ? "#e65100" : "#0f7a3a",
      border: `1px solid ${isPaper ? "#ffb74d" : "#b7e3c8"}`,
    } as React.CSSProperties),

  card: {
    border: "1px solid #e6e6e6",
    borderRadius: 10,
    padding: 16,
    background: "#fafafa",
    marginBottom: 16,
  } as React.CSSProperties,

  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 12,
    color: "#111",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,

  compactGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  } as React.CSSProperties,

  compactItem: {
    padding: "8px 10px",
    background: "#fff",
    border: "1px solid #e6e6e6",
    borderRadius: 6,
  } as React.CSSProperties,

  compactLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 3,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,

  compactValue: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111",
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  } as React.CSSProperties,

  tableHeader: {
    textAlign: "left" as const,
    padding: "10px 12px",
    borderBottom: "2px solid #e6e6e6",
    fontSize: 11,
    fontWeight: 700,
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,

  tableCell: {
    padding: "12px",
    borderBottom: "1px solid #f4f4f4",
  } as React.CSSProperties,

  emptyState: {
    padding: "40px 20px",
    textAlign: "center" as const,
    color: "#999",
    fontSize: 14,
  } as React.CSSProperties,
};

// Simple SVG Line Chart Component
function PerformanceChart({ snapshots }: { snapshots: StrategySnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <div style={{
        border: "1px dashed #ddd",
        borderRadius: 8,
        padding: 20,
        background: "#fafafa",
        textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 8 }}>
          Live Returns Graph
        </div>
        <div style={{ fontSize: 12, color: "#999" }}>
          Daily performance data will appear after first rebalance
        </div>
      </div>
    );
  }

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get min and max return percentages
  const returnPcts = snapshots.map(s => s.totalReturnPct);
  const minReturn = Math.min(0, ...returnPcts);
  const maxReturn = Math.max(0, ...returnPcts);
  const returnRange = maxReturn - minReturn || 1;

  // Map snapshots to points
  const points = snapshots.map((snapshot, i) => {
    const x = padding.left + (i / (snapshots.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((snapshot.totalReturnPct - minReturn) / returnRange) * chartHeight;
    return { x, y, snapshot };
  });

  // Create SVG path
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

  // Format date for x-axis
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div style={{
      border: "1px solid #e6e6e6",
      borderRadius: 8,
      padding: 16,
      background: "#fff",
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 12 }}>
        Live Returns Graph
      </div>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {/* Grid lines */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight / 2}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight / 2}
          stroke="#e6e6e6"
          strokeDasharray="3,3"
        />

        {/* Zero line (if in range) */}
        {minReturn <= 0 && maxReturn >= 0 && (
          <line
            x1={padding.left}
            y1={padding.top + chartHeight - ((-minReturn) / returnRange) * chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight - ((-minReturn) / returnRange) * chartHeight}
            stroke="#999"
            strokeWidth={1}
          />
        )}

        {/* Chart line */}
        <path
          d={pathData}
          fill="none"
          stroke="#1677ff"
          strokeWidth={2}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="#1677ff"
          >
            <title>{`${formatDate(p.snapshot.date)}: ${p.snapshot.totalReturnPct > 0 ? '+' : ''}${p.snapshot.totalReturnPct.toFixed(2)}%`}</title>
          </circle>
        ))}

        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="#333"
          strokeWidth={1}
        />

        {/* X-axis */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
          stroke="#333"
          strokeWidth={1}
        />

        {/* Y-axis labels */}
        <text x={padding.left - 10} y={padding.top} textAnchor="end" fontSize={10} fill="#666">
          {maxReturn.toFixed(1)}%
        </text>
        <text x={padding.left - 10} y={padding.top + chartHeight / 2 + 4} textAnchor="end" fontSize={10} fill="#666">
          {((minReturn + maxReturn) / 2).toFixed(1)}%
        </text>
        <text x={padding.left - 10} y={padding.top + chartHeight + 4} textAnchor="end" fontSize={10} fill="#666">
          {minReturn.toFixed(1)}%
        </text>

        {/* X-axis labels */}
        {points.map((p, i) => {
          // Show labels for first, last, and evenly spaced points
          const showLabel = i === 0 || i === points.length - 1 || (points.length > 5 && i % Math.ceil(points.length / 5) === 0);
          if (!showLabel) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={padding.top + chartHeight + 20}
              textAnchor="middle"
              fontSize={10}
              fill="#666"
            >
              {formatDate(p.snapshot.date)}
            </text>
          );
        })}

        {/* Y-axis label */}
        <text
          x={-height / 2}
          y={15}
          transform={`rotate(-90)`}
          textAnchor="middle"
          fontSize={11}
          fill="#666"
          fontWeight={600}
        >
          Return (%)
        </text>

        {/* X-axis label */}
        <text
          x={padding.left + chartWidth / 2}
          y={height - 5}
          textAnchor="middle"
          fontSize={11}
          fill="#666"
          fontWeight={600}
        >
          Date
        </text>
      </svg>
    </div>
  );
}

export function Dashboard({
  apiKey,
  apiSecret,
  mask,
  connected,
  onApiKeyChange,
  onApiSecretChange,
  onMaskToggle,
  onViewStrategyFlow,
}: DashboardProps) {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<ActiveStrategy | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [liquidating, setLiquidating] = useState(false);
  const [snapshots, setSnapshots] = useState<StrategySnapshot[]>([]);

  // Fetch account info
  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setAccountInfo(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/account`, {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          timeout: 10000,
        });

        if (!cancelled) {
          setAccountInfo(response.data);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to fetch account info:", err);
          setError(
            err?.response?.data?.error ||
              err?.message ||
              "Failed to fetch account information"
          );
          setAccountInfo(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, apiSecret]);

  // Fetch active strategy
  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setActiveStrategy(null);
      return;
    }

    let cancelled = false;
    setStrategyLoading(true);

    const fetchStrategy = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/strategy`, {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          timeout: 10000,
        });

        if (!cancelled) {
          setActiveStrategy(response.data.strategy);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to fetch strategy:", err);
          setActiveStrategy(null);
        }
      } finally {
        if (!cancelled) {
          setStrategyLoading(false);
        }
      }
    };

    fetchStrategy();

    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchStrategy, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiKey, apiSecret]);

  // Fetch snapshots for active strategy
  useEffect(() => {
    if (!apiKey || !apiSecret || !activeStrategy) {
      setSnapshots([]);
      return;
    }

    let cancelled = false;

    const fetchSnapshots = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/strategy/snapshots`, {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          timeout: 10000,
        });

        if (!cancelled && response.data.snapshots) {
          setSnapshots(response.data.snapshots);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to fetch snapshots:", err);
          setSnapshots([]);
        }
      }
    };

    fetchSnapshots();

    // Poll every 30 seconds to get latest snapshots
    const interval = setInterval(fetchSnapshots, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiKey, apiSecret, activeStrategy]);

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (!Number.isFinite(num)) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // const formatPercent = (value: number) => {
  //   if (!Number.isFinite(value)) return "0.00%";
  //   return `${(value * 100).toFixed(2)}%`;
  // };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const handleLiquidate = async () => {
    if (!activeStrategy || !apiKey || !apiSecret) return;

    const confirmed = window.confirm(
      `Are you sure you want to liquidate "${activeStrategy.name}"?\n\n` +
      `This will sell all positions ${activeStrategy.currentValue > 0 ? "immediately or at next market open" : "when market opens"}.`
    );

    if (!confirmed) return;

    setLiquidating(true);

    try {
      const response = await axios.post(
        `${API_BASE}/api/liquidate`,
        {},
        {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          timeout: 120000, // 2 minute timeout
        }
      );

      if (response.data.success) {
        alert(
          `Strategy liquidated successfully!\n\n` +
          `Sold positions: ${response.data.soldPositions.map((p: any) => `${p.qty.toFixed(4)} ${p.symbol}`).join(", ")}\n` +
          `Total proceeds: $${response.data.totalProceeds.toFixed(2)}`
        );
        setActiveStrategy(null); // Clear strategy from UI
      }
    } catch (err: any) {
      console.error("Liquidation failed:", err);
      alert(
        `Failed to liquidate strategy:\n${err?.response?.data?.error || err?.message || "Unknown error"}`
      );
    } finally {
      setLiquidating(false);
    }
  };

  // Detect if this is a paper account (usually paper accounts have "PA" prefix or account_type field)
  const isPaperAccount = accountInfo
    ? accountInfo.account_number?.startsWith("PA") ||
      accountInfo.account_type === "paper"
    : false;

  return (
    <div>
      <details style={{ marginBottom: 16 }} open>
        <summary style={{ cursor: "pointer", userSelect: "none", display: "list-item", listStylePosition: "inside" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, verticalAlign: "middle" }}>
            <span>Credentials</span>
            <span style={styles.badge(connected)}>
              {connected === null ? "…" : connected ? "connected" : "not connected"}
            </span>
          </span>
        </summary>

        <div style={{ ...styles.credsGrid, marginTop: 10 }}>
          <div>
            <div style={styles.label}>API Key</div>
            <input
              style={styles.input}
              type={mask ? "password" : "text"}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Your Alpaca API Key"
              autoComplete="off"
            />
          </div>
          <div>
            <div style={styles.label}>API Secret</div>
            <input
              style={styles.input}
              type={mask ? "password" : "text"}
              value={apiSecret}
              onChange={(e) => onApiSecretChange(e.target.value)}
              placeholder="Your Alpaca API Secret"
              autoComplete="off"
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <button
              type="button"
              onClick={onMaskToggle}
              style={{ ...styles.btn, background: "#666" }}
            >
              {mask ? "Show" : "Hide"}
            </button>
          </div>
        </div>
      </details>

      {!apiKey || !apiSecret ? (
        <div style={styles.card}>
          <div style={{ fontSize: 14, color: "#666" }}>
            Enter your Alpaca API credentials above to view account information.
          </div>
        </div>
      ) : loading ? (
        <div style={styles.card}>
          <div style={{ fontSize: 14, color: "#666" }}>
            Loading account information...
          </div>
        </div>
      ) : error ? (
        <div
          style={{
            ...styles.card,
            background: "#fdecea",
            border: "1px solid #f2c0c0",
          }}
        >
          <div style={{ fontSize: 14, color: "#b00020", fontWeight: 600 }}>
            Error loading account information
          </div>
          <div style={{ fontSize: 13, color: "#b00020", marginTop: 6 }}>
            {error}
          </div>
        </div>
      ) : accountInfo ? (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitle}>
              <span>Account Summary</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={styles.accountTypeBadge(isPaperAccount)}>
                  {isPaperAccount ? "PAPER ACCOUNT" : "LIVE ACCOUNT"}
                </div>
                <span style={{ fontSize: 12, color: "#666" }}>
                  Alpaca {accountInfo.account_number}
                </span>
              </div>
            </div>
            <div style={styles.compactGrid}>
              <div style={styles.compactItem}>
                <div style={styles.compactLabel}>Portfolio Value</div>
                <div style={styles.compactValue}>
                  {formatCurrency(accountInfo.portfolio_value)}
                </div>
              </div>
              <div style={styles.compactItem}>
                <div style={styles.compactLabel}>Cash</div>
                <div style={styles.compactValue}>
                  {formatCurrency(accountInfo.cash)}
                </div>
              </div>
              <div style={styles.compactItem}>
                <div style={styles.compactLabel}>Buying Power</div>
                <div style={styles.compactValue}>
                  {formatCurrency(accountInfo.buying_power)}
                </div>
              </div>
              <div style={styles.compactItem}>
                <div style={styles.compactLabel}>Equity</div>
                <div style={styles.compactValue}>
                  {formatCurrency(accountInfo.equity)}
                </div>
              </div>
              <div style={styles.compactItem}>
                <div style={styles.compactLabel}>Long Value</div>
                <div style={styles.compactValue}>
                  {formatCurrency(accountInfo.long_market_value)}
                </div>
              </div>
              <div style={styles.compactItem}>
                <div style={styles.compactLabel}>Status</div>
                <div style={{ ...styles.compactValue, fontSize: 13 }}>
                  {accountInfo.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Active Strategy</div>
            {strategyLoading ? (
              <div style={styles.emptyState}>Loading strategy...</div>
            ) : !activeStrategy ? (
              <div style={styles.emptyState}>
                No active strategy. Deploy a Flow to start live trading.
              </div>
            ) : (
              <details open>
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <table style={{ ...styles.table, marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={styles.tableHeader}>Strategy</th>
                        <th style={styles.tableHeader}>Status</th>
                        <th style={styles.tableHeader}>Net Deposits</th>
                        <th style={styles.tableHeader}>Current Value</th>
                        <th style={styles.tableHeader}>Return %</th>
                        <th style={{ ...styles.tableHeader, textAlign: "right" as const }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...styles.tableCell, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18, color: "#999" }}>▸</span>
                          <div>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onViewStrategyFlow && activeStrategy.flowData) {
                                  onViewStrategyFlow(activeStrategy.flowData);
                                }
                              }}
                              style={{
                                cursor: onViewStrategyFlow && activeStrategy.flowData ? "pointer" : "default",
                                color: "#1677ff",
                                fontWeight: 600,
                              }}
                              onMouseEnter={(e) => {
                                if (onViewStrategyFlow && activeStrategy.flowData) {
                                  e.currentTarget.style.textDecoration = "underline";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = "none";
                              }}
                              title={onViewStrategyFlow && activeStrategy.flowData ? "Click to view strategy logic in Flow Builder" : undefined}
                            >
                              {activeStrategy.name}
                            </div>
                            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                              Started {formatDate(activeStrategy.createdAt)}
                            </div>
                          </div>
                        </td>
                        <td style={styles.tableCell}>
                          {activeStrategy.currentValue === 0 ? (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "#fff3e0",
                              color: "#e65100",
                              border: "1px solid #ffb74d",
                            }}>
                              PENDING
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "#e8f5ed",
                              color: "#0f7a3a",
                              border: "1px solid #b7e3c8",
                            }}>
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td style={styles.tableCell}>
                          <strong>{formatCurrency(activeStrategy.investAmount)}</strong>
                        </td>
                        <td style={styles.tableCell}>
                          <strong>
                            {activeStrategy.currentValue === 0
                              ? "Pending"
                              : formatCurrency(activeStrategy.currentValue)}
                          </strong>
                        </td>
                        <td style={styles.tableCell}>
                          <strong style={{
                            color: activeStrategy.currentValue === 0
                              ? "#666"
                              : activeStrategy.totalReturnPct && activeStrategy.totalReturnPct > 0
                              ? "#0f7a3a"
                              : activeStrategy.totalReturnPct && activeStrategy.totalReturnPct < 0
                              ? "#b00020"
                              : "#111",
                          }}>
                            {activeStrategy.currentValue === 0
                              ? "—"
                              : activeStrategy.totalReturnPct !== undefined
                              ? `${activeStrategy.totalReturnPct > 0 ? '+' : ''}${activeStrategy.totalReturnPct.toFixed(2)}%`
                              : "—"}
                          </strong>
                        </td>
                        <td style={{ ...styles.tableCell, textAlign: "right" as const }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLiquidate();
                            }}
                            disabled={liquidating}
                            style={{
                              background: "#b00020",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              padding: "6px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: liquidating ? "not-allowed" : "pointer",
                              opacity: liquidating ? 0.6 : 1,
                            }}
                          >
                            {liquidating ? "Liquidating..." : "Liquidate"}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </summary>

                <div style={{ marginTop: 16, paddingLeft: 26 }}>
                  {/* Live Returns Graph */}
                  <PerformanceChart snapshots={snapshots} />

                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.tableHeader}>Symbol</th>
                        <th style={styles.tableHeader}>Quantity</th>
                        <th style={styles.tableHeader}>Market Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStrategy.holdings.map((holding) => (
                        <tr key={holding.symbol}>
                          <td style={styles.tableCell}>
                            <strong>{holding.symbol}</strong>
                          </td>
                          <td style={styles.tableCell}>
                            {holding.qty.toFixed(4)}
                          </td>
                          <td style={styles.tableCell}>
                            {formatCurrency(holding.marketValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

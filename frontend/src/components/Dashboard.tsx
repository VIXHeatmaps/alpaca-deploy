import React, { useEffect, useState } from "react";
import axios from "axios";
import { DataDebugModal } from "./DataDebugModal";

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
  status?: string;
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

type AccountPosition = {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  side: string;
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
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [liquidatingStrategies, setLiquidatingStrategies] = useState<Set<string>>(new Set());
  const [snapshotsByStrategy, setSnapshotsByStrategy] = useState<Record<string, StrategySnapshot[]>>({});
  const [positions, setPositions] = useState<AccountPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [showDataDebug, setShowDataDebug] = useState(false);

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

  // Fetch active strategies from database
  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setActiveStrategies([]);
      return;
    }

    let cancelled = false;
    setStrategyLoading(true);

    const fetchStrategy = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/active-strategies`, {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          timeout: 10000,
        });

        if (!cancelled && response.data.strategies && response.data.strategies.length > 0) {
          // Map all strategies to ActiveStrategy format
          const mappedStrategies = response.data.strategies.map((dbStrategy: any) => ({
            id: String(dbStrategy.id),
            name: dbStrategy.name,
            status: dbStrategy.status,
            investAmount: dbStrategy.initial_capital,
            currentValue: dbStrategy.current_capital || 0,
            totalReturn: dbStrategy.totalReturn || 0,
            totalReturnPct: dbStrategy.totalReturnPct || 0,
            createdAt: dbStrategy.started_at,
            lastRebalance: dbStrategy.last_rebalance_at,
            holdings: dbStrategy.holdings || [],
            flowData: undefined,
          }));
          setActiveStrategies(mappedStrategies);
        } else if (!cancelled) {
          setActiveStrategies([]);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to fetch strategy:", err);
          setActiveStrategies([]);
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

  // Fetch snapshots for all strategies
  useEffect(() => {
    if (!apiKey || !apiSecret || activeStrategies.length === 0) {
      setSnapshotsByStrategy({});
      return;
    }

    let cancelled = false;

    const fetchAllSnapshots = async () => {
      const snapshotsMap: Record<string, StrategySnapshot[]> = {};

      for (const strategy of activeStrategies) {
        try {
          const response = await axios.get(`${API_BASE}/api/active-strategies/${strategy.id}/snapshots`, {
            headers: {
              "APCA-API-KEY-ID": apiKey,
              "APCA-API-SECRET-KEY": apiSecret,
            },
            withCredentials: true,
            timeout: 10000,
          });

          if (!cancelled && response.data.snapshots) {
            const mappedSnapshots = response.data.snapshots.map((s: any) => ({
              strategyId: strategy.id,
              date: s.date,
              timestamp: s.snapshot_date,
              portfolioValue: s.equity,
              totalReturn: s.total_return || 0,
              totalReturnPct: (s.cumulative_return || 0) * 100,
              holdings: s.holdings || [],
              rebalanceType: s.rebalance_type,
            }));
            snapshotsMap[strategy.id] = mappedSnapshots;
          }
        } catch (err: any) {
          console.error(`Failed to fetch snapshots for strategy ${strategy.id}:`, err);
          snapshotsMap[strategy.id] = [];
        }
      }

      if (!cancelled) {
        setSnapshotsByStrategy(snapshotsMap);
      }
    };

    fetchAllSnapshots();

    const interval = setInterval(fetchAllSnapshots, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiKey, apiSecret, activeStrategies]);

  // Fetch account positions
  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setPositions([]);
      return;
    }

    let cancelled = false;
    setPositionsLoading(true);

    const fetchPositions = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/positions`, {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          timeout: 10000,
        });

        if (!cancelled && response.data.positions) {
          setPositions(response.data.positions);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to fetch positions:", err);
          setPositions([]);
        }
      } finally {
        if (!cancelled) {
          setPositionsLoading(false);
        }
      }
    };

    fetchPositions();

    // Poll every 30 seconds to get latest positions
    const interval = setInterval(fetchPositions, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiKey, apiSecret]);

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

  const handleLiquidate = async (strategy: ActiveStrategy) => {
    if (!apiKey || !apiSecret) return;

    const confirmed = window.confirm(
      `Are you sure you want to liquidate "${strategy.name}"?\n\n` +
      `This will sell all positions ${strategy.currentValue > 0 ? "immediately or at next market open" : "when market opens"}.`
    );

    if (!confirmed) return;

    setLiquidatingStrategies(prev => new Set(prev).add(strategy.id));

    try {
      const response = await axios.post(
        `${API_BASE}/api/strategy/${strategy.id}/liquidate`,
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
        // Strategy will be removed from list on next fetch
      }
    } catch (err: any) {
      console.error("Liquidation failed:", err);
      alert(
        `Failed to liquidate strategy:\n${err?.response?.data?.error || err?.message || "Unknown error"}`
      );
    } finally {
      setLiquidatingStrategies(prev => {
        const next = new Set(prev);
        next.delete(strategy.id);
        return next;
      });
    }
  };

  // Detect if this is a paper account (usually paper accounts have "PA" prefix or account_type field)
  const isPaperAccount = accountInfo
    ? accountInfo.account_number?.startsWith("PA") ||
      accountInfo.account_type === "paper"
    : false;

  return (
    <div>
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
                <button
                  onClick={() => setShowDataDebug(true)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "#e8f5ed",
                    color: "#0f7a3a",
                    border: "1px solid #b7e3c8",
                    cursor: "pointer",
                  }}
                >
                  DATA
                </button>
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
            <div style={styles.cardTitle}>Active Strategies</div>
            {strategyLoading ? (
              <div style={styles.emptyState}>Loading strategies...</div>
            ) : activeStrategies.length === 0 ? (
              <div style={styles.emptyState}>
                No active strategies. Deploy a Strategy to start live trading.
              </div>
            ) : (
              <div>
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
                    {activeStrategies.map((strategy) => (
                      <React.Fragment key={strategy.id}>
                        <tr onClick={() => {
                          const detailsEl = document.getElementById(`strategy-details-${strategy.id}`) as HTMLDetailsElement;
                          if (detailsEl) detailsEl.open = !detailsEl.open;
                        }} style={{ cursor: "pointer" }}>
                            <td style={{ ...styles.tableCell, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 14, color: "#999" }}>▸</span>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onViewStrategyFlow && strategy.flowData) {
                                    onViewStrategyFlow(strategy.flowData);
                                  }
                                }}
                                style={{
                                  cursor: onViewStrategyFlow && strategy.flowData ? "pointer" : "default",
                                  color: "#1677ff",
                                  fontWeight: 600,
                                }}
                                onMouseEnter={(e) => {
                                  if (onViewStrategyFlow && strategy.flowData) {
                                    e.currentTarget.style.textDecoration = "underline";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.textDecoration = "none";
                                }}
                                title={onViewStrategyFlow && strategy.flowData ? "Click to view strategy logic in Flow Builder" : undefined}
                              >
                                {strategy.name}
                              </div>
                            </td>
                            <td style={styles.tableCell}>
                              {strategy.status === 'liquidating' ? (
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  background: "#fce4ec",
                                  color: "#b00020",
                                  border: "1px solid #f48fb1",
                                }}>
                                  LIQUIDATING
                                </span>
                              ) : strategy.holdings.length > 0 ? (
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  background: "#e8f5ed",
                                  color: "#0f7a3a",
                                  border: "1px solid #b7e3c8",
                                }}>
                                  LIVE
                                </span>
                              ) : (
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
                              )}
                            </td>
                            <td style={styles.tableCell}>
                              <strong>{formatCurrency(strategy.investAmount)}</strong>
                            </td>
                            <td style={styles.tableCell}>
                              <strong>
                                {strategy.currentValue === 0
                                  ? "—"
                                  : formatCurrency(strategy.currentValue)}
                              </strong>
                            </td>
                            <td style={styles.tableCell}>
                              <strong style={{
                                color: strategy.currentValue === 0
                                  ? "#666"
                                  : strategy.totalReturnPct && strategy.totalReturnPct > 0
                                  ? "#0f7a3a"
                                  : strategy.totalReturnPct && strategy.totalReturnPct < 0
                                  ? "#b00020"
                                  : "#111",
                              }}>
                                {strategy.currentValue === 0
                                  ? "—"
                                  : strategy.totalReturnPct !== undefined
                                  ? `${strategy.totalReturnPct > 0 ? '+' : ''}${strategy.totalReturnPct.toFixed(2)}%`
                                  : "—"}
                              </strong>
                            </td>
                            <td style={{ ...styles.tableCell, textAlign: "right" as const }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLiquidate(strategy);
                                }}
                                disabled={liquidatingStrategies.has(strategy.id)}
                                style={{
                                  background: "#b00020",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 4,
                                  padding: "6px 10px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: liquidatingStrategies.has(strategy.id) ? "not-allowed" : "pointer",
                                  opacity: liquidatingStrategies.has(strategy.id) ? 0.6 : 1,
                                }}
                              >
                                {liquidatingStrategies.has(strategy.id) ? "Liquidating..." : "Liquidate"}
                              </button>
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={6} style={{ padding: 0, border: "none" }}>
                              <details id={`strategy-details-${strategy.id}`}>
                                <summary style={{ display: "none" }}></summary>
                                <div style={{ marginTop: 16, paddingLeft: 26, paddingRight: 16, paddingBottom: 16 }}>
                                  {/* Live Returns Graph */}
                                  <PerformanceChart snapshots={snapshotsByStrategy[strategy.id] || []} />

                                  {/* Current Holdings */}
                                  <div style={{ marginTop: 20, marginBottom: 16 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                                      Current Holdings
                                    </div>
                                    {strategy.holdings.length === 0 ? (
                                      <div style={{ padding: 12, fontSize: 12, color: "#666", background: "#f9fafb", borderRadius: 4 }}>
                                        No holdings yet - strategy will execute during next trade window
                                      </div>
                                    ) : (
                                      <table style={styles.table}>
                                        <thead>
                                          <tr>
                                            <th style={styles.tableHeader}>Symbol</th>
                                            <th style={styles.tableHeader}>Quantity</th>
                                            <th style={styles.tableHeader}>Entry Price</th>
                                            <th style={styles.tableHeader}>Value</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {strategy.holdings.map((holding) => (
                                            <tr key={holding.symbol}>
                                              <td style={styles.tableCell}>
                                                <strong>{holding.symbol}</strong>
                                              </td>
                                              <td style={styles.tableCell}>
                                                {holding.qty.toFixed(4)}
                                              </td>
                                              <td style={styles.tableCell}>
                                                ${(holding.marketValue / holding.qty).toFixed(2)}
                                              </td>
                                              <td style={styles.tableCell}>
                                                {formatCurrency(holding.marketValue)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>

                                  {/* Historical Snapshots */}
                                  {(snapshotsByStrategy[strategy.id] || []).length > 0 && (
                                    <details style={{ marginTop: 16 }}>
                                      <summary style={{
                                        cursor: "pointer",
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "#374151",
                                        padding: "8px 0"
                                      }}>
                                        Historical Snapshots ({(snapshotsByStrategy[strategy.id] || []).length} days) ▼
                                      </summary>
                                      <div style={{ marginTop: 12, maxHeight: 400, overflow: "auto" }}>
                                        <table style={styles.table}>
                                          <thead>
                                            <tr>
                                              <th style={styles.tableHeader}>Date</th>
                                              <th style={styles.tableHeader}>Equity</th>
                                              <th style={styles.tableHeader}>Return $</th>
                                              <th style={styles.tableHeader}>Return %</th>
                                              <th style={styles.tableHeader}>Holdings</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {[...(snapshotsByStrategy[strategy.id] || [])].reverse().map((snap) => (
                                              <tr key={snap.date}>
                                                <td style={{...styles.tableCell, fontFamily: "monospace", fontSize: 11}}>
                                                  {snap.date}
                                                </td>
                                                <td style={styles.tableCell}>
                                                  {formatCurrency(snap.portfolioValue)}
                                                </td>
                                                <td style={{
                                                  ...styles.tableCell,
                                                  color: snap.totalReturn >= 0 ? "#059669" : "#dc2626",
                                                  fontWeight: 600
                                                }}>
                                                  {snap.totalReturn >= 0 ? "+" : ""}{formatCurrency(snap.totalReturn)}
                                                </td>
                                                <td style={{
                                                  ...styles.tableCell,
                                                  color: snap.totalReturnPct >= 0 ? "#059669" : "#dc2626",
                                                  fontWeight: 600
                                                }}>
                                                  {snap.totalReturnPct >= 0 ? "+" : ""}{snap.totalReturnPct.toFixed(2)}%
                                                </td>
                                                <td style={{...styles.tableCell, fontSize: 11}}>
                                                  {snap.holdings.map((h: any) => `${h.symbol}: ${h.qty.toFixed(2)}`).join(", ") || "-"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              </details>
                            </td>
                          </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Current Account Holdings */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Current Account Holdings</div>
            {positionsLoading ? (
              <div style={styles.emptyState}>Loading positions...</div>
            ) : positions.length === 0 ? (
              <div style={styles.emptyState}>No positions in account</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Symbol</th>
                    <th style={styles.tableHeader}>Quantity</th>
                    <th style={styles.tableHeader}>Avg Entry</th>
                    <th style={styles.tableHeader}>Current Price</th>
                    <th style={styles.tableHeader}>Market Value</th>
                    <th style={styles.tableHeader}>Cost Basis</th>
                    <th style={styles.tableHeader}>Unrealized P/L</th>
                    <th style={styles.tableHeader}>Return %</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={position.symbol}>
                      <td style={styles.tableCell}>
                        <strong>{position.symbol}</strong>
                      </td>
                      <td style={styles.tableCell}>
                        {position.qty.toFixed(4)}
                      </td>
                      <td style={styles.tableCell}>
                        {formatCurrency(position.avgEntryPrice)}
                      </td>
                      <td style={styles.tableCell}>
                        {formatCurrency(position.currentPrice)}
                      </td>
                      <td style={styles.tableCell}>
                        <strong>{formatCurrency(position.marketValue)}</strong>
                      </td>
                      <td style={styles.tableCell}>
                        {formatCurrency(position.costBasis)}
                      </td>
                      <td style={{
                        ...styles.tableCell,
                        color: position.unrealizedPl >= 0 ? "#0f7a3a" : "#b00020",
                        fontWeight: 600,
                      }}>
                        {position.unrealizedPl >= 0 ? "+" : ""}{formatCurrency(position.unrealizedPl)}
                      </td>
                      <td style={{
                        ...styles.tableCell,
                        color: position.unrealizedPlpc >= 0 ? "#0f7a3a" : "#b00020",
                        fontWeight: 600,
                      }}>
                        {position.unrealizedPlpc >= 0 ? "+" : ""}{(position.unrealizedPlpc * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {showDataDebug && apiKey && apiSecret && (
        <DataDebugModal
          apiKey={apiKey}
          apiSecret={apiSecret}
          onClose={() => setShowDataDebug(false)}
        />
      )}
    </div>
  );
}

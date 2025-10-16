/**
 * Portfolio Holdings Component
 *
 * Displays total Alpaca positions with attribution breakdown per strategy
 * Matches the styling of Dashboard Account Summary and Active Strategies
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

type StrategyAttribution = {
  strategyId: number;
  strategyName: string;
  allocationPct: number; // 0.0 to 1.0
  qty: number;
  marketValue: number;
};

type Holding = {
  symbol: string;
  qty: number;
  marketValue: number;
  weight: number; // % of total portfolio
  strategies: StrategyAttribution[];
};

type PortfolioData = {
  totalPortfolioValue: number;
  totalPositionsValue: number;
  cashBalance: number;
  holdings: Holding[];
  cashRemainderStrategies: Array<{
    strategyId: number;
    strategyName: string;
    cashAmount: number;
  }>;
};

const styles = {
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

  tableHeaderRight: {
    textAlign: "right" as const,
    padding: "10px 12px",
    borderBottom: "2px solid #e6e6e6",
    fontSize: 11,
    fontWeight: 700,
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,

  tableHeaderCenter: {
    textAlign: "center" as const,
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

  tableCellRight: {
    padding: "12px",
    borderBottom: "1px solid #f4f4f4",
    textAlign: "right" as const,
  } as React.CSSProperties,

  tableCellCenter: {
    padding: "12px",
    borderBottom: "1px solid #f4f4f4",
    textAlign: "center" as const,
  } as React.CSSProperties,

  emptyState: {
    padding: "40px 20px",
    textAlign: "center" as const,
    color: "#999",
    fontSize: 14,
  } as React.CSSProperties,

  expandButton: {
    background: "transparent",
    border: "none",
    color: "#1677ff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
  } as React.CSSProperties,

  attributionBox: {
    background: "#fff",
    border: "1px solid #e6e6e6",
    borderRadius: 6,
    padding: 12,
    marginLeft: 24,
    marginTop: 8,
    marginBottom: 8,
  } as React.CSSProperties,

  attributionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,

  validationBadge: (isValid: boolean) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 8px",
    borderRadius: 4,
    background: isValid ? "#e8f5ed" : "#fdecea",
    color: isValid ? "#0f7a3a" : "#b00020",
    border: `1px solid ${isValid ? "#b7e3c8" : "#f2c0c0"}`,
    display: "inline-block",
  } as React.CSSProperties),
};

type PortfolioHoldingsProps = {
  apiKey: string;
  apiSecret: string;
};

export default function PortfolioHoldings({ apiKey, apiSecret }: PortfolioHoldingsProps) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    try {
      // Don't fetch if no credentials
      if (!apiKey || !apiSecret) {
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_BASE}/api/portfolio/holdings`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        withCredentials: true,
        timeout: 10000,
      });

      setData(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch portfolio holdings:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch portfolio holdings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [apiKey, apiSecret]);

  const toggleRow = (symbol: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(symbol)) {
      newExpanded.delete(symbol);
    } else {
      newExpanded.add(symbol);
    }
    setExpandedRows(newExpanded);
  };

  const validateAttribution = (holding: Holding): boolean => {
    const totalPct = holding.strategies.reduce((sum, s) => sum + s.allocationPct, 0);
    const tolerance = 0.001; // 0.1% tolerance
    return Math.abs(totalPct - 1.0) < tolerance;
  };

  const isEmpty = !data || (data.holdings.length === 0 && data.cashBalance === 0);

  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardTitle, justifyContent: 'flex-start' }}>Portfolio Holdings</div>

      {loading ? (
        <div style={styles.emptyState}>Loading portfolio holdings...</div>
      ) : error ? (
        <div style={{ ...styles.emptyState, color: "#b00020" }}>
          Error: {error}
        </div>
      ) : isEmpty ? (
        <div style={styles.emptyState}>
          No positions yet. Deploy a strategy to see holdings here.
        </div>
      ) : (
        <table style={{ ...styles.table, tableLayout: 'fixed' as const }}>
          <colgroup>
            <col style={{ width: '40px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '140px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={styles.tableHeader}></th>
              <th style={styles.tableHeader}>Symbol</th>
              <th style={styles.tableHeaderRight}>Quantity</th>
              <th style={styles.tableHeaderRight}>Market Value</th>
              <th style={styles.tableHeaderRight}>Weight</th>
              <th style={styles.tableHeaderCenter}>Attribution</th>
            </tr>
          </thead>
          <tbody>
            {data && data.holdings.map((holding) => {
              const isExpanded = expandedRows.has(holding.symbol);
              const isValid = validateAttribution(holding);

              return (
                <React.Fragment key={holding.symbol}>
                  {/* Main Row */}
                  <tr>
                    <td style={styles.tableCell}>
                      <button
                        onClick={() => toggleRow(holding.symbol)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: '#666',
                          padding: 0,
                        }}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td style={styles.tableCell}>
                      <strong>{holding.symbol}</strong>
                    </td>
                    <td style={styles.tableCellRight}>
                      {holding.qty.toFixed(4)}
                    </td>
                    <td style={styles.tableCellRight}>
                      ${holding.marketValue.toFixed(2)}
                    </td>
                    <td style={styles.tableCellRight}>
                      {(holding.weight * 100).toFixed(2)}%
                    </td>
                    <td style={styles.tableCellCenter}>
                      <span style={styles.validationBadge(isValid)}>
                        {isValid ? '✓ 100%' : `⚠ ${(holding.strategies.reduce((sum, s) => sum + s.allocationPct, 0) * 100).toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded Attribution Details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} style={{ padding: "0 12px 12px 12px", borderBottom: "1px solid #f4f4f4" }}>
                        <div style={styles.attributionBox}>
                          <div style={styles.attributionTitle}>Attribution Breakdown</div>
                          <table style={{ ...styles.table, fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th style={{ ...styles.tableHeader, borderBottom: "1px solid #e6e6e6" }}>Strategy</th>
                                <th style={{ ...styles.tableHeaderRight, borderBottom: "1px solid #e6e6e6" }}>Ownership %</th>
                                <th style={{ ...styles.tableHeaderRight, borderBottom: "1px solid #e6e6e6" }}>Qty</th>
                                <th style={{ ...styles.tableHeaderRight, borderBottom: "1px solid #e6e6e6" }}>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holding.strategies.map((strat) => (
                                <tr key={strat.strategyId}>
                                  <td style={{ ...styles.tableCell, fontSize: 12 }}>{strat.strategyName}</td>
                                  <td style={{ ...styles.tableCellRight, fontSize: 12 }}>{(strat.allocationPct * 100).toFixed(2)}%</td>
                                  <td style={{ ...styles.tableCellRight, fontSize: 12 }}>{strat.qty.toFixed(4)}</td>
                                  <td style={{ ...styles.tableCellRight, fontSize: 12 }}>${strat.marketValue.toFixed(2)}</td>
                                </tr>
                              ))}
                              <tr style={{ background: "#fafafa" }}>
                                <td style={{ ...styles.tableCell, fontSize: 12, fontWeight: 700 }}>Total</td>
                                <td style={{ ...styles.tableCellRight, fontSize: 12, fontWeight: 700 }}>
                                  {(holding.strategies.reduce((sum, s) => sum + s.allocationPct, 0) * 100).toFixed(2)}%
                                </td>
                                <td style={{ ...styles.tableCellRight, fontSize: 12, fontWeight: 700 }}>{holding.qty.toFixed(4)}</td>
                                <td style={{ ...styles.tableCellRight, fontSize: 12, fontWeight: 700 }}>${holding.marketValue.toFixed(2)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Cash Row */}
            {data && (
              <tr style={{ background: "#fafafa" }}>
                <td style={styles.tableCell}></td>
                <td style={{ ...styles.tableCell, fontWeight: 700 }}>Cash (Remainder)</td>
                <td style={styles.tableCellRight}>-</td>
                <td style={{ ...styles.tableCellRight, fontWeight: 700 }}>
                  ${data.cashBalance.toFixed(2)}
                </td>
                <td style={styles.tableCellRight}>
                  {data.totalPortfolioValue > 0 ? ((data.cashBalance / data.totalPortfolioValue) * 100).toFixed(2) : '0.00'}%
                </td>
                <td style={{ ...styles.tableCellCenter, color: "#999", fontSize: 11 }}>Unattributed</td>
              </tr>
            )}

            {/* Total Row */}
            {data && (
              <tr style={{ background: "#e6e6e6" }}>
                <td style={styles.tableCell}></td>
                <td style={{ ...styles.tableCell, fontWeight: 700, fontSize: 14 }}>TOTAL</td>
                <td style={styles.tableCellRight}>-</td>
                <td style={{ ...styles.tableCellRight, fontWeight: 700, fontSize: 14 }}>
                  ${data.totalPortfolioValue.toFixed(2)}
                </td>
                <td style={{ ...styles.tableCellRight, fontWeight: 700 }}>100.00%</td>
                <td style={styles.tableCellCenter}></td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

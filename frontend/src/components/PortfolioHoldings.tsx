/**
 * Portfolio Holdings Component
 *
 * Displays total Alpaca positions with attribution breakdown per strategy
 * - Shows what the account owns (Alpaca positions)
 * - Shows who owns what (attribution %)
 * - Validates accounting accuracy (100% totals)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

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

type SortField = 'symbol' | 'qty' | 'marketValue' | 'weight';
type SortDirection = 'asc' | 'desc';

export default function PortfolioHoldings() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchData = async () => {
    try {
      const apiKey = localStorage.getItem('alpaca_api_key') || '';
      const apiSecret = localStorage.getItem('alpaca_api_secret') || '';
      const token = localStorage.getItem('auth_token') || '';

      const response = await axios.get('/api/portfolio/holdings', {
        headers: {
          Authorization: `Bearer ${token}`,
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
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
  }, []);

  const toggleRow = (symbol: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(symbol)) {
      newExpanded.delete(symbol);
    } else {
      newExpanded.add(symbol);
    }
    setExpandedRows(newExpanded);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedHoldings = (holdings: Holding[]): Holding[] => {
    const sorted = [...holdings].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'qty':
          aVal = a.qty;
          bVal = b.qty;
          break;
        case 'marketValue':
          aVal = a.marketValue;
          bVal = b.marketValue;
          break;
        case 'weight':
          aVal = a.weight;
          bVal = b.weight;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return sorted;
  };

  const validateAttribution = (holding: Holding): boolean => {
    const totalPct = holding.strategies.reduce((sum, s) => sum + s.allocationPct, 0);
    const tolerance = 0.001; // 0.1% tolerance
    return Math.abs(totalPct - 1.0) < tolerance;
  };

  if (loading) {
    return <div className="p-4 text-gray-400">Loading portfolio holdings...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error: {error}</div>;
  }

  if (!data) {
    return <div className="p-4 text-gray-400">No portfolio data available</div>;
  }

  const sortedHoldings = getSortedHoldings(data.holdings);

  return (
    <div className="bg-gray-800 rounded-lg p-6 mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">Portfolio Holdings</h2>
        <div className="text-sm text-gray-400">
          Auto-refresh: 30s | Total Value: ${data.totalPortfolioValue.toFixed(2)}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700 rounded p-4">
          <div className="text-gray-400 text-sm">Total Portfolio</div>
          <div className="text-white text-2xl font-bold">${data.totalPortfolioValue.toFixed(2)}</div>
        </div>
        <div className="bg-gray-700 rounded p-4">
          <div className="text-gray-400 text-sm">Positions Value</div>
          <div className="text-white text-2xl font-bold">${data.totalPositionsValue.toFixed(2)}</div>
        </div>
        <div className="bg-gray-700 rounded p-4">
          <div className="text-gray-400 text-sm">Cash Balance</div>
          <div className="text-white text-2xl font-bold">${data.cashBalance.toFixed(2)}</div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-gray-300 font-medium">
                <button
                  onClick={() => handleSort('symbol')}
                  className="hover:text-white flex items-center gap-1"
                >
                  Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="px-4 py-3 text-right text-gray-300 font-medium">
                <button
                  onClick={() => handleSort('qty')}
                  className="hover:text-white flex items-center gap-1 ml-auto"
                >
                  Quantity {sortField === 'qty' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="px-4 py-3 text-right text-gray-300 font-medium">
                <button
                  onClick={() => handleSort('marketValue')}
                  className="hover:text-white flex items-center gap-1 ml-auto"
                >
                  Market Value {sortField === 'marketValue' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="px-4 py-3 text-right text-gray-300 font-medium">
                <button
                  onClick={() => handleSort('weight')}
                  className="hover:text-white flex items-center gap-1 ml-auto"
                >
                  Weight {sortField === 'weight' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="px-4 py-3 text-center text-gray-300 font-medium">Attribution</th>
              <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {sortedHoldings.map((holding) => {
              const isExpanded = expandedRows.has(holding.symbol);
              const isValid = validateAttribution(holding);

              return (
                <React.Fragment key={holding.symbol}>
                  {/* Main Row */}
                  <tr className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-white font-medium">{holding.symbol}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{holding.qty.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">${holding.marketValue.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{(holding.weight * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-center">
                      {isValid ? (
                        <span className="text-green-400 font-bold">✓ 100%</span>
                      ) : (
                        <span className="text-red-400 font-bold">⚠ {(holding.strategies.reduce((sum, s) => sum + s.allocationPct, 0) * 100).toFixed(1)}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleRow(holding.symbol)}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Attribution Details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="bg-gray-900/50 px-4 py-3">
                        <div className="ml-8">
                          <div className="text-gray-400 text-xs font-semibold mb-2">Attribution Breakdown:</div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left pb-1">Strategy</th>
                                <th className="text-right pb-1">Ownership %</th>
                                <th className="text-right pb-1">Qty</th>
                                <th className="text-right pb-1">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holding.strategies.map((strat) => (
                                <tr key={strat.strategyId} className="text-gray-300">
                                  <td className="py-1">{strat.strategyName}</td>
                                  <td className="text-right">{(strat.allocationPct * 100).toFixed(2)}%</td>
                                  <td className="text-right">{strat.qty.toFixed(4)}</td>
                                  <td className="text-right">${strat.marketValue.toFixed(2)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-gray-700 font-semibold text-gray-200">
                                <td className="py-1 pt-2">Total</td>
                                <td className="text-right pt-2">
                                  {(holding.strategies.reduce((sum, s) => sum + s.allocationPct, 0) * 100).toFixed(2)}%
                                </td>
                                <td className="text-right pt-2">{holding.qty.toFixed(4)}</td>
                                <td className="text-right pt-2">${holding.marketValue.toFixed(2)}</td>
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
            <tr className="bg-gray-700 font-semibold">
              <td className="px-4 py-3 text-white">Cash (Remainder)</td>
              <td className="px-4 py-3 text-right text-gray-300">-</td>
              <td className="px-4 py-3 text-right text-gray-300">${data.cashBalance.toFixed(2)}</td>
              <td className="px-4 py-3 text-right text-gray-300">{((data.cashBalance / data.totalPortfolioValue) * 100).toFixed(2)}%</td>
              <td className="px-4 py-3 text-center text-gray-400">Unattributed</td>
              <td className="px-4 py-3"></td>
            </tr>

            {/* Total Row */}
            <tr className="bg-gray-600 font-bold">
              <td className="px-4 py-3 text-white">TOTAL</td>
              <td className="px-4 py-3 text-right text-white">-</td>
              <td className="px-4 py-3 text-right text-white">${data.totalPortfolioValue.toFixed(2)}</td>
              <td className="px-4 py-3 text-right text-white">100.00%</td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Flow Evaluation Service
 *
 * Evaluates Flow logic with current/T-10 prices to determine portfolio allocation
 */

import axios from 'axios';
import { getCurrentPrice } from './orders';

const ALPACA_DATA_BASE = 'https://data.alpaca.markets';
const INDICATOR_SERVICE = process.env.INDICATOR_SERVICE_URL || 'http://127.0.0.1:8001';

type FlowData = {
  nodes: any[];
  edges: any[];
  globals: any;
};

/**
 * Extract all symbols referenced in the Flow
 */
export function extractSymbols(flowData: FlowData): string[] {
  const symbols = new Set<string>();

  for (const node of flowData.nodes) {
    if (node.type === 'gate') {
      const conditions = node.data?.conditions || [];
      for (const cond of conditions) {
        if (cond.left?.symbol) symbols.add(cond.left.symbol);
        // Handle both 'right' and 'rightIndicator' property names
        const rightSide = cond.right || cond.rightIndicator;
        if (rightSide?.symbol) symbols.add(rightSide.symbol);
      }
    }

    if (node.type === 'portfolio') {
      const items = node.data?.items || node.data?.positions || [];
      for (const item of items) {
        if (item.symbol) symbols.add(item.symbol);
      }
    }
  }

  return Array.from(symbols);
}

/**
 * Fetch historical daily bars for a symbol
 */
async function fetchDailyBars(
  symbol: string,
  startDate: string,
  endDate: string,
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  try {
    const response = await axios.get(`${ALPACA_DATA_BASE}/v2/stocks/${symbol}/bars`, {
      params: {
        timeframe: '1Day',
        start: startDate,
        end: endDate,
        adjustment: 'split',
        feed: 'sip',
        limit: 10000,
      },
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 30000,
    });

    return response.data?.bars || [];
  } catch (err: any) {
    console.error(`Failed to fetch bars for ${symbol}:`, err?.response?.data || err.message);
    throw new Error(`Failed to fetch bars: ${err.message}`);
  }
}

/**
 * Build historical bars with synthetic T-10 bar appended
 */
export async function buildHistoricalBarsWithT10(
  symbols: string[],
  currentPrices: Record<string, number>,
  apiKey: string,
  apiSecret: string
): Promise<Record<string, any[]>> {
  const result: Record<string, any[]> = {};

  // Fetch last 250 days (enough for 200-day SMA + buffer)
  const endDate = getTodayDateString();
  const startDate = getDateNDaysAgo(250);

  for (const symbol of symbols) {
    const bars = await fetchDailyBars(symbol, startDate, endDate, apiKey, apiSecret);

    // Append synthetic bar with current price
    const syntheticBar = {
      t: new Date().toISOString(),
      o: currentPrices[symbol],
      h: currentPrices[symbol],
      l: currentPrices[symbol],
      c: currentPrices[symbol],
      v: 0,
      n: 0,
      vw: currentPrices[symbol],
    };

    result[symbol] = [...bars, syntheticBar];
  }

  return result;
}

/**
 * Calculate indicators for given bars
 */
async function calculateIndicators(
  symbol: string,
  bars: any[],
  indicatorType: string,
  params: any
): Promise<number[]> {
  try {
    const closes = bars.map((b) => b.c);
    const highs = bars.map((b) => b.h);
    const lows = bars.map((b) => b.l);
    const volumes = bars.map((b) => b.v);

    console.log(`Calculating ${indicatorType} for ${symbol}: ${bars.length} bars, params:`, params);

    const response = await axios.post(
      `${INDICATOR_SERVICE}/indicator`,
      {
        indicator: indicatorType,
        params,
        close: closes,
        high: highs,
        low: lows,
        volume: volumes,
      },
      { timeout: 10000 }
    );

    return response.data?.values || [];
  } catch (err: any) {
    console.error(`Failed to calculate ${indicatorType} for ${symbol}:`, err?.response?.data || err.message);
    throw new Error(`Indicator calculation failed for ${symbol}/${indicatorType}: ${err?.response?.data?.detail || err.message}`);
  }
}

/**
 * Evaluate Flow logic with current prices
 * Returns portfolio allocation (e.g., { SPY: 0.6, BND: 0.4 })
 */
export async function evaluateFlowWithCurrentPrices(
  flowData: FlowData,
  apiKey: string,
  apiSecret: string
): Promise<Record<string, number>> {
  const symbols = extractSymbols(flowData);

  // Get current prices
  const currentPrices: Record<string, number> = {};
  for (const symbol of symbols) {
    currentPrices[symbol] = await getCurrentPrice(symbol, apiKey, apiSecret);
  }

  // Build historical bars with T-10 synthetic bar
  const barsMap = await buildHistoricalBarsWithT10(symbols, currentPrices, apiKey, apiSecret);

  // Calculate indicators for each condition in gates
  const indicatorValues: Record<string, number> = {};

  for (const node of flowData.nodes) {
    if (node.type === 'gate') {
      const conditions = node.data?.conditions || [];

      for (const cond of conditions) {
        // Left side
        if (cond.left?.symbol && cond.left?.type) {
          const key = `${cond.left.symbol}_${cond.left.type}_${JSON.stringify(cond.left.params || {})}`;
          if (!indicatorValues[key]) {
            const bars = barsMap[cond.left.symbol];
            const values = await calculateIndicators(
              cond.left.symbol,
              bars,
              cond.left.type,
              cond.left.params || {}
            );
            indicatorValues[key] = values[values.length - 1]; // Latest value
          }
        }

        // Right side (if indicator comparison)
        const rightSide = cond.right || cond.rightIndicator;
        if (rightSide?.symbol && rightSide?.type) {
          const key = `${rightSide.symbol}_${rightSide.type}_${JSON.stringify(rightSide.params || {})}`;
          if (!indicatorValues[key]) {
            const bars = barsMap[rightSide.symbol];
            const values = await calculateIndicators(
              rightSide.symbol,
              bars,
              rightSide.type,
              rightSide.params || {}
            );
            indicatorValues[key] = values[values.length - 1];
          }
        }
      }
    }
  }

  // Walk the flow graph to determine allocation
  const allocation = walkFlow(flowData, indicatorValues);

  return allocation;
}

/**
 * Walk the Flow graph to determine final portfolio allocation
 * Simplified version for MVP - assumes single path from start to portfolio
 */
function walkFlow(
  flowData: FlowData,
  indicatorValues: Record<string, number>
): Record<string, number> {
  // Find start node
  const startNode = flowData.nodes.find((n) => n.type === 'start');
  if (!startNode) {
    throw new Error('No start node found in Flow');
  }

  console.log('Flow has', flowData.nodes.length, 'nodes and', flowData.edges.length, 'edges');
  if (flowData.edges.length > 0) {
    console.log('Sample edge:', JSON.stringify(flowData.edges[0]));
  }

  // Find outgoing edge from start
  let currentNodeId = startNode.id;
  let visitedNodes = new Set<string>();

  while (currentNodeId && !visitedNodes.has(currentNodeId)) {
    visitedNodes.add(currentNodeId);

    const currentNode = flowData.nodes.find((n) => n.id === currentNodeId);
    if (!currentNode) {
      console.error(`Node not found: ${currentNodeId}`);
      break;
    }

    console.log(`Walking node: ${currentNode.type} (${currentNode.id})`);

    // If we reached a portfolio, extract allocation
    if (currentNode.type === 'portfolio') {
      const items = currentNode.data?.items || currentNode.data?.positions || [];
      const allocation: Record<string, number> = {};

      console.log('Portfolio items:', JSON.stringify(items, null, 2));

      for (const item of items) {
        const symbol = item.symbol;
        const weightValue = item.weightPct || item.weight;

        if (symbol && weightValue) {
          const weight = parseFloat(String(weightValue));
          allocation[symbol] = weight / 100; // Convert 60 -> 0.6
          console.log(`  ${symbol}: ${weightValue}% -> ${weight / 100}`);
        }
      }

      // Validate allocation sums to ~1.0
      const total = Object.values(allocation).reduce((sum, val) => sum + val, 0);
      console.log('Total allocation:', total);
      if (Math.abs(total - 1.0) > 0.01) {
        throw new Error(`Portfolio allocation must sum to 100% (got ${(total * 100).toFixed(1)}%)`);
      }

      return allocation;
    }

    // If it's a gate, evaluate condition
    if (currentNode.type === 'gate') {
      const conditions = currentNode.data?.conditions || [];
      const thenTargetId = currentNode.data?.thenTargetId;
      const elseTargetId = currentNode.data?.elseTargetId;

      // For MVP, assume single condition
      const cond = conditions[0];
      if (!cond) {
        throw new Error(`Gate ${currentNode.id} has no conditions`);
      }

      console.log('Gate condition object:', JSON.stringify(cond, null, 2));
      console.log('Available indicator values:', Object.keys(indicatorValues));

      // Evaluate condition
      const leftKey = `${cond.left.symbol}_${cond.left.type}_${JSON.stringify(cond.left.params || {})}`;
      const leftValue = indicatorValues[leftKey];

      let rightValue: number;
      if (cond.threshold !== undefined && cond.threshold !== null) {
        rightValue = cond.threshold;
      } else {
        const rightSide = cond.right || cond.rightIndicator;
        if (rightSide?.symbol && rightSide?.type) {
          const rightKey = `${rightSide.symbol}_${rightSide.type}_${JSON.stringify(rightSide.params || {})}`;
          rightValue = indicatorValues[rightKey];
        } else {
          console.error('Condition structure:', cond);
          throw new Error(`Gate condition has no threshold or right indicator`);
        }
      }

      const op = cond.op || 'gt';
      const passed = op === 'gt' ? leftValue > rightValue : leftValue < rightValue;

      console.log(`Gate condition: ${leftValue} ${op} ${rightValue} = ${passed}`);
      console.log(`Taking ${passed ? 'THEN' : 'ELSE'} branch -> ${passed ? thenTargetId : elseTargetId}`);

      currentNodeId = passed ? thenTargetId : elseTargetId;
      continue;
    }

    // For other node types, find next edge
    const nextEdge = flowData.edges.find((e: any) => e.from === currentNodeId || e.source === currentNodeId);
    console.log(`Looking for edge from ${currentNodeId}:`, nextEdge ? `found -> ${(nextEdge as any).to || (nextEdge as any).target}` : 'not found');
    if (nextEdge) {
      currentNodeId = (nextEdge as any).to || (nextEdge as any).target;
    } else {
      console.error(`No outgoing edge from node ${currentNodeId}, terminating walk`);
      break;
    }
  }

  console.error('Flow walk terminated without reaching portfolio node');
  console.error('Visited nodes:', Array.from(visitedNodes));
  throw new Error('Flow did not terminate in a portfolio node');
}

/**
 * Helper: Get today's date as YYYY-MM-DD
 */
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Helper: Get date N days ago as YYYY-MM-DD
 */
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * V2 Simulation Engine
 *
 * Runs backtest simulation with pre-fetched data from cache.
 * No API calls during simulation - all data is in memory.
 */

import {
  buildIndicatorLookupMap,
  collectIndicatorValuesForDate,
  precomputeSortIndicators,
} from '../../execution/sortRuntime';
import type { Element as StrategyElement } from '../../execution';

interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface PriceData {
  [ticker: string]: {
    [date: string]: Bar;
  };
}

interface IndicatorValues {
  [key: string]: {  // key = "ticker|indicator|period"
    [date: string]: number;
  };
}

interface Position {
  ticker: string;
  weight: number;
}

interface ExecutionResult {
  positions: Position[];
  gateEvaluations: Array<{ gateName: string; conditionMet: boolean }>;
  errors: string[];
}

interface SimulationResult {
  dates: string[];
  equityCurve: number[];
  benchmark: number[];
  dailyPositions: Array<Record<string, any>>;
  metrics: {
    totalReturn: number;
    cagr: number;
    CAGR: number;
    volatility: number;
    annualVolatility: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
  };
  benchmarkMetrics: {
    totalReturn: number;
    cagr: number;
    CAGR: number;
    volatility: number;
    annualVolatility: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
  };
}

/**
 * Build a lookup map of ticker:indicator -> period from strategy elements
 * This extracts the period values that conditions expect (e.g., "20" for single-param or "12-26-9" for MACD)
 * Now supports both old period field and new params object
 */
export async function runSimulation(
  elements: any[],
  priceData: PriceData,
  indicatorData: IndicatorValues,
  startDate: string,
  endDate: string,
  debug = false
): Promise<SimulationResult> {
  console.log('\n[SIMULATION] Starting backtest simulation...');
  console.log(`[SIMULATION] Date range: ${startDate} → ${endDate}`);

  // Import execution engine from legacy system
  const { executeStrategy, buildIndicatorMap } = await import('../../execution');

  // Build date grid from SPY (benchmark)
  const spyData = priceData['SPY'] || {};
  let dateGrid = Object.keys(spyData).sort();

  // Filter to requested date range
  dateGrid = dateGrid.filter(d => d >= startDate && d <= endDate);

  // Find the first date where ALL indicators are available
  // This ensures the strategy can execute from day 1
  if (Object.keys(indicatorData).length > 0) {
    let firstIndicatorDate = dateGrid[0]; // Start with earliest date
    for (const values of Object.values(indicatorData)) {
      const indicatorDates = Object.keys(values).sort();
      if (indicatorDates.length > 0 && indicatorDates[0] > firstIndicatorDate) {
        firstIndicatorDate = indicatorDates[0]; // Take the latest "first date" (most restrictive)
      }
    }
    // Filter date grid to start from first indicator date
    dateGrid = dateGrid.filter(d => d >= firstIndicatorDate);
    console.log(`[SIMULATION] Adjusted start date to ${firstIndicatorDate} (first date with all indicators)`);
  }

  console.log(`[SIMULATION] Date grid: ${dateGrid.length} trading days`);

  if (dateGrid.length < 2) {
    throw new Error('Insufficient trading days in date range');
  }

  // Precompute Sort indicators (warmup already handled by engine.ts)
  console.log('[SIMULATION] About to call precomputeSortIndicators...');
  console.log('[SIMULATION] Elements:', elements.length, 'elements');
  console.log('[SIMULATION] DateGrid:', dateGrid.length, 'days from', dateGrid[0], 'to', dateGrid[dateGrid.length - 1]);

  try {
    const sortStartDate = await precomputeSortIndicators({
      elements: elements as StrategyElement[],
      priceData,
      indicatorData,
      dateGrid,
      executeStrategy,
      buildIndicatorMap,
      debug: false, // Disable debug to reduce log spam
    });
    console.log('[SIMULATION] precomputeSortIndicators completed, sortStartDate:', sortStartDate);

    // If Sort elements exist and need warmup, adjust dateGrid
    if (sortStartDate) {
      const originalLength = dateGrid.length;
      dateGrid = dateGrid.filter(d => d >= sortStartDate);
      console.log(`[SIMULATION] Adjusted dateGrid for Sort warmup: ${originalLength} -> ${dateGrid.length} days (start: ${sortStartDate})`);

      if (dateGrid.length < 2) {
        throw new Error(`Insufficient trading days after Sort warmup. Sort indicators start at ${sortStartDate}`);
      }
    }
  } catch (err: any) {
    console.error('[SIMULATION] Error in precomputeSortIndicators:', err.message);
    console.error('[SIMULATION] Stack:', err.stack);
    throw err;
  }

  // Initialize portfolio (Decision #6: $100,000 starting capital)
  const STARTING_CAPITAL = 100000;
  let equity = 1.0;  // Normalized to 1.0 for easier comparison
  const equityCurve: number[] = [equity];
  const benchmarkCurve: number[] = [1.0];
  const dailyPositions: Array<Record<string, any>> = [];

  // For metrics calculation
  const dates: string[] = [dateGrid[0]];

  // Add initial empty position
  dailyPositions.push({ date: dateGrid[0] });

  // Get SPY initial price for benchmark
  const spyInitialPrice = spyData[dateGrid[0]]?.c || 1;

  console.log(`[SIMULATION] Starting capital: $${STARTING_CAPITAL.toLocaleString()}`);
  console.log(`[SIMULATION] Initial date: ${dateGrid[0]}`);
  console.log(`[SIMULATION] SPY initial price: $${spyInitialPrice.toFixed(2)}`);

  // Day-by-day simulation (Decision #2: benchmark in same loop)
  let positionDays = 0; // Track days with positions
  for (let i = 1; i < dateGrid.length; i++) {
    const decisionDate = dateGrid[i - 1];
    const executionDate = dateGrid[i];

    const indicatorLookup = buildIndicatorLookupMap(elements);
    if (i === 1) {
      console.log('[SIM DEBUG] Indicator lookup map:');
      for (const [key, period] of indicatorLookup.entries()) {
        console.log(`  ${key} -> period: "${period}"`);
      }
    }
    const { values: indicatorValuesForDate, missing: missingIndicators } = collectIndicatorValuesForDate(
      indicatorLookup,
      indicatorData,
      decisionDate
    );

    if (missingIndicators.length > 0 && i === 1) {
      console.error('[SIMULATION] Missing indicator values on first day:', missingIndicators);
      throw new Error(`Missing indicator values: ${missingIndicators.join(', ')}. Check indicator parameters and warmup period.`);
    }

    const indicatorMap = buildIndicatorMap(indicatorValuesForDate);

    // Execute strategy to get positions
    const result: ExecutionResult = executeStrategy(elements, indicatorMap, debug);
    const positions = result.positions;

    // Debug: log first few days
    if (i <= 5) {
      console.log(`[SIM DEBUG] Day ${i} (${executionDate}):`);
      console.log(`  Indicators available: ${indicatorValuesForDate.length}`);
      if (indicatorValuesForDate.length > 0) {
        console.log(`  Indicator values:`, JSON.stringify(indicatorValuesForDate));
      }
      console.log(`  Positions: ${positions.length}`);
      if (positions.length > 0) {
        console.log(`  Position values:`, JSON.stringify(positions));
      }
    }
    if (positions.length > 0) positionDays++;

    // Normalize position weights
    const totalWeight = positions.reduce((sum, p) => sum + p.weight, 0);
    const normalizedPositions = totalWeight > 0
      ? positions.map(p => ({ ticker: p.ticker, weight: p.weight / totalWeight }))
      : [];

    // Record daily positions (ticker allocations for this day)
    const dayPositions: Record<string, any> = { date: executionDate };
    for (const pos of normalizedPositions) {
      dayPositions[pos.ticker] = pos.weight;
    }
    dailyPositions.push(dayPositions);

    // Calculate daily return
    let dailyReturn = 0;
    for (const pos of normalizedPositions) {
      const ticker = pos.ticker.toUpperCase();
      const tickerData = priceData[ticker];
      if (!tickerData) continue;

      const priceT0 = tickerData[decisionDate]?.c;
      const priceT1 = tickerData[executionDate]?.c;

      if (priceT0 && priceT1 && priceT0 > 0) {
        const posReturn = (priceT1 / priceT0) - 1;
        dailyReturn += pos.weight * posReturn;
      }
    }

    // Update equity
    equity *= (1 + dailyReturn);
    equityCurve.push(equity);

    // Calculate benchmark (SPY buy-and-hold) - Decision #2
    const spyCurrentPrice = spyData[executionDate]?.c || spyInitialPrice;
    const benchmarkValue = spyCurrentPrice / spyInitialPrice;
    benchmarkCurve.push(benchmarkValue);

    dates.push(executionDate);
  }

  console.log(`[SIMULATION] Final equity: ${equity.toFixed(4)}x (${((equity - 1) * 100).toFixed(2)}% return)`);
  console.log(`[SIMULATION] Final benchmark: ${benchmarkCurve[benchmarkCurve.length - 1].toFixed(4)}x`);
  console.log(`[SIMULATION] Days with positions: ${positionDays}/${dateGrid.length - 1} (${(positionDays / (dateGrid.length - 1) * 100).toFixed(1)}%)`);

  // Verify benchmark is not flat (bug check)
  const benchmarkVariance = calculateVariance(benchmarkCurve);
  if (benchmarkVariance === 0) {
    console.warn('[SIMULATION] ⚠️  WARNING: Benchmark is flat (variance = 0)');
  } else {
    console.log(`[SIMULATION] ✓ Benchmark variance: ${benchmarkVariance.toFixed(6)}`);
  }

  // Calculate metrics
  console.log('\n[SIMULATION] Calculating metrics...');
  const metrics = calculateMetrics(equityCurve, dates);
  const benchmarkMetrics = calculateMetrics(benchmarkCurve, dates);

  console.log('[SIMULATION] Strategy:');
  console.log(`[SIMULATION]   Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
  console.log(`[SIMULATION]   CAGR: ${(metrics.cagr * 100).toFixed(2)}%`);
  console.log(`[SIMULATION]   Sharpe: ${metrics.sharpe.toFixed(2)}`);
  console.log(`[SIMULATION]   Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}%`);

  console.log('[SIMULATION] Benchmark (SPY):');
  console.log(`[SIMULATION]   Total Return: ${(benchmarkMetrics.totalReturn * 100).toFixed(2)}%`);
  console.log(`[SIMULATION]   CAGR: ${(benchmarkMetrics.cagr * 100).toFixed(2)}%`);
  console.log(`[SIMULATION]   Sharpe: ${benchmarkMetrics.sharpe.toFixed(2)}`);

  console.log('[SIMULATION] ✓ Simulation complete\n');

  return {
    dates,
    equityCurve,
    benchmark: benchmarkCurve,
    dailyPositions,
    metrics,
    benchmarkMetrics,
  };
}

/**
 * Calculate performance metrics
 */
function calculateMetrics(
  equityCurve: number[],
  dates: string[]
): {
  totalReturn: number;
  cagr: number;
  CAGR: number;
  volatility: number;
  annualVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
} {
  if (equityCurve.length < 2) {
    return {
      totalReturn: 0,
      cagr: 0,
      CAGR: 0,
      volatility: 0,
      annualVolatility: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
    };
  }

  // Total return
  const totalReturn = equityCurve[equityCurve.length - 1] - 1;

  // CAGR
  const years = dates.length / 252; // Approximate trading days per year
  const cagr = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

  // Daily returns
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = equityCurve[i] / equityCurve[i - 1] - 1;
    dailyReturns.push(ret);
  }

  // Volatility (annualized)
  const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance * 252);

  // Sharpe ratio (assuming 0 risk-free rate)
  const sharpe = volatility > 0 ? cagr / volatility : 0;

  // Max drawdown
  let peak = equityCurve[0];
  let maxDD = 0;
  for (const value of equityCurve) {
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalReturn,
    cagr,
    CAGR: cagr,  // Frontend expects uppercase
    volatility,
    annualVolatility: volatility,  // Frontend expects this name
    sharpe,
    sortino: sharpe,  // TODO: Implement proper sortino (using sharpe as placeholder)
    maxDrawdown: maxDD,
  };
}

/**
 * Calculate variance (for benchmark validation)
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

  return variance;
}

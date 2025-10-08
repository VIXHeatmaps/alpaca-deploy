/**
 * V2 Simulation Engine
 *
 * Runs backtest simulation with pre-fetched data from cache.
 * No API calls during simulation - all data is in memory.
 */

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
}

interface SimulationResult {
  dates: string[];
  equityCurve: number[];
  benchmark: number[];
  metrics: {
    totalReturn: number;
    cagr: number;
    volatility: number;
    sharpe: number;
    maxDrawdown: number;
  };
  benchmarkMetrics: {
    totalReturn: number;
    cagr: number;
    volatility: number;
    sharpe: number;
    maxDrawdown: number;
  };
}

/**
 * Run backtest simulation with pre-fetched data
 *
 * Decision #2: Benchmark calculation happens in this loop (Phase 5 removed)
 * Decision #6: Starting capital = $100,000
 */
export async function runSimulation(
  elements: any[],
  priceData: PriceData,
  indicatorData: IndicatorValues,
  startDate: string,
  endDate: string
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
  console.log(`[SIMULATION] Date grid: ${dateGrid.length} trading days`);

  if (dateGrid.length < 2) {
    throw new Error('Insufficient trading days in date range');
  }

  // Initialize portfolio (Decision #6: $100,000 starting capital)
  const STARTING_CAPITAL = 100000;
  let equity = 1.0;  // Normalized to 1.0 for easier comparison
  const equityCurve: number[] = [equity];
  const benchmarkCurve: number[] = [1.0];

  // For metrics calculation
  const dates: string[] = [dateGrid[0]];

  // Get SPY initial price for benchmark
  const spyInitialPrice = spyData[dateGrid[0]]?.c || 1;

  console.log(`[SIMULATION] Starting capital: $${STARTING_CAPITAL.toLocaleString()}`);
  console.log(`[SIMULATION] Initial date: ${dateGrid[0]}`);
  console.log(`[SIMULATION] SPY initial price: $${spyInitialPrice.toFixed(2)}`);

  // Day-by-day simulation (Decision #2: benchmark in same loop)
  for (let i = 1; i < dateGrid.length; i++) {
    const decisionDate = dateGrid[i - 1];
    const executionDate = dateGrid[i];

    // Build indicator map for decision date
    const indicatorValuesForDate: Array<any> = [];
    for (const [key, values] of Object.entries(indicatorData)) {
      const [ticker, indicator, periodStr] = key.split('|');
      const value = values[decisionDate];
      if (value !== undefined) {
        indicatorValuesForDate.push({
          ticker,
          indicator,
          period: parseInt(periodStr),
          value,
        });
      }
    }

    const indicatorMap = buildIndicatorMap(indicatorValuesForDate);

    // Execute strategy to get positions
    const result: ExecutionResult = executeStrategy(elements, indicatorMap);
    const positions = result.positions;

    // Normalize position weights
    const totalWeight = positions.reduce((sum, p) => sum + p.weight, 0);
    const normalizedPositions = totalWeight > 0
      ? positions.map(p => ({ ticker: p.ticker, weight: p.weight / totalWeight }))
      : [];

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
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
} {
  if (equityCurve.length < 2) {
    return {
      totalReturn: 0,
      cagr: 0,
      volatility: 0,
      sharpe: 0,
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
    volatility,
    sharpe,
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

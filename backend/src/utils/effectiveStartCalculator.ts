/**
 * Effective Start Date Calculator
 *
 * Centralized utility for calculating the earliest valid date where a strategy can execute.
 * Handles nested elements (Sort, Gate, Scale) and their warmup requirements.
 *
 * Key principle: Start date depends on BOTH:
 * 1. Ticker data availability (when does the data actually start?)
 * 2. Indicator warmup (how many days of history does each indicator need?)
 *
 * For nested elements (e.g., Sort containing Sort), warmup is CUMULATIVE:
 * - Child needs to simulate first to generate equity curve
 * - Parent needs child's full warmup + parent's indicator period
 */

import { paramsToPeriodString } from './indicatorKeys';

// ===== TYPES =====

export interface PriceData {
  [ticker: string]: {
    [date: string]: {
      c: number;
      [key: string]: any;
    };
  };
}

export interface IndicatorData {
  [key: string]: {  // key format: "TICKER|INDICATOR|PERIOD"
    [date: string]: number;
  };
}

export interface EffectiveStartResult {
  /** The calculated effective start date (YYYY-MM-DD) */
  effectiveStart: string;

  /** Human-readable reason for this start date */
  reason: string;

  /** Detailed breakdown for debugging */
  breakdown: {
    /** Latest ticker start date (most restrictive ticker) */
    latestTickerStart: string | null;

    /** Tickers that caused the restriction */
    culpritTickers: string[];

    /** Total warmup days needed */
    totalWarmupDays: number;

    /** Element that requires the most warmup */
    culpritElement: string | null;

    /** Step-by-step calculation for debugging */
    steps: string[];
  };
}

// ===== HELPER FUNCTIONS =====

/**
 * Add trading days to a date (approximate - uses calendar days * 1.4)
 */
function addTradingDays(dateStr: string, tradingDays: number): string {
  const date = new Date(dateStr);
  const calendarDays = Math.ceil(tradingDays * 1.4);
  date.setDate(date.getDate() + calendarDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Extract the maximum period from an indicator configuration
 */
function extractIndicatorPeriod(indicator: string, params?: any, period?: string): number {
  const periodKey = paramsToPeriodString(indicator, params) || period || '';
  const parts = periodKey
    .split('-')
    .map((part: string) => parseInt(part, 10))
    .filter((value: number) => Number.isFinite(value));
  return parts.length ? Math.max(...parts) : 0;
}

/**
 * Find the latest first-available date across all tickers
 */
function findLatestTickerStart(priceData: PriceData): {
  latestStart: string | null;
  culprits: string[];
} {
  let latestStart: string | null = null;
  const culprits: string[] = [];

  for (const [ticker, data] of Object.entries(priceData)) {
    const dates = Object.keys(data).sort();
    if (dates.length > 0) {
      const firstDate = dates[0];
      if (!latestStart || firstDate > latestStart) {
        latestStart = firstDate;
        culprits.length = 0;
        culprits.push(ticker);
      } else if (firstDate === latestStart) {
        culprits.push(ticker);
      }
    }
  }

  return { latestStart, culprits };
}

// ===== MAIN CALCULATOR =====

/**
 * Calculate warmup needed for nested elements (recursive)
 *
 * Returns both the warmup days AND which element needs it
 */
function calculateNestedWarmup(
  elements: any[],
  steps: string[],
  depth = 0
): { warmupDays: number; culprit: string | null } {
  let maxWarmup = 0;
  let culpritElement: string | null = null;
  const indent = '  '.repeat(depth);

  const traverse = (els: any[], currentDepth: number): { warmup: number; element: string | null } => {
    let localMax = 0;
    let localCulprit: string | null = null;

    for (const el of els || []) {
      if (!el || typeof el !== 'object') continue;

      if (el.type === 'sort') {
        const elementName = el.name || el.id || `Sort_${currentDepth}`;
        const sortPeriod = extractIndicatorPeriod(el.indicator, el.params, el.period);

        // Recursively calculate child warmup
        const childResult = traverse(el.children || [], currentDepth + 1);

        // Cumulative for Sort: child warmup + this Sort's period
        const cumulativeWarmup = childResult.warmup + sortPeriod;

        steps.push(
          `${indent}Sort "${elementName}": ${sortPeriod} days (${el.indicator}) + ${childResult.warmup} days (children) = ${cumulativeWarmup} days total`
        );

        if (cumulativeWarmup > localMax) {
          localMax = cumulativeWarmup;
          localCulprit = elementName;
        }

        continue; // Don't traverse children again
      }

      if (el.type === 'gate' && Array.isArray(el.conditions)) {
        const elementName = el.name || el.id || `Gate_${currentDepth}`;
        let maxGatePeriod = 0;

        for (const cond of el.conditions) {
          if (cond.indicator) {
            const period = extractIndicatorPeriod(cond.indicator, cond.params, cond.period);
            if (period > maxGatePeriod) maxGatePeriod = period;
          }
          if (cond.rightIndicator) {
            const period = extractIndicatorPeriod(cond.rightIndicator, cond.rightParams, cond.rightPeriod);
            if (period > maxGatePeriod) maxGatePeriod = period;
          }
        }

        if (maxGatePeriod > 0) {
          steps.push(`${indent}Gate "${elementName}": ${maxGatePeriod} days`);
        }

        if (maxGatePeriod > localMax) {
          localMax = maxGatePeriod;
          localCulprit = elementName;
        }
      }

      if (el.type === 'scale' && el.config?.indicator) {
        const elementName = el.name || el.id || `Scale_${currentDepth}`;
        const scalePeriod = extractIndicatorPeriod(el.config.indicator, el.config.params, el.config.period);

        if (scalePeriod > 0) {
          steps.push(`${indent}Scale "${elementName}": ${scalePeriod} days`);
        }

        if (scalePeriod > localMax) {
          localMax = scalePeriod;
          localCulprit = elementName;
        }
      }

      // Traverse all child branches (non-cumulative for non-Sort)
      const childBranches = [el.children, el.thenChildren, el.elseChildren, el.fromChildren, el.toChildren];
      for (const branch of childBranches) {
        if (branch) {
          const branchResult = traverse(branch, currentDepth + 1);
          if (branchResult.warmup > localMax) {
            localMax = branchResult.warmup;
            localCulprit = branchResult.element;
          }
        }
      }
    }

    return { warmup: localMax, element: localCulprit };
  };

  const result = traverse(elements, depth);
  return { warmupDays: result.warmup, culprit: result.element };
}

/**
 * Calculate the effective start date for a strategy
 *
 * This is the single source of truth for determining when a backtest can begin.
 *
 * @param elements - Strategy elements (Sorts, Gates, Scales, Tickers)
 * @param priceData - Historical price data for all tickers
 * @param indicatorData - Pre-computed indicator values (optional, for validation)
 * @returns EffectiveStartResult with calculated date and detailed reasoning
 */
export function calculateEffectiveStart(
  elements: any[],
  priceData: PriceData,
  indicatorData?: IndicatorData
): EffectiveStartResult {
  const steps: string[] = [];

  // Step 1: Find latest ticker start date
  steps.push('Step 1: Analyzing ticker data availability...');
  const { latestStart, culprits } = findLatestTickerStart(priceData);

  if (latestStart) {
    steps.push(`  Latest ticker start: ${latestStart} (${culprits.join(', ')})`);
  } else {
    steps.push('  No ticker data available!');
  }

  // Step 2: Calculate warmup needed
  steps.push('Step 2: Calculating warmup requirements...');
  const { warmupDays, culprit } = calculateNestedWarmup(elements, steps);
  steps.push(`  Total warmup needed: ${warmupDays} days`);
  if (culprit) {
    steps.push(`  Primary warmup requirement: ${culprit}`);
  }

  // Step 3: Calculate effective start
  steps.push('Step 3: Calculating effective start date...');
  const dataStart = latestStart || '2013-01-01'; // Fallback if no data
  const effectiveStart = addTradingDays(dataStart, warmupDays);
  steps.push(`  Effective start: ${effectiveStart} = ${dataStart} + ${warmupDays} days`);

  // Step 4: Determine reason
  let reason: string;
  if (latestStart && culprits.length > 0 && warmupDays > 0) {
    // Both ticker availability and warmup matter
    if (culprit) {
      reason = `${culprits.join(', ')} (data availability) and ${culprit} (warmup)`;
    } else {
      reason = culprits.join(', ');
    }
  } else if (latestStart && culprits.length > 0) {
    reason = culprits.join(', ');
  } else if (culprit) {
    reason = culprit;
  } else {
    reason = 'no restrictions';
  }

  return {
    effectiveStart,
    reason,
    breakdown: {
      latestTickerStart: latestStart,
      culpritTickers: culprits,
      totalWarmupDays: warmupDays,
      culpritElement: culprit,
      steps,
    },
  };
}

/**
 * Helper: Get a date grid filtered to valid dates for given elements
 *
 * @param elements - Strategy elements
 * @param priceData - Historical price data
 * @param fullDateGrid - Complete date grid to filter
 * @returns Filtered date grid starting from effective start
 */
export function getValidDateGrid(
  elements: any[],
  priceData: PriceData,
  fullDateGrid: string[],
  indicatorData?: IndicatorData
): string[] {
  let effectiveStart = calculateEffectiveStart(elements, priceData).effectiveStart;

  // Check when precomputed Sort indicators are actually available
  // This applies to any element that contains nested Sorts (Sort, Gate, Scale, etc.)
  if (indicatorData && elements.length > 0) {
    let latestIndicatorStart: string | null = null;

    // Helper to recursively find all Sort indicators in the tree
    const findSortIndicators = (els: any[]) => {
      for (const el of els || []) {
        if (!el || typeof el !== 'object') continue;

        if (el.type === 'sort' && el.children) {
          // Check when this Sort's child indicators become available
          for (const child of el.children) {
            const sortTicker = `SORT_${el.id}_${child.id}`;
            const indicator = el.indicator;

            // Look for the indicator key in indicatorData (pipe-separated format)
            for (const key of Object.keys(indicatorData)) {
              if (key.startsWith(`${sortTicker}|${indicator}|`)) {
                const dates = Object.keys(indicatorData[key]).sort();
                if (dates.length > 0) {
                  const firstDate = dates[0];
                  if (!latestIndicatorStart || firstDate > latestIndicatorStart) {
                    latestIndicatorStart = firstDate;
                  }
                }
              }
            }
          }
        }

        // Recursively check all child branches
        if (el.children) findSortIndicators(el.children);
        if (el.thenChildren) findSortIndicators(el.thenChildren);
        if (el.elseChildren) findSortIndicators(el.elseChildren);
        if (el.fromChildren) findSortIndicators(el.fromChildren);
        if (el.toChildren) findSortIndicators(el.toChildren);
      }
    };

    findSortIndicators(elements);

    // Use the later of: calculated effective start OR actual indicator availability
    if (latestIndicatorStart && latestIndicatorStart > effectiveStart) {
      effectiveStart = latestIndicatorStart;
    }
  }

  return fullDateGrid.filter(date => date >= effectiveStart);
}

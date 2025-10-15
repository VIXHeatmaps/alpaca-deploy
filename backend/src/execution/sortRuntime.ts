import axios from 'axios';
import { paramsToPeriodString } from '../utils/indicatorKeys';
import { getValidDateGrid } from '../utils/effectiveStartCalculator';
import type { Element, ExecutionResult } from './types';

export type PriceData = {
  [ticker: string]: {
    [date: string]: {
      c: number;
    };
  };
};

export type IndicatorValues = {
  [key: string]: {
    [date: string]: number;
  };
};

const INDICATOR_SERVICE_URL = process.env.INDICATOR_SERVICE_URL || 'http://127.0.0.1:8001';

export function buildSortTicker(sortId: string, childId: string): string {
  return `SORT_${sortId}_${childId}`;
}

function describeNode(element: any): string {
  if (!element || typeof element !== 'object') return 'unknown';
  if (element.type === 'ticker') {
    return element.ticker || element.id || 'ticker';
  }
  if (element.name) {
    return `${element.type}:${element.name}`;
  }
  return `${element.type}:${element.id}`;
}

function cloneElement<T>(element: T): T {
  return JSON.parse(JSON.stringify(element));
}

function collectSortDescriptors(elements: Element[], depth = 0): Array<{ sort: Element; depth: number }> {
  const result: Array<{ sort: Element; depth: number }> = [];

  for (const el of elements || []) {
    if (!el || typeof el !== 'object') continue;
    if (el.type === 'sort') {
      result.push({ sort: el, depth });
    }

    if ((el as any).children) {
      result.push(...collectSortDescriptors((el as any).children, depth + 1));
    }
    if ((el as any).thenChildren) {
      result.push(...collectSortDescriptors((el as any).thenChildren, depth + 1));
    }
    if ((el as any).elseChildren) {
      result.push(...collectSortDescriptors((el as any).elseChildren, depth + 1));
    }
    if ((el as any).fromChildren) {
      result.push(...collectSortDescriptors((el as any).fromChildren, depth + 1));
    }
    if ((el as any).toChildren) {
      result.push(...collectSortDescriptors((el as any).toChildren, depth + 1));
    }
  }

  return result;
}

export function collectIndicatorValuesForDate(
  indicatorLookup: Map<string, string>,
  indicatorData: IndicatorValues,
  decisionDate: string
): { values: Array<{ ticker: string; indicator: string; period: string; value: number }>; missing: string[] } {
  const indicatorValues: Array<{ ticker: string; indicator: string; period: string; value: number }> = [];
  const addedKeys = new Set<string>();
  const missingIndicators: string[] = [];

  for (const [cacheKey, values] of Object.entries(indicatorData)) {
    const [ticker, indicator, periodStr] = cacheKey.split('|');
    const value = values[decisionDate];

    if (value === undefined || value === null || !isFinite(value)) {
      const lookupKey = `${ticker}:${indicator}`;
      if (indicatorLookup.has(lookupKey)) {
        missingIndicators.push(`${ticker} ${indicator}(${periodStr}) on ${decisionDate}`);
      }
      continue;
    }

    const lookupKey = `${ticker}:${indicator}`;
    const periodsUsed: string[] = [];
    for (const [k, v] of indicatorLookup.entries()) {
      if (k === lookupKey) {
        periodsUsed.push(v);
      }
    }

    if (periodsUsed.length === 0) {
      periodsUsed.push(periodStr);
    }

    for (const period of periodsUsed) {
      const entryKey = `${ticker}:${indicator}:${period}`;
      if (!addedKeys.has(entryKey)) {
        indicatorValues.push({ ticker, indicator, period, value });
        addedKeys.add(entryKey);
      }
    }
  }

  return { values: indicatorValues, missing: missingIndicators };
}

function normalizePositions(positions: Array<{ ticker: string; weight: number }>): Array<{ ticker: string; weight: number }> {
  const total = positions.reduce((sum, pos) => sum + pos.weight, 0);
  if (total <= 0) return [];
  return positions.map((pos) => ({ ticker: pos.ticker.toUpperCase(), weight: pos.weight / total }));
}

function computeDailyReturn(
  normalizedPositions: Array<{ ticker: string; weight: number }>,
  decisionDate: string,
  executionDate: string,
  priceData: PriceData,
  sortName: string,
  branchLabel: string
): number {
  let dailyReturn = 0;

  for (const pos of normalizedPositions) {
    const tickerData = priceData[pos.ticker];
    if (!tickerData) {
      throw new Error(`Sort "${sortName}" branch ${branchLabel} missing price data for ${pos.ticker}`);
    }

    const priceT0 = tickerData[decisionDate]?.c;
    const priceT1 = tickerData[executionDate]?.c;

    if (!priceT0 || !priceT1 || priceT0 <= 0) {
      throw new Error(`Sort "${sortName}" branch ${branchLabel} missing price data for ${pos.ticker} on ${decisionDate}/${executionDate}`);
    }

    const positionReturn = (priceT1 / priceT0) - 1;
    dailyReturn += pos.weight * positionReturn;
  }

  return dailyReturn;
}

function buildSortIndicatorPayload(indicator: string, params: Record<string, string>, series: number[]) {
  const normalizedParams: Record<string, any> = {};
  for (const [key, value] of Object.entries(params || {})) {
    const asNumber = Number(value);
    normalizedParams[key] = Number.isFinite(asNumber) ? asNumber : value;
  }

  const payload: any = {
    indicator,
    params: normalizedParams,
    close: series,
    prices: series,
  };

  const ind = indicator.toUpperCase();

  if (ind === 'ATR' || ind === 'ADX' || ind === 'MFI' || ind === 'STOCH_K' || ind.startsWith('AROON')) {
    payload.high = series;
    payload.low = series;
  }

  if (ind === 'MFI') {
    payload.volume = new Array(series.length).fill(0);
  }

  return payload;
}

function getPeriodKey(indicator: string, params?: Record<string, string>, fallbackPeriod?: string): string {
  const periodStr = params && Object.keys(params).length > 0
    ? paramsToPeriodString(indicator, params)
    : fallbackPeriod || '';
  return periodStr || '0';
}

function simulateBranchEquity(
  sortName: string,
  childLabel: string,
  childElement: Element,
  dateGrid: string[],
  priceData: PriceData,
  indicatorData: IndicatorValues,
  executeStrategy: (elements: Element[], indicatorMap: Map<string, any>, debug?: boolean) => ExecutionResult,
  buildIndicatorMap: (values: Array<{ ticker: string; indicator: string; period: string; value: number }>) => Map<string, any>,
  debug = false
): number[] {
  const branchElement = cloneElement(childElement);
  (branchElement as any).weight = 100;
  const branchElements = [branchElement];

  // CRITICAL: Only filter dateGrid if this branch has its own nested elements
  // If it's a leaf (ticker), use the parent's dateGrid as-is
  let validDateGrid = dateGrid;

  if (childElement.type !== 'ticker') {
    // This branch has nested logic (Sort, Gate, etc), so calculate its warmup
    validDateGrid = getValidDateGrid(branchElements, priceData, dateGrid);

    if (debug) {
      console.log(`[SORT] Branch ${childLabel} valid date range: ${validDateGrid[0]} to ${validDateGrid[validDateGrid.length - 1]} (${validDateGrid.length} days, trimmed ${dateGrid.length - validDateGrid.length} days)`);
    }
  } else {
    // Leaf ticker - use parent's dateGrid directly (parent already handled warmup)
    if (debug) {
      console.log(`[SORT] Branch ${childLabel} (leaf ticker) using parent dateGrid: ${dateGrid[0]} to ${dateGrid[dateGrid.length - 1]} (${dateGrid.length} days)`);
    }
  }

  const indicatorLookup = buildIndicatorLookupMap(branchElements);

  let equity = 1;
  const equitySeries: number[] = [equity];

  for (let i = 1; i < validDateGrid.length; i++) {
    const decisionDate = validDateGrid[i - 1];
    const executionDate = validDateGrid[i];

    const { values: indicatorValuesForDate, missing } = collectIndicatorValuesForDate(
      indicatorLookup,
      indicatorData,
      decisionDate
    );

    if (missing.length > 0) {
      throw new Error(
        `Sort "${sortName}" branch ${childLabel} missing indicator inputs on ${decisionDate}: ${missing.join(', ')}`
      );
    }

    const indicatorMap = buildIndicatorMap(indicatorValuesForDate);
    const result = executeStrategy(branchElements, indicatorMap, debug);

    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Sort "${sortName}" branch ${childLabel} execution error on ${decisionDate}: ${result.errors.join('; ')}`
      );
    }

    const normalizedPositions = normalizePositions(result.positions);
    const dailyReturn = computeDailyReturn(
      normalizedPositions,
      decisionDate,
      executionDate,
      priceData,
      sortName,
      childLabel
    );

    equity *= (1 + dailyReturn);
    equitySeries.push(equity);
  }

  return equitySeries;
}

async function computeSortIndicatorSeries(
  sort: any,
  child: Element,
  equitySeries: number[],
  dateGrid: string[],
  indicatorServiceUrl: string
): Promise<{ valuesByDate: Record<string, number>; firstValidDate: string | null }> {
  const payload = buildSortIndicatorPayload(sort.indicator, sort.params || {}, equitySeries);

  const response = await axios.post(`${indicatorServiceUrl}/indicator`, payload, {
    timeout: 30000,
  });

  const values: Array<number | null> = response.data?.values || [];
  const valuesByDate: Record<string, number> = {};
  let firstValidDate: string | null = null;

  for (let idx = 0; idx < dateGrid.length; idx++) {
    const raw = values[idx];
    const date = dateGrid[idx];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      valuesByDate[date] = raw;
      if (!firstValidDate) {
        firstValidDate = date;
      }
    } else if (firstValidDate) {
      throw new Error(
        `Sort "${sort.name}" branch ${describeNode(child)} missing computed indicator values on ${date}`
      );
    }
  }

  if (!firstValidDate) {
    throw new Error(`Sort "${sort.name}" branch ${describeNode(child)} produced no indicator values`);
  }

  return { valuesByDate, firstValidDate };
}

export function buildIndicatorLookupMap(elements: Element[]): Map<string, string> {
  const map = new Map<string, string>();

  const traverse = (els: Element[]) => {
    for (const el of els || []) {
      if (el.type === 'gate' && Array.isArray((el as any).conditions)) {
        for (const cond of (el as any).conditions) {
          if (cond.ticker && cond.indicator) {
            const key = `${cond.ticker.toUpperCase()}:${cond.indicator.toUpperCase()}`;
            const periodStr = paramsToPeriodString(cond.indicator, cond.params) || cond.period || '';
            map.set(key, periodStr);
          }
          if (cond.compareTo === 'indicator' && cond.rightTicker && cond.rightIndicator) {
            const key = `${cond.rightTicker.toUpperCase()}:${cond.rightIndicator.toUpperCase()}`;
            const periodStr = paramsToPeriodString(cond.rightIndicator, cond.rightParams) || cond.rightPeriod || '';
            map.set(key, periodStr);
          }
        }
      }
      if (el.type === 'scale' && (el as any).config) {
        const cfg = (el as any).config;
        if (cfg.ticker && cfg.indicator) {
          const key = `${cfg.ticker.toUpperCase()}:${cfg.indicator.toUpperCase()}`;
          const periodStr = paramsToPeriodString(cfg.indicator, cfg.params) || cfg.period || '';
          map.set(key, periodStr);
        }
      }
      if (el.type === 'sort') {
        const periodStr = paramsToPeriodString((el as any).indicator, (el as any).params) || (el as any).period || '';
        for (const child of (el as any).children || []) {
          const sortTicker = buildSortTicker(el.id, child.id);
          const key = `${sortTicker}:${(el as any).indicator}`;
          map.set(key, periodStr);
        }
      }
      if ((el as any).children) traverse((el as any).children);
      if ((el as any).thenChildren) traverse((el as any).thenChildren);
      if ((el as any).elseChildren) traverse((el as any).elseChildren);
      if ((el as any).fromChildren) traverse((el as any).fromChildren);
      if ((el as any).toChildren) traverse((el as any).toChildren);
    }
  };

  traverse(elements);
  return map;
}

export async function precomputeSortIndicators(options: {
  elements: Element[];
  priceData: PriceData;
  indicatorData: IndicatorValues;
  dateGrid: string[];
  executeStrategy: (elements: Element[], indicatorMap: Map<string, any>, debug?: boolean) => ExecutionResult;
  buildIndicatorMap: (values: Array<{ ticker: string; indicator: string; period: string; value: number }>) => Map<string, any>;
  debug?: boolean;
  indicatorServiceUrl?: string;
}): Promise<string | null> {
  const {
    elements,
    priceData,
    indicatorData,
    dateGrid,
    executeStrategy,
    buildIndicatorMap,
    debug = false,
    indicatorServiceUrl = INDICATOR_SERVICE_URL,
  } = options;

  const descriptors = collectSortDescriptors(elements).sort((a, b) => b.depth - a.depth);
  if (descriptors.length === 0) {
    return null;
  }

  if (debug) {
    console.log(`\n[SORT] Precomputing indicators for ${descriptors.length} sort node(s)`);
  }

  let sortStartDate: string | null = null;

  for (const { sort } of descriptors) {
    const sortNode: any = sort;
    if (!sortNode.children || sortNode.children.length === 0) {
      continue;
    }

    if (debug) {
      console.log(`[SORT]   Sort "${sortNode.name}" (${sortNode.children.length} branches)`);
    }

    for (const child of sortNode.children) {
      const childLabel = describeNode(child);
      const equitySeries = simulateBranchEquity(
        sortNode.name,
        childLabel,
        child,
        dateGrid,
        priceData,
        indicatorData,
        executeStrategy,
        buildIndicatorMap,
        debug
      );

      const { valuesByDate, firstValidDate } = await computeSortIndicatorSeries(
        sortNode,
        child,
        equitySeries,
        dateGrid,
        indicatorServiceUrl
      );
      const sortTicker = buildSortTicker(sortNode.id, child.id);
      const periodKey = getPeriodKey(sortNode.indicator, sortNode.params, sortNode.period);
      const key = `${sortTicker}|${sortNode.indicator}|${periodKey}`;
      indicatorData[key] = valuesByDate;

      if (firstValidDate) {
        if (!sortStartDate || firstValidDate > sortStartDate) {
          sortStartDate = firstValidDate;
        }
      }

      if (debug) {
        console.log(`[SORT]     Computed indicator for ${childLabel}: key=${key}`);
      }
    }
  }

  return sortStartDate;
}

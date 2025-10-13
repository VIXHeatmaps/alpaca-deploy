import type { IndicatorValue } from "./types";
import { paramsToPeriodString } from "../utils/indicatorKeys";

/**
 * Helper to create a unique key for indicator data
 */
export function createIndicatorKey(
  ticker: string,
  indicator: string,
  period: string
): string {
  return `${ticker}:${indicator}:${period}`;
}

/**
 * Helper to build indicator data map from array
 */
export function buildIndicatorMap(
  indicators: IndicatorValue[]
): Map<string, IndicatorValue> {
  const map = new Map<string, IndicatorValue>();

  for (const indicator of indicators) {
    const key = createIndicatorKey(
      indicator.ticker,
      indicator.indicator,
      indicator.period
    );
    map.set(key, indicator);
  }

  return map;
}

/**
 * Placeholder function to fetch indicator data from market data provider
 * This will be replaced with actual Alpaca API integration
 */
export async function fetchIndicatorData(
  ticker: string,
  indicator: string,
  period: string
): Promise<IndicatorValue> {
  // TODO: Integrate with Alpaca API or other market data provider
  // For now, return mock data
  return {
    ticker,
    indicator,
    period,
    value: Math.random() * 100, // Mock value
  };
}

/**
 * Collects all unique indicator requirements from strategy elements
 */
export function collectRequiredIndicators(elements: any[]): {
  ticker: string;
  indicator: string;
  period: string;
  params?: Record<string, string>;
}[] {
  const required: Set<string> = new Set();
  const result: { ticker: string; indicator: string; period: string; params?: Record<string, string> }[] = [];

  function traverse(element: any) {
    if (element.type === "gate") {
      // Support both old single condition and new conditions array
      const conditions = element.conditions || (element.condition ? [element.condition] : []);

      for (const cond of conditions) {
        // Left side indicator
        const leftKey = createIndicatorKey(
          cond.ticker,
          cond.indicator,
          paramsToPeriodString(cond.indicator, cond.params || undefined) || cond.period
        );
        if (!required.has(leftKey)) {
          required.add(leftKey);
          result.push({
            ticker: cond.ticker,
            indicator: cond.indicator,
            period: paramsToPeriodString(cond.indicator, cond.params || undefined) || cond.period,
            params: cond.params,
          });
        }

        // Right side indicator (if comparing to another indicator)
        if (cond.compareTo === "indicator" && cond.rightTicker && cond.rightIndicator && cond.rightPeriod) {
          const rightKey = createIndicatorKey(
            cond.rightTicker,
            cond.rightIndicator,
            paramsToPeriodString(cond.rightIndicator, cond.rightParams || undefined) || cond.rightPeriod
          );
          if (!required.has(rightKey)) {
            required.add(rightKey);
            result.push({
              ticker: cond.rightTicker,
              indicator: cond.rightIndicator,
              period: paramsToPeriodString(cond.rightIndicator, cond.rightParams || undefined) || cond.rightPeriod,
              params: cond.rightParams,
            });
          }
        }
      }
    }

    if (element.type === "scale" && element.config) {
      const cfg = element.config;
      const periodStr = paramsToPeriodString(cfg.indicator, cfg.params || undefined) || cfg.period || "";
      const key = createIndicatorKey(cfg.ticker, cfg.indicator, periodStr);
      if (!required.has(key)) {
        required.add(key);
        result.push({
          ticker: cfg.ticker,
          indicator: cfg.indicator,
          period: periodStr,
          params: cfg.params,
        });
      }
    }

    // Traverse children
    if (element.children) {
      element.children.forEach(traverse);
    }
    if (element.thenChildren) {
      element.thenChildren.forEach(traverse);
    }
    if (element.elseChildren) {
      element.elseChildren.forEach(traverse);
    }
    if (element.fromChildren) {
      element.fromChildren.forEach(traverse);
    }
    if (element.toChildren) {
      element.toChildren.forEach(traverse);
    }
  }

  elements.forEach(traverse);
  return result;
}

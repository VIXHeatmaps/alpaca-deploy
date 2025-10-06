import type { IndicatorValue } from "./types";

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
}[] {
  const required: Set<string> = new Set();
  const result: { ticker: string; indicator: string; period: string }[] = [];

  function traverse(element: any) {
    if (element.type === "gate") {
      // Support both old single condition and new conditions array
      const conditions = element.conditions || (element.condition ? [element.condition] : []);

      for (const cond of conditions) {
        // Left side indicator
        const leftKey = createIndicatorKey(cond.ticker, cond.indicator, cond.period);
        if (!required.has(leftKey)) {
          required.add(leftKey);
          result.push({
            ticker: cond.ticker,
            indicator: cond.indicator,
            period: cond.period,
          });
        }

        // Right side indicator (if comparing to another indicator)
        if (cond.compareTo === "indicator" && cond.rightTicker && cond.rightIndicator && cond.rightPeriod) {
          const rightKey = createIndicatorKey(
            cond.rightTicker,
            cond.rightIndicator,
            cond.rightPeriod
          );
          if (!required.has(rightKey)) {
            required.add(rightKey);
            result.push({
              ticker: cond.rightTicker,
              indicator: cond.rightIndicator,
              period: cond.rightPeriod,
            });
          }
        }
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
  }

  elements.forEach(traverse);
  return result;
}

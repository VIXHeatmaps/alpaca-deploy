/**
 * Centralized utility for building indicator cache keys
 * This is the SINGLE SOURCE OF TRUTH for params → period string conversion
 */

/**
 * Convert params object to period string for cache key
 * This must match the format expected by the indicator cache
 */
export function paramsToPeriodString(
  indicator: string,
  params?: Record<string, string>
): string {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }

  const ind = indicator.toUpperCase();

  // Multi-param indicators
  if (ind === 'MACD' || ind.startsWith('MACD_')) {
    const f = params.fastperiod || '12';
    const s = params.slowperiod || '26';
    const sig = params.signalperiod || '9';
    return `${f}-${s}-${sig}`;
  }

  if (ind.startsWith('BBANDS_')) {
    const p = params.period || '20';
    const up = params.nbdevup || '2';
    const dn = params.nbdevdn || '2';
    return `${p}-${up}-${dn}`;
  }

  if (ind === 'STOCH_K') {
    const fastk = params.fastk_period || '14';
    const slowk = params.slowk_period || '3';
    const slowd = params.slowd_period || '3';
    const slowk_ma = params.slowk_matype || '0';
    const slowd_ma = params.slowd_matype || '0';
    return `${fastk}-${slowk}-${slowd}-${slowk_ma}-${slowd_ma}`;
  }

  if (ind === 'PPO_LINE') {
    const f = params.fastperiod || '12';
    const s = params.slowperiod || '26';
    return `${f}-${s}`;
  }

  if (ind === 'PPO_SIGNAL' || ind === 'PPO_HIST') {
    const f = params.fastperiod || '12';
    const s = params.slowperiod || '26';
    const sig = params.signalperiod || '9';
    return `${f}-${s}-${sig}`;
  }

  // Single-param indicators (RSI, SMA, EMA, ATR, etc.)
  return params.period || '';
}

/**
 * Build complete indicator lookup key: "TICKER:INDICATOR:PERIOD"
 * Used by executor to find indicator values in the map
 */
export function buildIndicatorKey(
  ticker: string,
  indicator: string,
  params?: Record<string, string>
): string {
  const periodStr = paramsToPeriodString(indicator, params);
  return `${ticker}:${indicator}:${periodStr}`;
}

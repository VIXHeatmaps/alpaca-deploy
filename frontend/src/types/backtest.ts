/**
 * Types for backtest responses and metrics
 */

export type Metrics = {
  totalReturn: number;
  CAGR: number;
  annualVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  qs_sample_size?: number;
  qs_calmar?: number;
  qs_omega?: number;
  qs_tail_ratio?: number;
  qs_common_sense_ratio?: number;
  qs_value_at_risk?: number;
  qs_cvar?: number;
  qs_ulcer_index?: number;
  qs_avg_drawdown?: number;
  qs_avg_drawdown_days?: number;
  qs_payoff_ratio?: number;
  qs_profit_ratio?: number;
  qs_gain_to_pain_ratio?: number;
  qs_skew?: number;
  qs_kurtosis?: number;
  qs_win_rate?: number;
  qs_loss_rate?: number;
};

export type DebugDay = {
  decisionDate: string;
  heldDate: string;
  indicator: number;
  passed: boolean;
  positionSymbol: string;
  equity: number;
  dailyReturn: number;
  priceRet: number;
};

export type BacktestResp = {
  dates: string[];
  equityCurve: number[];
  metrics: Metrics;
  benchmark?:
    | {
        dates: string[];
        equityCurve: number[];
        metrics: Metrics;
      }
    | null;
  debugDays?: DebugDay[];
  info?: {
    firstFiniteDate: string;
    requestedStart: string | null;
    effectiveStart: string;
    requestedEnd: string | null;
    effectiveEnd: string;
    needBars: number;
    startMessage?: string;
  };
};

export type BacktestPayload = {
  strategy: string;
  symbols: string[];
  indicator_type: string;
  indicator_period?: number;
  indicator_params?: Record<string, number | string>;
  threshold?: number;
  rhs_indicator_type?: string;
  rhs_indicator_period?: number;
  rhs_indicator_params?: Record<string, number | string>;
  start?: string;
  end?: string;
  bench?: string;
  debug?: boolean;
};

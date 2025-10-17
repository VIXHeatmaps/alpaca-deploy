import type { IndicatorName } from "./indicators";

export interface GateCondition {
  ticker: string;
  indicator: IndicatorName;
  period: string;
  params?: Record<string, string>;
  operator: "gt" | "lt";
  compareTo: "threshold" | "indicator";
  threshold: string;
  rightTicker?: string;
  rightIndicator?: IndicatorName;
  rightPeriod?: string;
  rightParams?: Record<string, string>;
}

export interface GateElement {
  id: string;
  type: "gate";
  name: string;
  weight: number;
  conditionMode: "if" | "if_all" | "if_any" | "if_none";
  conditions: GateCondition[];
  condition?: GateCondition;
  thenChildren: Element[];
  elseChildren: Element[];
}

export interface TickerElement {
  id: string;
  type: "ticker";
  ticker: string;
  weight: number;
}

export interface WeightElement {
  id: string;
  type: "weight";
  name: string;
  weight: number;
  weightMode: "equal" | "defined";
  children: Element[];
}

export interface SortElement {
  id: string;
  type: "sort";
  name: string;
  weight: number;
  direction: "top" | "bottom";
  count: number;
  indicator: IndicatorName;
  params?: Record<string, string>;
  period?: string;
  children: Element[];
}

export interface ScaleConfig {
  ticker: string;
  indicator: IndicatorName;
  params?: Record<string, string>;
  period?: string;
  rangeMin: string;
  rangeMax: string;
}

export interface ScaleElement {
  id: string;
  type: "scale";
  name: string;
  weight: number;
  config: ScaleConfig;
  fromChildren: Element[];
  toChildren: Element[];
}

export type Element = GateElement | TickerElement | WeightElement | ScaleElement | SortElement;

export interface StrategyVersion {
  major: number;
  minor: number;
  patch: number;
  fork: string;
}

export interface StrategyTab {
  id: string;
  elements: Element[];
  history: Element[][];
  historyIndex: number;
  benchmarkSymbol: string;
  startDate: string;
  endDate: string;
  backtestResults: any;
  strategyName: string;
  versioningEnabled: boolean;
  version: StrategyVersion;
  createdAt: string;
  updatedAt: string;
  note?: string | null; // Short description (single line)
  description?: string | null; // Long-form markdown description
  nameBarExpanded?: boolean; // UI state: is name bar expanded?
  strategyId?: number; // Database ID when loaded from saved strategy
}

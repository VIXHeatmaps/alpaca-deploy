// Strategy execution types

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

export interface GateCondition {
  ticker: string;
  indicator: string;
  period: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
  compareTo: "indicator" | "value" | "threshold";
  threshold: string;
  rightTicker?: string;
  rightIndicator?: string;
  rightPeriod?: string;
}

export interface GateElement {
  id: string;
  type: "gate";
  name: string;
  weight: number;
  conditionMode: "if" | "if_all" | "if_any" | "if_none";
  conditions: GateCondition[];
  condition?: GateCondition; // Backward compatibility - deprecated
  thenChildren: Element[];
  elseChildren: Element[];
}

export type Element = TickerElement | WeightElement | GateElement;

export interface Position {
  ticker: string;
  weight: number; // Percentage allocation
}

export interface IndicatorValue {
  ticker: string;
  indicator: string;
  period: string;
  value: number;
}

export interface ExecutionContext {
  baseWeight: number; // The weight multiplier from parent elements
  indicatorData: Map<string, IndicatorValue>;
}

export interface GateEvaluation {
  gateId: string;
  gateName: string;
  conditionMet: boolean; // true = THEN, false = ELSE
}

export interface ExecutionResult {
  positions: Position[];
  executionPath: string[]; // Track which branches were taken
  errors: string[];
  gateEvaluations: GateEvaluation[]; // Track which gates fired and which branch
}

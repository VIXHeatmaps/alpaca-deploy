import type { Element, TickerElement, WeightElement, GateElement, ScaleElement, SortElement } from "./types";

export interface ValidationError {
  elementId: string;
  elementType: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validates a complete strategy
 */
export function validateStrategy(elements: Element[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check that we have at least one element
  if (!elements || elements.length === 0) {
    errors.push({
      elementId: "root",
      elementType: "strategy",
      field: "elements",
      message: "Strategy must have at least one element",
      severity: "error",
    });
    return { valid: false, errors, warnings };
  }

  // Check that top-level weights sum to 100%
  const topLevelWeightSum = elements.reduce((sum, el) => sum + (el.weight || 0), 0);
  if (Math.abs(topLevelWeightSum - 100) > 0.01) {
    errors.push({
      elementId: "root",
      elementType: "strategy",
      field: "weights",
      message: `Top-level elements must sum to 100% (currently ${topLevelWeightSum.toFixed(2)}%)`,
      severity: "error",
    });
  }

  // Validate each element recursively
  for (const element of elements) {
    validateElement(element, errors, warnings);
  }

  // Check that at least one ticker is reachable
  const hasReachableTicker = elements.some(el => hasTickerInTree(el));
  if (!hasReachableTicker) {
    errors.push({
      elementId: "root",
      elementType: "strategy",
      field: "structure",
      message: "Strategy must have at least one ticker that can be reached",
      severity: "error",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks if an element tree contains at least one ticker
 */
function hasTickerInTree(element: Element): boolean {
  if (element.type === "ticker") {
    return true;
  } else if (element.type === "weight") {
    const weight = element as WeightElement;
    return weight.children.some(child => hasTickerInTree(child));
  } else if (element.type === "gate") {
    const gate = element as GateElement;
    const hasThenTicker = gate.thenChildren.some(child => hasTickerInTree(child));
    const hasElseTicker = gate.elseChildren.some(child => hasTickerInTree(child));
    return hasThenTicker || hasElseTicker;
  } else if (element.type === "scale") {
    const scale = element as ScaleElement;
    const hasFromTicker = scale.fromChildren.some(child => hasTickerInTree(child));
    const hasToTicker = scale.toChildren.some(child => hasTickerInTree(child));
    return hasFromTicker || hasToTicker;
  } else if (element.type === "sort") {
    const sort = element as SortElement;
    return sort.children.some(child => hasTickerInTree(child));
  }
  return false;
}

/**
 * Validates a single element recursively
 */
function validateElement(
  element: Element,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  // Common validations
  if (!element.id) {
    errors.push({
      elementId: element.id || "unknown",
      elementType: element.type,
      field: "id",
      message: "Element must have an ID",
      severity: "error",
    });
  }

  if (element.weight !== undefined && element.weight !== null) {
    if (element.weight < 0 || element.weight > 100) {
      errors.push({
        elementId: element.id,
        elementType: element.type,
        field: "weight",
        message: `Weight must be between 0 and 100 (currently ${element.weight}%)`,
        severity: "error",
      });
    }
  }

  // Type-specific validations
  if (element.type === "ticker") {
    validateTicker(element as TickerElement, errors, warnings);
  } else if (element.type === "weight") {
    validateWeight(element as WeightElement, errors, warnings);
  } else if (element.type === "gate") {
    validateGate(element as GateElement, errors, warnings);
  } else if (element.type === "scale") {
    validateScale(element as ScaleElement, errors, warnings);
  } else if (element.type === "sort") {
    validateSort(element as SortElement, errors, warnings);
  }
}

/**
 * Validates a ticker element
 */
function validateTicker(
  ticker: TickerElement,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!ticker.ticker || ticker.ticker.trim() === "") {
    errors.push({
      elementId: ticker.id,
      elementType: "ticker",
      field: "ticker",
      message: "Ticker symbol cannot be empty",
      severity: "error",
    });
  } else if (ticker.ticker.length > 10) {
    warnings.push({
      elementId: ticker.id,
      elementType: "ticker",
      field: "ticker",
      message: `Ticker symbol "${ticker.ticker}" is unusually long`,
      severity: "warning",
    });
  }

  // Check for common invalid ticker patterns
  if (ticker.ticker && /[^A-Z0-9.]/.test(ticker.ticker)) {
    warnings.push({
      elementId: ticker.id,
      elementType: "ticker",
      field: "ticker",
      message: `Ticker symbol "${ticker.ticker}" contains invalid characters (should be uppercase letters, numbers, or dots)`,
      severity: "warning",
    });
  }
}

/**
 * Validates a weight element
 */
function validateWeight(
  weight: WeightElement,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!weight.name || weight.name.trim() === "") {
    warnings.push({
      elementId: weight.id,
      elementType: "weight",
      field: "name",
      message: "Weight element should have a name",
      severity: "warning",
    });
  }

  if (!weight.weightMode || (weight.weightMode !== "equal" && weight.weightMode !== "defined")) {
    errors.push({
      elementId: weight.id,
      elementType: "weight",
      field: "weightMode",
      message: `Weight mode must be "equal" or "defined" (currently "${weight.weightMode}")`,
      severity: "error",
    });
  }

  if (!weight.children || weight.children.length === 0) {
    errors.push({
      elementId: weight.id,
      elementType: "weight",
      field: "children",
      message: "Weight element must have at least one child",
      severity: "error",
    });
  } else {
    // Check that children weights sum to 100% (only in "defined" mode)
    if (weight.weightMode === "defined") {
      const childWeightSum = weight.children.reduce((sum, child) => sum + (child.weight || 0), 0);
      if (Math.abs(childWeightSum - 100) > 0.01) {
        errors.push({
          elementId: weight.id,
          elementType: "weight",
          field: "children",
          message: `Children weights must sum to 100% (currently ${childWeightSum.toFixed(2)}%)`,
          severity: "error",
        });
      }
    }

    // Recursively validate children
    for (const child of weight.children) {
      validateElement(child, errors, warnings);
    }
  }
}

/**
 * Validates a gate element
 */
function validateGate(
  gate: GateElement,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!gate.name || gate.name.trim() === "") {
    warnings.push({
      elementId: gate.id,
      elementType: "gate",
      field: "name",
      message: "Gate element should have a name",
      severity: "warning",
    });
  }

  // Validate conditionMode
  const validModes = ["if", "if_all", "if_any", "if_none"];
  if (!gate.conditionMode || !validModes.includes(gate.conditionMode)) {
    errors.push({
      elementId: gate.id,
      elementType: "gate",
      field: "conditionMode",
      message: `Invalid condition mode. Must be one of: ${validModes.join(", ")}`,
      severity: "error",
    });
  }

  // Validate conditions array
  if (!gate.conditions || !Array.isArray(gate.conditions) || gate.conditions.length === 0) {
    errors.push({
      elementId: gate.id,
      elementType: "gate",
      field: "conditions",
      message: "Gate must have at least one condition",
      severity: "error",
    });
    return;
  }

  // Validate each condition
  gate.conditions.forEach((cond: any, index: number) => {
    const fieldPrefix = `conditions.${index}`;

  // Validate ticker
  if (!cond.ticker || cond.ticker.trim() === "") {
    errors.push({
      elementId: gate.id,
      elementType: "gate",
      field: `${fieldPrefix}.ticker`,
      message: "Condition must specify a ticker symbol",
      severity: "error",
    });
  }

  // Validate indicator
  if (!cond.indicator || cond.indicator.trim() === "") {
    errors.push({
      elementId: gate.id,
      elementType: "gate",
      field: `${fieldPrefix}.indicator`,
      message: "Condition must specify an indicator",
      severity: "error",
    });
  }

  // Validate period (if required for indicator)
  const indicatorsRequiringPeriod = ["RSI", "SMA", "EMA", "ATR", "ADX", "MFI", "STOCH_K", "AROONOSC"];
  if (indicatorsRequiringPeriod.includes(cond.indicator?.toUpperCase() || "")) {
    if (!cond.period || cond.period.trim() === "") {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.period`,
        message: `Indicator "${cond.indicator}" requires a period`,
        severity: "error",
      });
    } else {
      const periodNum = parseInt(cond.period, 10);
      if (isNaN(periodNum) || periodNum < 1) {
        errors.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.period`,
          message: `Period must be a positive integer (currently "${cond.period}")`,
          severity: "error",
        });
      } else if (periodNum > 1000) {
        warnings.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.period`,
          message: `Period ${periodNum} is unusually large`,
          severity: "warning",
        });
      }
    }
  }

  // Validate operator
  const validOperators = ["gt", "lt", "gte", "lte", "eq", "neq"];
  if (!cond.operator || !validOperators.includes(cond.operator)) {
    errors.push({
      elementId: gate.id,
      elementType: "gate",
      field: `${fieldPrefix}.operator`,
      message: `Invalid operator "${cond.operator}". Must be one of: ${validOperators.join(", ")}`,
      severity: "error",
    });
  }

  // Validate compareTo and threshold/rightIndicator
  if (!cond.compareTo || (cond.compareTo !== "threshold" && cond.compareTo !== "value" && cond.compareTo !== "indicator")) {
    errors.push({
      elementId: gate.id,
      elementType: "gate",
      field: `${fieldPrefix}.compareTo`,
      message: `compareTo must be "threshold", "value", or "indicator" (currently "${cond.compareTo}")`,
      severity: "error",
    });
  } else if (cond.compareTo === "threshold" || cond.compareTo === "value") {
    // Validate threshold
    if (cond.threshold === undefined || cond.threshold === null || cond.threshold === "") {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.threshold`,
        message: "Threshold value is required when comparing to threshold",
        severity: "error",
      });
    } else {
      const thresholdNum = parseFloat(cond.threshold);
      if (isNaN(thresholdNum)) {
        errors.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.threshold`,
          message: `Threshold must be a valid number (currently "${cond.threshold}")`,
          severity: "error",
        });
      }
    }
  } else if (cond.compareTo === "indicator") {
    // Validate right-hand indicator
    if (!cond.rightTicker || cond.rightTicker.trim() === "") {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.rightTicker`,
        message: "Right-hand ticker is required when comparing to indicator",
        severity: "error",
      });
    }
    if (!cond.rightIndicator || cond.rightIndicator.trim() === "") {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.rightIndicator`,
        message: "Right-hand indicator is required when comparing to indicator",
        severity: "error",
      });
    }
    if (indicatorsRequiringPeriod.includes(cond.rightIndicator?.toUpperCase() || "")) {
      if (!cond.rightPeriod || cond.rightPeriod.trim() === "") {
        errors.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.rightPeriod`,
          message: "Right-hand period is required for this indicator",
          severity: "error",
        });
      }
    }
  }
  });

  // Validate branches (at least one branch should be non-empty, or warn)
  const hasThenChildren = gate.thenChildren && gate.thenChildren.length > 0;
  const hasElseChildren = gate.elseChildren && gate.elseChildren.length > 0;

  if (!hasThenChildren && !hasElseChildren) {
    warnings.push({
      elementId: gate.id,
      elementType: "gate",
      field: "branches",
      message: "Gate has no children in either branch - weight will always be redistributed",
      severity: "warning",
    });
  }

  // Validate THEN children weights if multiple
  if (hasThenChildren && gate.thenChildren.length > 1) {
    const thenWeightSum = gate.thenChildren.reduce((sum, child) => sum + (child.weight || 0), 0);
    if (Math.abs(thenWeightSum - 100) > 0.01) {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: "thenChildren",
        message: `THEN branch children weights must sum to 100% (currently ${thenWeightSum.toFixed(2)}%)`,
        severity: "error",
      });
    }
  }

  // Validate ELSE children weights if multiple
  if (hasElseChildren && gate.elseChildren.length > 1) {
    const elseWeightSum = gate.elseChildren.reduce((sum, child) => sum + (child.weight || 0), 0);
    if (Math.abs(elseWeightSum - 100) > 0.01) {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: "elseChildren",
        message: `ELSE branch children weights must sum to 100% (currently ${elseWeightSum.toFixed(2)}%)`,
        severity: "error",
      });
    }
  }

  // Recursively validate children
  if (hasThenChildren) {
    for (const child of gate.thenChildren) {
      validateElement(child, errors, warnings);
    }
  }
  if (hasElseChildren) {
    for (const child of gate.elseChildren) {
      validateElement(child, errors, warnings);
    }
  }
}

function validateScale(
  scale: ScaleElement,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!scale.name || scale.name.trim() === "") {
    warnings.push({
      elementId: scale.id,
      elementType: "scale",
      field: "name",
      message: "Scale element should have a name",
      severity: "warning",
    });
  }

  if (!scale.config) {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "config",
      message: "Scale element is missing configuration",
      severity: "error",
    });
    return;
  }

  const { ticker, indicator, rangeMin, rangeMax } = scale.config;
  if (!ticker || ticker.trim() === "") {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "ticker",
      message: "Scale indicator ticker cannot be empty",
      severity: "error",
    });
  }

  if (!indicator || indicator.trim() === "") {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "indicator",
      message: "Scale indicator type is required",
      severity: "error",
    });
  }

  const minVal = parseFloat(rangeMin ?? "");
  const maxVal = parseFloat(rangeMax ?? "");
  if (!Number.isFinite(minVal)) {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "rangeMin",
      message: "Scale minimum must be a valid number",
      severity: "error",
    });
  }

  if (!Number.isFinite(maxVal)) {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "rangeMax",
      message: "Scale maximum must be a valid number",
      severity: "error",
    });
  }

  if (Number.isFinite(minVal) && Number.isFinite(maxVal) && minVal === maxVal) {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "range",
      message: "Scale minimum and maximum cannot be equal",
      severity: "error",
    });
  }

  if (!scale.fromChildren || scale.fromChildren.length === 0) {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "fromChildren",
      message: "Scale must have at least one child in the 'From' branch",
      severity: "error",
    });
  } else {
    scale.fromChildren.forEach(child => validateElement(child, errors, warnings));
  }

  if (!scale.toChildren || scale.toChildren.length === 0) {
    errors.push({
      elementId: scale.id,
      elementType: "scale",
      field: "toChildren",
      message: "Scale must have at least one child in the 'To' branch",
      severity: "error",
    });
  } else {
    scale.toChildren.forEach(child => validateElement(child, errors, warnings));
  }
}

function validateSort(
  sort: SortElement,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!sort.name || sort.name.trim() === "") {
    warnings.push({
      elementId: sort.id,
      elementType: "sort",
      field: "name",
      message: "Sort element should have a name",
      severity: "warning",
    });
  }

  if (!Number.isFinite(sort.count) || sort.count <= 0) {
    errors.push({
      elementId: sort.id,
      elementType: "sort",
      field: "count",
      message: "Sort count must be a positive number",
      severity: "error",
    });
  }

  if (!sort.indicator || typeof sort.indicator !== "string") {
    errors.push({
      elementId: sort.id,
      elementType: "sort",
      field: "indicator",
      message: "Sort indicator is required",
      severity: "error",
    });
  }

  if (!sort.children || sort.children.length === 0) {
    errors.push({
      elementId: sort.id,
      elementType: "sort",
      field: "children",
      message: "Sort element must have at least one child branch",
      severity: "error",
    });
    return;
  }

  for (const child of sort.children) {
    validateElement(child, errors, warnings);
  }
}

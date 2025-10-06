// Frontend validation utilities (mirrors backend validation logic)

/**
 * Check if a value is a variable token (starts with $)
 */
function isVariableToken(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^\$[A-Za-z0-9_]+$/.test(trimmed);
}

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

interface Element {
  id: string;
  type: "ticker" | "weight" | "gate";
  weight: number;
  [key: string]: any;
}

/**
 * Validates a complete strategy
 */
export function validateStrategy(elements: Element[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

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
      message: "Strategy must have at least one ticker",
      severity: "error",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function hasTickerInTree(element: Element): boolean {
  if (element.type === "ticker") {
    return true;
  } else if (element.type === "weight") {
    return element.children?.some((child: Element) => hasTickerInTree(child)) || false;
  } else if (element.type === "gate") {
    const hasThen = element.thenChildren?.some((child: Element) => hasTickerInTree(child)) || false;
    const hasElse = element.elseChildren?.some((child: Element) => hasTickerInTree(child)) || false;
    return hasThen || hasElse;
  }
  return false;
}

function validateElement(
  element: Element,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
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

  if (element.type === "ticker") {
    validateTicker(element, errors, warnings);
  } else if (element.type === "weight") {
    validateWeight(element, errors, warnings);
  } else if (element.type === "gate") {
    validateGate(element, errors, warnings);
  }
}

function validateTicker(
  ticker: Element,
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
  }
}

function validateWeight(
  weight: Element,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!weight.children || weight.children.length === 0) {
    errors.push({
      elementId: weight.id,
      elementType: "weight",
      field: "children",
      message: "Weight element must have at least one child",
      severity: "error",
    });
  } else {
    if (weight.weightMode === "defined") {
      const childWeightSum = weight.children.reduce((sum: number, child: Element) => sum + (child.weight || 0), 0);
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

    for (const child of weight.children) {
      validateElement(child, errors, warnings);
    }
  }
}

function validateGate(
  gate: Element,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
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

    if (!cond.ticker || cond.ticker.trim() === "") {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.ticker`,
        message: "Condition must specify a ticker symbol",
        severity: "error",
      });
    }

    if (!cond.indicator || cond.indicator.trim() === "") {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.indicator`,
        message: "Condition must specify an indicator",
        severity: "error",
      });
    }

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
      } else if (!isVariableToken(cond.period)) {
        // Only validate as number if it's not a variable token
        const periodNum = parseInt(cond.period, 10);
        if (isNaN(periodNum) || periodNum < 1) {
          errors.push({
            elementId: gate.id,
            elementType: "gate",
            field: `${fieldPrefix}.period`,
            message: `Period must be a positive integer or variable (currently "${cond.period}")`,
            severity: "error",
          });
        }
      }
    }

    const validOperators = ["gt", "lt", "gte", "lte", "eq", "neq"];
    if (!cond.operator || !validOperators.includes(cond.operator)) {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.operator`,
        message: `Invalid operator. Must be one of: ${validOperators.join(", ")}`,
        severity: "error",
      });
    }

    if (!cond.compareTo || (cond.compareTo !== "threshold" && cond.compareTo !== "value" && cond.compareTo !== "indicator")) {
      errors.push({
        elementId: gate.id,
        elementType: "gate",
        field: `${fieldPrefix}.compareTo`,
        message: `compareTo must be "threshold", "value", or "indicator"`,
        severity: "error",
      });
    } else if (cond.compareTo === "threshold" || cond.compareTo === "value") {
      if (cond.threshold === undefined || cond.threshold === null || cond.threshold === "") {
        errors.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.threshold`,
          message: "Threshold value is required",
          severity: "error",
        });
      } else if (!isVariableToken(cond.threshold)) {
        // Only validate as number if it's not a variable token
        const thresholdNum = parseFloat(cond.threshold);
        if (isNaN(thresholdNum)) {
          errors.push({
            elementId: gate.id,
            elementType: "gate",
            field: `${fieldPrefix}.threshold`,
            message: `Threshold must be a valid number or variable`,
            severity: "error",
          });
        }
      }
    } else if (cond.compareTo === "indicator") {
      // Validate right side indicator comparison
      if (!cond.rightTicker || cond.rightTicker.trim() === "") {
        errors.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.rightTicker`,
          message: "Right side ticker symbol is required for indicator comparison",
          severity: "error",
        });
      }

      if (!cond.rightIndicator || cond.rightIndicator.trim() === "") {
        errors.push({
          elementId: gate.id,
          elementType: "gate",
          field: `${fieldPrefix}.rightIndicator`,
          message: "Right side indicator is required",
          severity: "error",
        });
      }

      const indicatorsRequiringPeriod = ["RSI", "SMA", "EMA", "ATR", "ADX", "MFI", "STOCH_K", "AROONOSC"];
      if (indicatorsRequiringPeriod.includes(cond.rightIndicator?.toUpperCase() || "")) {
        if (!cond.rightPeriod || cond.rightPeriod.trim() === "") {
          errors.push({
            elementId: gate.id,
            elementType: "gate",
            field: `${fieldPrefix}.rightPeriod`,
            message: `Right side indicator "${cond.rightIndicator}" requires a period`,
            severity: "error",
          });
        } else if (!isVariableToken(cond.rightPeriod)) {
          // Only validate as number if it's not a variable token
          const periodNum = parseInt(cond.rightPeriod, 10);
          if (isNaN(periodNum) || periodNum < 1) {
            errors.push({
              elementId: gate.id,
              elementType: "gate",
              field: `${fieldPrefix}.rightPeriod`,
              message: `Right side period must be a positive integer or variable (currently "${cond.rightPeriod}")`,
              severity: "error",
            });
          }
        }
      }
    }
  });

  // Validate branches
  const hasThenChildren = gate.thenChildren && gate.thenChildren.length > 0;
  const hasElseChildren = gate.elseChildren && gate.elseChildren.length > 0;

  if (hasThenChildren && gate.thenChildren.length > 1) {
    const thenWeightSum = gate.thenChildren.reduce((sum: number, child: Element) => sum + (child.weight || 0), 0);
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

  if (hasElseChildren && gate.elseChildren.length > 1) {
    const elseWeightSum = gate.elseChildren.reduce((sum: number, child: Element) => sum + (child.weight || 0), 0);
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

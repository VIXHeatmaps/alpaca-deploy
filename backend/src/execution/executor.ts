import type {
  Element,
  TickerElement,
  WeightElement,
  GateElement,
  GateCondition,
  Position,
  IndicatorValue,
  ExecutionContext,
  ExecutionResult,
  GateEvaluation,
} from "./types";
import { buildIndicatorKey } from "../utils/indicatorKeys";

/**
 * Evaluates a gate condition against indicator data
 */
function evaluateCondition(
  condition: GateCondition,
  indicatorData: Map<string, IndicatorValue>
): boolean {
  // Build key for left side of comparison
  // Use params as source of truth, fallback to period for backward compatibility
  const leftKey = condition.params
    ? buildIndicatorKey(condition.ticker, condition.indicator, condition.params)
    : `${condition.ticker}:${condition.indicator}:${condition.period || ''}`;

  const leftValue = indicatorData.get(leftKey);

  if (!leftValue) {
    throw new Error(
      `Missing indicator data for key "${leftKey}" (ticker=${condition.ticker}, indicator=${condition.indicator})`
    );
  }

  let rightValue: number;

  if (condition.compareTo === "threshold" || condition.compareTo === "value") {
    // Compare against a static threshold value
    rightValue = parseFloat(condition.threshold);
    if (isNaN(rightValue)) {
      throw new Error(`Invalid threshold value: ${condition.threshold}`);
    }
  } else {
    // Compare against another indicator
    if (!condition.rightTicker || !condition.rightIndicator) {
      throw new Error("Missing right-hand indicator specification");
    }

    // Use rightParams as source of truth, fallback to rightPeriod for backward compatibility
    const rightKey = condition.rightParams
      ? buildIndicatorKey(condition.rightTicker, condition.rightIndicator, condition.rightParams)
      : `${condition.rightTicker}:${condition.rightIndicator}:${condition.rightPeriod || ''}`;

    const rightIndicator = indicatorData.get(rightKey);
    if (!rightIndicator) {
      throw new Error(
        `Missing indicator data for key "${rightKey}" (ticker=${condition.rightTicker}, indicator=${condition.rightIndicator})`
      );
    }
    rightValue = rightIndicator.value;
  }

  // Evaluate the comparison operator
  switch (condition.operator) {
    case "gt":
      return leftValue.value > rightValue;
    case "lt":
      return leftValue.value < rightValue;
    case "gte":
      return leftValue.value >= rightValue;
    case "lte":
      return leftValue.value <= rightValue;
    case "eq":
      return leftValue.value === rightValue;
    case "neq":
      return leftValue.value !== rightValue;
    default:
      throw new Error(`Unknown operator: ${condition.operator}`);
  }
}

/**
 * Result of executing an element, including any unallocated weight
 */
interface ElementExecutionResult {
  positions: Position[];
  unallocatedWeight: number; // Weight that couldn't be allocated (from empty branches)
  gateEvaluations: GateEvaluation[]; // Track gate evaluations
}

/**
 * Recursively executes a strategy element tree
 */
function executeElement(
  element: Element,
  context: ExecutionContext,
  executionPath: string[],
  errors: string[],
  gateEvaluations: GateEvaluation[]
): ElementExecutionResult {
  const positions: Position[] = [];
  let unallocatedWeight = 0;

  try {
    if (element.type === "ticker") {
      // Leaf node - create a position using the allocated weight from parent
      const ticker = element as TickerElement;
      positions.push({
        ticker: ticker.ticker,
        weight: context.baseWeight,
      });
      executionPath.push(`Ticker: ${ticker.ticker} (allocated: ${context.baseWeight.toFixed(2)}%)`);
    } else if (element.type === "weight") {
      // Weight node - distribute weight among children
      const weight = element as WeightElement;
      executionPath.push(`Weight: ${weight.name} (${weight.weight}%, mode: ${weight.weightMode})`);

      // Track unallocated weight from children
      let totalUnallocated = 0;

      for (const child of weight.children) {
        let childWeightPct: number;

        if (weight.weightMode === "equal") {
          // Equal distribution - divide parent weight equally
          childWeightPct = 100 / weight.children.length;
        } else {
          // Defined distribution - use child's defined weight percentage
          childWeightPct = child.weight;
        }

        const childContext: ExecutionContext = {
          baseWeight: context.baseWeight * (childWeightPct / 100),
          indicatorData: context.indicatorData,
        };

        const childResult = executeElement(child, childContext, executionPath, errors, gateEvaluations);
        positions.push(...childResult.positions);
        gateEvaluations.push(...childResult.gateEvaluations);
        totalUnallocated += childResult.unallocatedWeight;
      }

      // Redistribute unallocated weight proportionally to children that DID allocate
      if (totalUnallocated > 0 && positions.length > 0) {
        // Calculate total allocated weight
        const totalAllocated = positions.reduce((sum, pos) => sum + pos.weight, 0);

        if (totalAllocated > 0) {
          // Redistribute proportionally
          const redistributionFactor = (totalAllocated + totalUnallocated) / totalAllocated;
          for (const pos of positions) {
            pos.weight *= redistributionFactor;
          }
          executionPath.push(
            `Redistributed ${totalUnallocated.toFixed(2)}% from empty branches to siblings`
          );
        } else {
          // No positions to redistribute to - pass weight up
          unallocatedWeight = totalUnallocated;
        }
      } else if (totalUnallocated > 0) {
        // No positions at all - pass all weight up
        unallocatedWeight = totalUnallocated;
      }
    } else if (element.type === "gate") {
      // Gate node - evaluate conditions and execute appropriate branch
      const gate = element as GateElement;
      const conditionMode = gate.conditionMode || "if";
      const conditions = gate.conditions || [];

      console.log(`\n🚪 GATE: "${gate.name}"`);
      console.log(`   conditionMode: ${conditionMode}`);
      console.log(`   conditions array length: ${conditions.length}`);
      console.log(`   conditions:`, conditions);

      if (conditions.length === 0) {
        throw new Error(`Gate "${gate.name}" has no conditions!`);
      }

      // Evaluate all conditions
      const conditionResults = conditions.map(cond =>
        evaluateCondition(cond, context.indicatorData)
      );

      console.log(`   Condition Results:`, conditionResults);

      // Determine if gate condition is met based on mode
      let conditionMet: boolean;
      if (conditionMode === "if") {
        // IF mode: single condition (or first condition if multiple)
        conditionMet = conditionResults[0] || false;
      } else if (conditionMode === "if_all") {
        // IF ALL mode: all conditions must be true
        conditionMet = conditionResults.every(result => result === true);
      } else if (conditionMode === "if_any") {
        // IF ANY mode: at least one condition must be true
        conditionMet = conditionResults.some(result => result === true);
      } else if (conditionMode === "if_none") {
        // IF NONE mode: all conditions must be false
        conditionMet = conditionResults.every(result => result === false);
      } else {
        throw new Error(`Unknown condition mode: ${conditionMode}`);
      }

      console.log(`🔍 Gate "${gate.name}" - Final Result: ${conditionMet ? "TRUE (→THEN)" : "FALSE (→ELSE)"}"`);

      // Record gate evaluation
      gateEvaluations.push({
        gateId: gate.id,
        gateName: gate.name,
        conditionMet,
      });

      executionPath.push(
        `Gate: ${gate.name} (${gate.weight}%, mode: ${conditionMode.toUpperCase()}, result: ${conditionMet ? "TRUE" : "FALSE"})`
      );

      const branch = conditionMet ? gate.thenChildren : gate.elseChildren;

      // If branch is empty, return the weight as unallocated
      if (branch.length === 0) {
        unallocatedWeight = context.baseWeight;
        executionPath.push(
          `Empty ${conditionMet ? "THEN" : "ELSE"} branch - returning ${context.baseWeight.toFixed(2)}% unallocated`
        );
      } else {
        // Track unallocated weight from children
        let totalUnallocated = 0;

        for (const child of branch) {
          let childWeightPct: number;

          if (branch.length === 1) {
            // Single child gets 100% of parent's allocation
            childWeightPct = 100;
          } else {
            // Multiple children - distribute using child's weight percentage
            childWeightPct = child.weight;
          }

          const childContext: ExecutionContext = {
            baseWeight: context.baseWeight * (childWeightPct / 100),
            indicatorData: context.indicatorData,
          };

          const childResult = executeElement(child, childContext, executionPath, errors, gateEvaluations);
          positions.push(...childResult.positions);
          gateEvaluations.push(...childResult.gateEvaluations);
          totalUnallocated += childResult.unallocatedWeight;
        }

        // Redistribute unallocated weight proportionally to children that DID allocate
        if (totalUnallocated > 0 && positions.length > 0) {
          // Calculate total allocated weight
          const totalAllocated = positions.reduce((sum, pos) => sum + pos.weight, 0);

          if (totalAllocated > 0) {
            // Redistribute proportionally
            const redistributionFactor = (totalAllocated + totalUnallocated) / totalAllocated;
            for (const pos of positions) {
              pos.weight *= redistributionFactor;
            }
            executionPath.push(
              `Redistributed ${totalUnallocated.toFixed(2)}% from empty branches to siblings`
            );
          } else {
            // No positions to redistribute to - pass weight up
            unallocatedWeight = totalUnallocated;
          }
        } else if (totalUnallocated > 0) {
          // No positions at all - pass all weight up
          unallocatedWeight = totalUnallocated;
        }
      }
    }
  } catch (error) {
    const errorMsg = `Error executing ${element.type} element: ${(error as Error).message}`;
    errors.push(errorMsg);
    executionPath.push(`ERROR: ${errorMsg}`);
    // On error, return weight as unallocated
    unallocatedWeight = context.baseWeight;
  }

  return { positions, unallocatedWeight, gateEvaluations };
}

/**
 * Aggregates positions with the same ticker
 */
function aggregatePositions(positions: Position[]): Position[] {
  const aggregated = new Map<string, number>();

  for (const position of positions) {
    const current = aggregated.get(position.ticker) || 0;
    aggregated.set(position.ticker, current + position.weight);
  }

  return Array.from(aggregated.entries()).map(([ticker, weight]) => ({
    ticker,
    weight,
  }));
}

/**
 * Normalizes position weights to sum to 100%
 */
function normalizePositions(positions: Position[]): Position[] {
  const total = positions.reduce((sum, pos) => sum + pos.weight, 0);

  if (total === 0) {
    return positions;
  }

  return positions.map((pos) => ({
    ticker: pos.ticker,
    weight: (pos.weight / total) * 100,
  }));
}

/**
 * Main execution function - executes a strategy and returns positions
 */
export function executeStrategy(
  elements: Element[],
  indicatorData: Map<string, IndicatorValue>
): ExecutionResult {
  const executionPath: string[] = [];
  const errors: string[] = [];
  const allPositions: Position[] = [];
  const allGateEvaluations: GateEvaluation[] = [];
  let totalUnallocated = 0;

  // Execute each top-level element
  for (const element of elements) {
    const context: ExecutionContext = {
      baseWeight: element.weight || 100 / elements.length, // Use element's weight or distribute equally
      indicatorData,
    };

    const result = executeElement(element, context, executionPath, errors, allGateEvaluations);
    allPositions.push(...result.positions);
    allGateEvaluations.push(...result.gateEvaluations);
    totalUnallocated += result.unallocatedWeight;
  }

  // Redistribute any top-level unallocated weight proportionally to all positions
  if (totalUnallocated > 0 && allPositions.length > 0) {
    const totalAllocated = allPositions.reduce((sum, pos) => sum + pos.weight, 0);

    if (totalAllocated > 0) {
      const redistributionFactor = (totalAllocated + totalUnallocated) / totalAllocated;
      for (const pos of allPositions) {
        pos.weight *= redistributionFactor;
      }
      executionPath.push(
        `Top-level redistribution: ${totalUnallocated.toFixed(2)}% redistributed to active positions`
      );
    }
  }

  // Aggregate positions with the same ticker
  const aggregatedPositions = aggregatePositions(allPositions);

  // Normalize to ensure weights sum to 100%
  const normalizedPositions = normalizePositions(aggregatedPositions);

  return {
    positions: normalizedPositions,
    executionPath,
    errors,
    gateEvaluations: allGateEvaluations,
  };
}

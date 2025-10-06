/**
 * Demo of the execution engine - shows how strategies are executed
 */

// Simulated execution logic (matches the TypeScript implementation)
function executeStrategy(elements, indicatorData) {
  const executionPath = [];
  const errors = [];
  const allPositions = [];

  for (const element of elements) {
    const context = {
      baseWeight: 100 / elements.length,
      indicatorData,
    };
    const positions = executeElement(element, context, executionPath, errors);
    allPositions.push(...positions);
  }

  const aggregatedPositions = aggregatePositions(allPositions);
  const normalizedPositions = normalizePositions(aggregatedPositions);

  return {
    positions: normalizedPositions,
    executionPath,
    errors,
  };
}

function executeElement(element, context, executionPath, errors) {
  const positions = [];

  try {
    if (element.type === "ticker") {
      positions.push({
        ticker: element.ticker,
        weight: context.baseWeight,
      });
      executionPath.push(`Ticker: ${element.ticker} (allocated: ${context.baseWeight.toFixed(2)}%)`);
    } else if (element.type === "weight") {
      executionPath.push(`Weight: ${element.name} (${element.weight}%, mode: ${element.weightMode})`);

      for (const child of element.children) {
        let childWeightPct;
        if (element.weightMode === "equal") {
          childWeightPct = 100 / element.children.length;
        } else {
          childWeightPct = child.weight;
        }

        const childContext = {
          baseWeight: context.baseWeight * (childWeightPct / 100),
          indicatorData: context.indicatorData,
        };

        const childPositions = executeElement(child, childContext, executionPath, errors);
        positions.push(...childPositions);
      }
    } else if (element.type === "gate") {
      const conditionMet = evaluateCondition(element.condition, context.indicatorData);
      executionPath.push(`Gate: ${element.name} (${element.weight}%, condition: ${conditionMet ? "TRUE" : "FALSE"})`);

      const branch = conditionMet ? element.thenChildren : element.elseChildren;

      for (const child of branch) {
        const childWeightPct = branch.length === 1 ? 100 : child.weight;
        const childContext = {
          baseWeight: context.baseWeight * (childWeightPct / 100),
          indicatorData: context.indicatorData,
        };

        const childPositions = executeElement(child, childContext, executionPath, errors);
        positions.push(...childPositions);
      }
    }
  } catch (error) {
    const errorMsg = `Error executing ${element.type} element: ${error.message}`;
    errors.push(errorMsg);
    executionPath.push(`ERROR: ${errorMsg}`);
  }

  return positions;
}

function evaluateCondition(condition, indicatorData) {
  const leftKey = `${condition.ticker}:${condition.indicator}:${condition.period}`;
  const leftValue = indicatorData.get(leftKey);

  if (!leftValue) {
    throw new Error(`Missing indicator data for ${leftKey}`);
  }

  let rightValue;
  if (condition.compareTo === "value") {
    rightValue = parseFloat(condition.threshold);
  } else {
    const rightKey = `${condition.rightTicker}:${condition.rightIndicator}:${condition.rightPeriod}`;
    const rightIndicator = indicatorData.get(rightKey);
    if (!rightIndicator) {
      throw new Error(`Missing indicator data for ${rightKey}`);
    }
    rightValue = rightIndicator.value;
  }

  switch (condition.operator) {
    case "gt": return leftValue.value > rightValue;
    case "lt": return leftValue.value < rightValue;
    case "gte": return leftValue.value >= rightValue;
    case "lte": return leftValue.value <= rightValue;
    case "eq": return leftValue.value === rightValue;
    case "neq": return leftValue.value !== rightValue;
    default: throw new Error(`Unknown operator: ${condition.operator}`);
  }
}

function aggregatePositions(positions) {
  const aggregated = new Map();
  for (const position of positions) {
    const current = aggregated.get(position.ticker) || 0;
    aggregated.set(position.ticker, current + position.weight);
  }
  return Array.from(aggregated.entries()).map(([ticker, weight]) => ({ ticker, weight }));
}

function normalizePositions(positions) {
  const total = positions.reduce((sum, pos) => sum + pos.weight, 0);
  if (total === 0) return positions;
  return positions.map((pos) => ({ ticker: pos.ticker, weight: (pos.weight / total) * 100 }));
}

// Test 1: Simple Weight Strategy
console.log("\n=== Test 1: Simple Weight Strategy ===");
const strategy1 = [
  {
    id: "weight1",
    type: "weight",
    name: "Tech Portfolio",
    weight: 100,
    weightMode: "defined",
    children: [
      { id: "ticker1", type: "ticker", ticker: "AAPL", weight: 50 },
      { id: "ticker2", type: "ticker", ticker: "MSFT", weight: 30 },
      { id: "ticker3", type: "ticker", ticker: "GOOGL", weight: 20 },
    ],
  },
];

const result1 = executeStrategy(strategy1, new Map());
console.log("Positions:", result1.positions);
console.log("Execution Path:", result1.executionPath);

// Test 2: Gate Strategy
console.log("\n=== Test 2: Gate Strategy (RSI Check) ===");
const strategy2 = [
  {
    id: "gate1",
    type: "gate",
    name: "SPY Momentum Check",
    weight: 100,
    condition: {
      ticker: "SPY",
      indicator: "RSI",
      period: "14d",
      operator: "gt",
      compareTo: "value",
      threshold: "50",
    },
    thenChildren: [{ id: "ticker1", type: "ticker", ticker: "QQQ", weight: 100 }],
    elseChildren: [{ id: "ticker2", type: "ticker", ticker: "TLT", weight: 100 }],
  },
];

const indicatorHigh = new Map([["SPY:RSI:14d", { ticker: "SPY", indicator: "RSI", period: "14d", value: 65 }]]);
const resultHigh = executeStrategy(strategy2, indicatorHigh);
console.log("\n--- RSI = 65 (Condition TRUE) ---");
console.log("Positions:", resultHigh.positions);
console.log("Execution Path:", resultHigh.executionPath);

const indicatorLow = new Map([["SPY:RSI:14d", { ticker: "SPY", indicator: "RSI", period: "14d", value: 35 }]]);
const resultLow = executeStrategy(strategy2, indicatorLow);
console.log("\n--- RSI = 35 (Condition FALSE) ---");
console.log("Positions:", resultLow.positions);
console.log("Execution Path:", resultLow.executionPath);

// Test 3: Complex Nested Strategy
console.log("\n=== Test 3: Complex Nested Strategy (Market Regime) ===");
const strategy3 = [
  {
    id: "gate1",
    type: "gate",
    name: "Market Regime",
    weight: 100,
    condition: {
      ticker: "SPY",
      indicator: "PRICE",
      period: "1d",
      operator: "gt",
      compareTo: "indicator",
      threshold: "",
      rightTicker: "SPY",
      rightIndicator: "SMA",
      rightPeriod: "200d",
    },
    thenChildren: [
      {
        id: "weight1",
        type: "weight",
        name: "Bullish Portfolio",
        weight: 100,
        weightMode: "defined",
        children: [
          { id: "ticker1", type: "ticker", ticker: "QQQ", weight: 60 },
          { id: "ticker2", type: "ticker", ticker: "IWM", weight: 40 },
        ],
      },
    ],
    elseChildren: [
      {
        id: "weight2",
        type: "weight",
        name: "Defensive Portfolio",
        weight: 100,
        weightMode: "equal",
        children: [
          { id: "ticker3", type: "ticker", ticker: "TLT", weight: 0 },
          { id: "ticker4", type: "ticker", ticker: "GLD", weight: 0 },
          { id: "ticker5", type: "ticker", ticker: "BIL", weight: 0 },
        ],
      },
    ],
  },
];

const bullishData = new Map([
  ["SPY:PRICE:1d", { ticker: "SPY", indicator: "PRICE", period: "1d", value: 450 }],
  ["SPY:SMA:200d", { ticker: "SPY", indicator: "SMA", period: "200d", value: 430 }],
]);
const bullishResult = executeStrategy(strategy3, bullishData);
console.log("\n--- Bullish (Price 450 > SMA200 430) ---");
console.log("Positions:", bullishResult.positions);
console.log("Execution Path:", bullishResult.executionPath);

const bearishData = new Map([
  ["SPY:PRICE:1d", { ticker: "SPY", indicator: "PRICE", period: "1d", value: 420 }],
  ["SPY:SMA:200d", { ticker: "SPY", indicator: "SMA", period: "200d", value: 440 }],
]);
const bearishResult = executeStrategy(strategy3, bearishData);
console.log("\n--- Bearish (Price 420 < SMA200 440) ---");
console.log("Positions:", bearishResult.positions);
console.log("Execution Path:", bearishResult.executionPath);

console.log("\n=== Execution Engine Demo Complete ===\n");

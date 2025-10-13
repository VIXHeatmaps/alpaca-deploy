import { executeStrategy } from "./executor";
import { buildIndicatorMap } from "./indicators";
import type { Element, IndicatorValue } from "./types";

/**
 * Test Case 1: Simple strategy with weight and tickers
 */
function testSimpleStrategy() {
  console.log("\n=== Test 1: Simple Weight Strategy ===");

  const strategy: Element[] = [
    {
      id: "weight1",
      type: "weight",
      name: "Tech Portfolio",
      weight: 100,
      weightMode: "defined",
      children: [
        {
          id: "ticker1",
          type: "ticker",
          ticker: "AAPL",
          weight: 50,
        },
        {
          id: "ticker2",
          type: "ticker",
          ticker: "MSFT",
          weight: 30,
        },
        {
          id: "ticker3",
          type: "ticker",
          ticker: "GOOGL",
          weight: 20,
        },
      ],
    },
  ];

  const indicatorData = buildIndicatorMap([]);

  const result = executeStrategy(strategy, indicatorData);

  console.log("Positions:", result.positions);
  console.log("Execution Path:", result.executionPath);
  console.log("Errors:", result.errors);
}

/**
 * Test Case 2: Strategy with gate condition
 */
function testGateStrategy() {
  console.log("\n=== Test 2: Gate Strategy ===");

  const strategy: Element[] = [
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
      thenChildren: [
        {
          id: "ticker1",
          type: "ticker",
          ticker: "QQQ",
          weight: 100,
        },
      ],
      elseChildren: [
        {
          id: "ticker2",
          type: "ticker",
          ticker: "TLT",
          weight: 100,
        },
      ],
    },
  ];

  // Test with RSI > 50 (should choose QQQ)
  const indicatorDataHigh = buildIndicatorMap([
    {
      ticker: "SPY",
      indicator: "RSI",
      period: "14d",
      value: 65,
    },
  ]);

  console.log("\n--- RSI = 65 (Condition TRUE) ---");
  const resultHigh = executeStrategy(strategy, indicatorDataHigh);
  console.log("Positions:", resultHigh.positions);
  console.log("Execution Path:", resultHigh.executionPath);

  // Test with RSI < 50 (should choose TLT)
  const indicatorDataLow = buildIndicatorMap([
    {
      ticker: "SPY",
      indicator: "RSI",
      period: "14d",
      value: 35,
    },
  ]);

  console.log("\n--- RSI = 35 (Condition FALSE) ---");
  const resultLow = executeStrategy(strategy, indicatorDataLow);
  console.log("Positions:", resultLow.positions);
  console.log("Execution Path:", resultLow.executionPath);
}

/**
 * Test Case 3: Complex nested strategy
 */
function testComplexStrategy() {
  console.log("\n=== Test 3: Complex Nested Strategy ===");

  const strategy: Element[] = [
    {
      id: "gate1",
      type: "gate",
      name: "Market Regime",
      weight: 100,
      condition: {
        ticker: "SPY",
        indicator: "SMA",
        period: "200d",
        operator: "gt",
        compareTo: "indicator",
        threshold: "",
        rightTicker: "SPY",
        rightIndicator: "PRICE",
        rightPeriod: "1d",
      },
      thenChildren: [
        {
          id: "weight1",
          type: "weight",
          name: "Bullish Portfolio",
          weight: 100,
          weightMode: "defined",
          children: [
            {
              id: "ticker1",
              type: "ticker",
              ticker: "QQQ",
              weight: 60,
            },
            {
              id: "ticker2",
              type: "ticker",
              ticker: "IWM",
              weight: 40,
            },
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
            {
              id: "ticker3",
              type: "ticker",
              ticker: "TLT",
              weight: 0, // Will be ignored in equal mode
            },
            {
              id: "ticker4",
              type: "ticker",
              ticker: "GLD",
              weight: 0,
            },
            {
              id: "ticker5",
              type: "ticker",
              ticker: "BIL",
              weight: 0,
            },
          ],
        },
      ],
    },
  ];

  // Test bullish scenario (Price > SMA200)
  const bullishData = buildIndicatorMap([
    {
      ticker: "SPY",
      indicator: "PRICE",
      period: "1d",
      value: 450,
    },
    {
      ticker: "SPY",
      indicator: "SMA",
      period: "200d",
      value: 430,
    },
  ]);

  console.log("\n--- Bullish (Price > SMA200) ---");
  const bullishResult = executeStrategy(strategy, bullishData);
  console.log("Positions:", bullishResult.positions);
  console.log("Execution Path:", bullishResult.executionPath);

  // Test bearish scenario (Price < SMA200)
  const bearishData = buildIndicatorMap([
    {
      ticker: "SPY",
      indicator: "PRICE",
      period: "1d",
      value: 420,
    },
    {
      ticker: "SPY",
      indicator: "SMA",
      period: "200d",
      value: 440,
    },
  ]);

  console.log("\n--- Bearish (Price < SMA200) ---");
  const bearishResult = executeStrategy(strategy, bearishData);
  console.log("Positions:", bearishResult.positions);
  console.log("Execution Path:", bearishResult.executionPath);
}

/**
 * Test Case 4: Redistribution with empty branch
 * 50% SPY + 50% Gate with empty ELSE
 */
function testRedistribution() {
  console.log("\n=== Test 4: Weight Redistribution (Empty Branch) ===");

  const strategy: Element[] = [
    {
      id: "ticker1",
      type: "ticker",
      ticker: "SPY",
      weight: 50,
    },
    {
      id: "gate1",
      type: "gate",
      name: "BND RSI > 50",
      weight: 50,
      condition: {
        ticker: "BND",
        indicator: "RSI",
        period: "14",
        operator: "gt",
        compareTo: "threshold",
        threshold: "50",
      },
      thenChildren: [
        {
          id: "ticker2",
          type: "ticker",
          ticker: "BND",
          weight: 100,
        },
      ],
      elseChildren: [], // EMPTY - should redistribute to SPY
    },
  ];

  // Test with RSI > 50 (THEN branch - should get SPY 50%, BND 50%)
  const indicatorDataHigh = buildIndicatorMap([
    {
      ticker: "BND",
      indicator: "RSI",
      period: "14",
      value: 65,
    },
  ]);

  console.log("\n--- RSI = 65 (THEN branch: BND) ---");
  const resultHigh = executeStrategy(strategy, indicatorDataHigh);
  console.log("Positions:", resultHigh.positions);
  console.log("Expected: SPY 50%, BND 50%");
  console.log("Execution Path:", resultHigh.executionPath);

  // Test with RSI < 50 (ELSE branch empty - should get SPY 100%)
  const indicatorDataLow = buildIndicatorMap([
    {
      ticker: "BND",
      indicator: "RSI",
      period: "14",
      value: 35,
    },
  ]);

  console.log("\n--- RSI = 35 (ELSE branch: EMPTY) ---");
  const resultLow = executeStrategy(strategy, indicatorDataLow);
  console.log("Positions:", resultLow.positions);
  console.log("Expected: SPY 100% (redistributed from empty gate)");
  console.log("Execution Path:", resultLow.executionPath);

  // Verify weights sum to 100%
  const totalWeight = resultLow.positions.reduce((sum, pos) => sum + pos.weight, 0);
  console.log(`Total weight: ${totalWeight.toFixed(2)}%`);
}

/**
 * Test Case 5: Nested redistribution
 */
function testNestedRedistribution() {
  console.log("\n=== Test 5: Nested Redistribution ===");

  const strategy: Element[] = [
    {
      id: "weight1",
      type: "weight",
      name: "Portfolio",
      weight: 100,
      weightMode: "defined",
      children: [
        {
          id: "ticker1",
          type: "ticker",
          ticker: "SPY",
          weight: 50,
        },
        {
          id: "gate1",
          type: "gate",
          name: "Gate 1",
          weight: 25,
          condition: {
            ticker: "QQQ",
            indicator: "RSI",
            period: "14",
            operator: "gt",
            compareTo: "threshold",
            threshold: "50",
          },
          thenChildren: [
            {
              id: "ticker2",
              type: "ticker",
              ticker: "QQQ",
              weight: 100,
            },
          ],
          elseChildren: [], // Empty
        },
        {
          id: "gate2",
          type: "gate",
          name: "Gate 2",
          weight: 25,
          condition: {
            ticker: "TLT",
            indicator: "RSI",
            period: "14",
            operator: "gt",
            compareTo: "threshold",
            threshold: "50",
          },
          thenChildren: [],  // Empty
          elseChildren: [
            {
              id: "ticker3",
              type: "ticker",
              ticker: "TLT",
              weight: 100,
            },
          ],
        },
      ],
    },
  ];

  // Both gates hit empty branches - all weight should go to SPY
  const indicatorData = buildIndicatorMap([
    {
      ticker: "QQQ",
      indicator: "RSI",
      period: "14",
      value: 30, // ELSE (empty)
    },
    {
      ticker: "TLT",
      indicator: "RSI",
      period: "14",
      value: 70, // THEN (empty)
    },
  ]);

  console.log("\n--- Both gates hit empty branches ---");
  const result = executeStrategy(strategy, indicatorData);
  console.log("Positions:", result.positions);
  console.log("Expected: SPY 100% (50% original + 25% + 25% redistributed)");
  console.log("Execution Path:", result.executionPath);

  const totalWeight = result.positions.reduce((sum, pos) => sum + pos.weight, 0);
  console.log(`Total weight: ${totalWeight.toFixed(2)}%`);
}

/**
 * Test Case 6: Linear SCALE blending between two tickers
 */
function testScaleStrategy() {
  console.log("\n=== Test 6: SCALE Linear Blend ===");

  const scaleElement: Element = {
    id: "scale1",
    type: "scale",
    name: "RSI Scale",
    weight: 100,
    config: {
      ticker: "XLK",
      indicator: "RSI",
      params: { period: "14" },
      period: "14",
      rangeMin: "30",
      rangeMax: "70",
    },
    fromChildren: [
      {
        id: "ticker-from",
        type: "ticker",
        ticker: "SPY",
        weight: 100,
      },
    ],
    toChildren: [
      {
        id: "ticker-to",
        type: "ticker",
        ticker: "UVXY",
        weight: 100,
      },
    ],
  };

  const strategy: Element[] = [scaleElement];

  const belowRangeData = buildIndicatorMap([
    { ticker: "XLK", indicator: "RSI", period: "14", value: 20 },
  ]);
  const midRangeData = buildIndicatorMap([
    { ticker: "XLK", indicator: "RSI", period: "14", value: 50 },
  ]);
  const aboveRangeData = buildIndicatorMap([
    { ticker: "XLK", indicator: "RSI", period: "14", value: 80 },
  ]);

  console.log("\n--- RSI = 20 (below min -> SPY 100%) ---");
  const belowResult = executeStrategy(strategy, belowRangeData);
  console.log("Positions:", belowResult.positions);

  console.log("\n--- RSI = 50 (midpoint -> SPY 50%, UVXY 50%) ---");
  const midResult = executeStrategy(strategy, midRangeData);
  console.log("Positions:", midResult.positions);

  console.log("\n--- RSI = 80 (above max -> UVXY 100%) ---");
  const aboveResult = executeStrategy(strategy, aboveRangeData);
  console.log("Positions:", aboveResult.positions);
}

/**
 * Test Case 7: Nested SCALE blending (Scale of Scale)
 */
function testNestedScaleStrategy() {
  console.log("\n=== Test 7: Nested SCALE Blending ===");

  const innerScale: Element = {
    id: "scale-inner",
    type: "scale",
    name: "Inner Scale",
    weight: 100,
    config: {
      ticker: "Z",
      indicator: "RSI",
      params: { period: "10" },
      period: "10",
      rangeMin: "0",
      rangeMax: "100",
    },
    fromChildren: [
      {
        id: "ticker-x",
        type: "ticker",
        ticker: "X",
        weight: 100,
      },
    ],
    toChildren: [
      {
        id: "ticker-y",
        type: "ticker",
        ticker: "Y",
        weight: 100,
      },
    ],
  };

  const outerScale: Element = {
    id: "scale-outer",
    type: "scale",
    name: "Outer Scale",
    weight: 100,
    config: {
      ticker: "C",
      indicator: "RSI",
      params: { period: "14" },
      period: "14",
      rangeMin: "1",
      rangeMax: "10",
    },
    fromChildren: [
      {
        id: "ticker-a",
        type: "ticker",
        ticker: "A",
        weight: 100,
      },
    ],
    toChildren: [innerScale],
  };

  const strategy: Element[] = [outerScale];

  const indicatorData = buildIndicatorMap([
    { ticker: "C", indicator: "RSI", period: "14", value: 5 },
    { ticker: "Z", indicator: "RSI", period: "10", value: 33 },
  ]);

  const result = executeStrategy(strategy, indicatorData);
  console.log("Positions:", result.positions);
  console.log("Expected approx: A 50%, X ≈ 33.5%, Y ≈ 16.5%");
}

// Run all tests
testSimpleStrategy();
testGateStrategy();
testComplexStrategy();
testRedistribution();
testNestedRedistribution();
testScaleStrategy();
testNestedScaleStrategy();

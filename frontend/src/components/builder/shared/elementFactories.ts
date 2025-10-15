import type { IndicatorName } from "../../../types/indicators";
import { defaultParams, paramsToPeriodString } from "../../../types/indicators";
import type { Element, GateElement, ScaleElement, SortElement } from "../../../types/builder";
import { countGatesInTree, countScalesInTree, countSortsInTree } from "../../../utils/builder";

/**
 * Factory functions for creating default element configurations
 */

export const createDefaultGateElement = (allElements: Element[] = []): GateElement => {
  const gateCount = allElements ? countGatesInTree(allElements) : 0;
  const gateName = `Gate${gateCount + 1}`;
  const defaultIndicator: IndicatorName = "RSI";
  const baseParams = { ...defaultParams(defaultIndicator) };

  return {
    id: `gate-${Date.now()}`,
    type: "gate",
    name: gateName,
    weight: 100,
    conditionMode: "if",
    conditions: [
      {
        ticker: "",
        indicator: defaultIndicator,
        period: paramsToPeriodString(defaultIndicator, baseParams),
        params: baseParams,
        operator: "gt",
        compareTo: "indicator",
        threshold: "",
        rightTicker: "",
        rightIndicator: defaultIndicator,
        rightPeriod: paramsToPeriodString(defaultIndicator, baseParams),
        rightParams: baseParams,
      },
    ],
    thenChildren: [],
    elseChildren: [],
  };
};

export const createDefaultScaleElement = (weight: number, allElements: Element[] = []): ScaleElement => {
  const scaleCount = countScalesInTree(allElements);
  const defaultIndicator: IndicatorName = "CUMULATIVE_RETURN";
  const baseParams = { ...defaultParams(defaultIndicator) };
  const period = paramsToPeriodString(defaultIndicator, baseParams);

  return {
    id: `scale-${Date.now()}`,
    type: "scale",
    name: `Scale${scaleCount + 1}`,
    weight,
    config: {
      ticker: "",
      indicator: defaultIndicator,
      params: baseParams,
      period,
      rangeMin: "0",
      rangeMax: "0",
    },
    fromChildren: [],
    toChildren: [],
  };
};

export const createDefaultSortElement = (weight: number, allElements: Element[] = []): SortElement => {
  const sortCount = countSortsInTree(allElements);
  const defaultIndicator: IndicatorName = "CUMULATIVE_RETURN";
  const baseParams = { ...defaultParams(defaultIndicator) };
  const period = paramsToPeriodString(defaultIndicator, baseParams);

  return {
    id: `sort-${Date.now()}`,
    type: "sort",
    name: `Sort${sortCount + 1}`,
    weight,
    direction: "top",
    count: 1,
    indicator: defaultIndicator,
    params: baseParams,
    period,
    children: [],
  };
};

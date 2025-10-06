/**
 * Indicator types, defaults, and parameter management
 */

export type IndicatorName =
  | "CURRENT_PRICE"
  | "RSI"
  | "SMA"
  | "EMA"
  | "MACD"
  | "MACD_LINE"
  | "MACD_SIGNAL"
  | "MACD_HIST"
  | "PPO_LINE"
  | "PPO_SIGNAL"
  | "PPO_HIST"
  | "BBANDS_UPPER"
  | "BBANDS_MIDDLE"
  | "BBANDS_LOWER"
  | "ATR"
  | "OBV"
  | "ADX"
  | "STOCH_K"
  | "MFI"
  | "AROON_UP"
  | "AROON_DOWN"
  | "AROONOSC"
  | "CUMULATIVE_RETURN"
  | "VOLATILITY";

export const indicatorOptions: IndicatorName[] = [
  "CURRENT_PRICE",
  "RSI",
  "SMA",
  "EMA",
  "MACD",
  "MACD_LINE",
  "MACD_SIGNAL",
  "MACD_HIST",
  "PPO_LINE",
  "PPO_SIGNAL",
  "PPO_HIST",
  "BBANDS_UPPER",
  "BBANDS_MIDDLE",
  "BBANDS_LOWER",
  "ATR",
  "OBV",
  "ADX",
  "STOCH_K",
  "MFI",
  "AROON_UP",
  "AROON_DOWN",
  "AROONOSC",
  "CUMULATIVE_RETURN",
  "VOLATILITY",
];

export function defaultParams(t: IndicatorName): Record<string, string> {
  switch (t) {
    case "CURRENT_PRICE":
    case "OBV":
    case "CUMULATIVE_RETURN":
      return {};

    case "RSI":
    case "SMA":
    case "EMA":
      return { period: "14" };

    case "VOLATILITY":
      return { period: "20", annualize: "true" };

    case "MACD":
    case "MACD_LINE":
    case "MACD_SIGNAL":
    case "MACD_HIST":
      return { fastperiod: "12", slowperiod: "26", signalperiod: "9" };

    case "PPO_LINE":
      return { fastperiod: "12", slowperiod: "26", matype: "0" };

    case "PPO_SIGNAL":
    case "PPO_HIST":
      return {
        fastperiod: "12",
        slowperiod: "26",
        matype: "0",
        signalperiod: "9",
      };

    case "BBANDS_UPPER":
    case "BBANDS_MIDDLE":
    case "BBANDS_LOWER":
      return {
        period: "20",
        nbdevup: "2.0",
        nbdevdn: "2.0",
        matype: "0",
      };

    case "ATR":
    case "ADX":
    case "AROON_UP":
    case "AROON_DOWN":
    case "AROONOSC":
    case "MFI":
      return { period: "14" };

    case "STOCH_K":
      return { fastk_period: "14", slowk_period: "3", slowk_matype: "0" };

    default:
      return { period: "14" };
  }
}

// ——— Factory defaults (source of truth) ———
export const FACTORY_DEFAULTS: Record<IndicatorName, Record<string, number>> = {
  CURRENT_PRICE: {},
  OBV: {},
  CUMULATIVE_RETURN: {},
  RSI: { period: 14 },
  SMA: { period: 20 },
  EMA: { period: 20 },
  VOLATILITY: { period: 20, annualize: 1 },
  MACD: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
  MACD_LINE: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
  MACD_SIGNAL: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
  MACD_HIST: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
  PPO_LINE: { fastperiod: 12, slowperiod: 26, matype: 0 },
  PPO_SIGNAL: { fastperiod: 12, slowperiod: 26, matype: 0, signalperiod: 9 },
  PPO_HIST: { fastperiod: 12, slowperiod: 26, matype: 0, signalperiod: 9 },
  BBANDS_UPPER: { period: 20, nbdevup: 2.0, nbdevdn: 2.0, matype: 0 },
  BBANDS_MIDDLE: { period: 20, nbdevup: 2.0, nbdevdn: 2.0, matype: 0 },
  BBANDS_LOWER: { period: 20, nbdevup: 2.0, nbdevdn: 2.0, matype: 0 },
  ATR: { period: 14 },
  ADX: { period: 14 },
  AROON_UP: { period: 14 },
  AROON_DOWN: { period: 14 },
  AROONOSC: { period: 14 },
  MFI: { period: 14 },
  STOCH_K: { fastk_period: 14, slowk_period: 3, slowk_matype: 0 },
};

// ——— Param UI labels (plain-English, no code hints in labels) ———
export const PARAM_LABELS: Record<string, string> = {
  period: "Days",
  timeperiod: "Days",
  fastperiod: "Fast EMA days",
  slowperiod: "Slow EMA days",
  signalperiod: "Signal EMA days",
  matype: "MA Type",
  nbdevup: "Std Dev above MA",
  nbdevdn: "Std Dev below MA",
  fastk_period: "Fast %K days",
  slowk_period: "Slow %K days",
  slowk_matype: "Slow %K MA Type",
  annualize: "Annualize",
};

// ——— Enumerations for select-style params ———
export const MA_TYPES: Array<{ value: number; label: string }> = [
  { value: 0, label: "SMA" },
  { value: 1, label: "EMA" },
  { value: 2, label: "WMA" },
  { value: 3, label: "DEMA" },
  { value: 4, label: "TEMA" },
  { value: 5, label: "TRIMA" },
  { value: 6, label: "KAMA" },
  { value: 7, label: "MAMA" },
  { value: 8, label: "T3" },
];

// Map param-key → enum options
export const PARAM_ENUMS: Record<string, Array<{ value: number; label: string }>> = {
  matype: MA_TYPES,
  slowk_matype: MA_TYPES,
};

// ——— Storage ———
const UD_KEY = "ind_user_defaults_v1"; // user defaults (by indicator type)

// Indicator parameter values can be numbers, strings (for variable tokens), or numbers
export type IndicatorParams = Record<string, string | number>;

export type UserDefaultMap = Partial<Record<IndicatorName, IndicatorParams>>;

export function loadUserDefaults(): UserDefaultMap {
  try {
    return JSON.parse(localStorage.getItem(UD_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveUserDefaults(map: UserDefaultMap) {
  localStorage.setItem(UD_KEY, JSON.stringify(map));
}

// ——— API: get/set defaults ———
export function getFactoryParams(t: IndicatorName): Record<string, number> {
  return { ...(FACTORY_DEFAULTS[t] || {}) };
}

export function getUserDefaultParams(t: IndicatorName): IndicatorParams | null {
  const map = loadUserDefaults();
  return map[t] ? { ...map[t] } : null;
}

export function getEffectiveParams(t: IndicatorName): IndicatorParams {
  return getUserDefaultParams(t) || getFactoryParams(t);
}

export function setUserDefaultParams(t: IndicatorName, params: IndicatorParams) {
  const map = loadUserDefaults();
  map[t] = { ...params };
  saveUserDefaults(map);
}

// Variable token validation and parsing
export const VARIABLE_TOKEN_REGEX = /^\$[A-Za-z0-9_]+$/;

export const isVariableToken = (value: unknown): value is string =>
  typeof value === "string" && VARIABLE_TOKEN_REGEX.test(value.trim());

export const parseInputValue = (raw: string, fallback: string | number): string | number => {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  if (isVariableToken(trimmed)) return trimmed;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : trimmed;
};

// ——— UI helper: ordered keys per indicator ———
export function keysForIndicator(type: IndicatorName): string[] {
  switch (type) {
    case "CURRENT_PRICE":
    case "OBV":
    case "CUMULATIVE_RETURN":
      return [];

    case "RSI":
    case "SMA":
    case "EMA":
      return ["period"];

    case "VOLATILITY":
      return ["period", "annualize"];

    case "ATR":
    case "ADX":
    case "AROON_UP":
    case "AROON_DOWN":
    case "AROONOSC":
    case "MFI":
      return ["period"];

    case "MACD":
    case "MACD_LINE":
    case "MACD_SIGNAL":
    case "MACD_HIST":
      return ["fastperiod", "slowperiod", "signalperiod"];

    case "PPO_LINE":
      return ["fastperiod", "slowperiod", "matype"];

    case "PPO_SIGNAL":
    case "PPO_HIST":
      return ["fastperiod", "slowperiod", "matype", "signalperiod"];

    case "BBANDS_UPPER":
    case "BBANDS_MIDDLE":
    case "BBANDS_LOWER":
      return ["period", "nbdevup", "nbdevdn", "matype"];

    case "STOCH_K":
      return ["fastk_period", "slowk_period", "slowk_matype"];

    default:
      return Object.keys(getEffectiveParams(type));
  }
}

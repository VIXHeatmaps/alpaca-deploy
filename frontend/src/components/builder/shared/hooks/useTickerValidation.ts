import { hasUndefinedVariableInField } from "../../../../utils/builder";
import type { TickerMetadata } from "../../../../api/tickers";

export interface TickerValidationResult {
  /** Whether the value is a variable reference (starts with $) */
  isVariable: boolean;
  /** Whether the value references an undefined variable */
  hasUndefinedVar: boolean;
  /** Whether the ticker is unknown (not in Alpaca asset list) */
  isUnknownTicker: boolean;
  /** Combined visual error state (for border styling) */
  visualError: boolean;
  /** Tooltip text to display */
  tooltip: string | undefined;
  /** Ticker symbol in uppercase */
  symbol: string;
  /** Metadata for the ticker (if found) */
  metadata: TickerMetadata | undefined;
}

export interface UseTickerValidationParams {
  /** The ticker value to validate */
  ticker: string;
  /** Array of defined variable lists */
  variableLists: Array<{ name: string }>;
  /** Whether variables are currently loading */
  variablesLoading: boolean;
  /** Map of ticker metadata from Alpaca */
  tickerMetadata?: Map<string, TickerMetadata>;
  /** Whether ticker metadata is currently loading */
  metadataLoading?: boolean;
  /** Error message from ticker metadata fetch */
  metadataError?: string | null;
  /** Whether this field has a validation error */
  hasFieldError?: boolean;
}

/**
 * Validates ticker input fields with support for:
 * - Variable references ($VARNAME)
 * - Alpaca ticker metadata lookup
 * - Unknown ticker detection
 * - Tooltip generation
 *
 * @param params - Validation parameters
 * @returns Validation result with error states and tooltip
 */
export function useTickerValidation(params: UseTickerValidationParams): TickerValidationResult {
  const {
    ticker,
    variableLists,
    variablesLoading,
    tickerMetadata,
    metadataLoading = false,
    metadataError = null,
    hasFieldError = false,
  } = params;

  // Check if this is a variable reference
  const isVariable = ticker?.trim().startsWith("$");

  // Check for undefined variable
  const hasUndefinedVar = hasUndefinedVariableInField(ticker, variableLists, variablesLoading);

  // Prepare ticker symbol and metadata
  const symbol = ticker?.toUpperCase() ?? "";
  const metadata = symbol && tickerMetadata ? tickerMetadata.get(symbol) : undefined;
  const metadataReady = !!tickerMetadata && !metadataLoading && !metadataError;

  // Check if ticker is unknown (only if not a variable)
  const isUnknownTicker =
    metadataReady &&
    symbol.length > 0 &&
    !isVariable && // Don't check metadata for variables
    !tickerMetadata.has(symbol);

  // Calculate combined visual error state
  const visualError = hasFieldError || hasUndefinedVar || isUnknownTicker;

  // Generate tooltip
  const tooltip = hasUndefinedVar
    ? `Variable ${ticker} is not defined in Variables tab. Double-click to define.`
    : isUnknownTicker
      ? `${symbol} not found in Alpaca asset list`
      : metadata?.name?.trim() || undefined;

  return {
    isVariable,
    hasUndefinedVar,
    isUnknownTicker,
    visualError,
    tooltip,
    symbol,
    metadata,
  };
}

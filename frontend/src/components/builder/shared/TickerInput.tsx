import { useRef, useState } from "react";
import { VariablePopover } from "../VariablePopover";
import * as variablesApi from "../../../api/variables";
import type { VarType } from "../../../api/variables";
import type { TickerMetadata } from "../../../api/tickers";
import type { ValidationError } from "../../../utils/validation";
import { hasFieldError } from "../../../utils/builder";
import { useTickerValidation } from "./hooks/useTickerValidation";
import { fieldWidth } from "./fieldWidth";

export interface TickerInputProps {
  /** Current ticker value */
  value: string;
  /** Callback when ticker value changes */
  onChange: (value: string) => void;
  /** Element ID for validation error matching */
  elementId: string;
  /** Field name for validation error matching */
  field: string;
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
  /** Array of validation errors */
  validationErrors?: ValidationError[];
  /** Callback when a new variable is created */
  onVariableCreated?: () => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Minimum width in pixels (default: 80) */
  minWidth?: number;
  /** Maximum width in pixels */
  maxWidth?: string;
  /** Whether to convert input to uppercase (default: true) */
  uppercase?: boolean;
  /** Stop propagation on click (useful for nested components) */
  stopPropagation?: boolean;
}

/**
 * TickerInput - Reusable ticker input with variable support
 *
 * Features:
 * - Variable validation ($VARNAME)
 * - Alpaca ticker metadata lookup
 * - Unknown ticker detection
 * - Visual error states (red border/background)
 * - Tooltips for errors and ticker info
 * - Double-click to create undefined variables
 * - Variable creation popover
 * - Dynamic width based on content
 *
 * Usage:
 * ```tsx
 * <TickerInput
 *   value={element.ticker}
 *   onChange={(ticker) => onUpdate({ ...element, ticker })}
 *   elementId={element.id}
 *   field="ticker"
 *   variableLists={variableLists}
 *   variablesLoading={variablesLoading}
 *   tickerMetadata={tickerMetadata}
 *   validationErrors={validationErrors}
 *   onVariableCreated={onVariableCreated}
 * />
 * ```
 */
export function TickerInput({
  value,
  onChange,
  elementId,
  field,
  variableLists,
  variablesLoading,
  tickerMetadata,
  metadataLoading = false,
  metadataError = null,
  validationErrors = [],
  onVariableCreated,
  placeholder = "TICKER",
  style = {},
  minWidth = 80,
  maxWidth,
  uppercase = true,
  stopPropagation = false,
}: TickerInputProps) {
  const [showPopover, setShowPopover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate ticker with our hook
  const hasError = hasFieldError(elementId, field, validationErrors);
  const validation = useTickerValidation({
    ticker: value,
    variableLists,
    variablesLoading,
    tickerMetadata,
    metadataLoading,
    metadataError,
    hasFieldError: hasError,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = uppercase ? e.target.value.toUpperCase() : e.target.value;
    onChange(newValue);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    if (validation.hasUndefinedVar) {
      setShowPopover(true);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
  };

  const handleSaveVariable = async (values: string[], type: VarType) => {
    try {
      // Normalize variable name: remove $ prefix and lowercase
      const varName = value.startsWith("$") ? value.slice(1).toLowerCase() : value.toLowerCase();

      await variablesApi.createVariableList({
        name: varName,
        type,
        values,
        is_shared: false,
      });

      // Notify parent to refresh variables and wait for completion
      if (onVariableCreated) {
        await onVariableCreated();
      }
    } catch (err) {
      console.error("Failed to create variable:", err);
      throw err; // Re-throw so popover knows it failed
    }
  };

  // Calculate width
  const width = fieldWidth.ticker(value, minWidth);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{
          border: validation.visualError ? "2px solid #ef4444" : "1px solid #d1d5db",
          outline: "none",
          padding: "4px 8px",
          background: validation.visualError ? "#fee2e2" : "#fff",
          fontSize: "13px",
          color: validation.visualError ? "#b91c1c" : value ? "#111827" : "#9ca3af",
          width,
          maxWidth: maxWidth || undefined,
          flexShrink: 0,
          borderRadius: "4px",
          cursor: validation.hasUndefinedVar ? "pointer" : "text",
          ...style,
        }}
        className="focus:ring-2 focus:ring-blue-500"
        placeholder={placeholder}
        title={validation.tooltip}
      />

      {showPopover && inputRef.current && (
        <VariablePopover
          variableName={value.startsWith("$") ? value.slice(1) : value}
          anchorEl={inputRef.current}
          onSave={handleSaveVariable}
          onClose={() => setShowPopover(false)}
        />
      )}
    </>
  );
}

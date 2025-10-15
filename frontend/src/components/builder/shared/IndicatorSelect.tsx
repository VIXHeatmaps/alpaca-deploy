import type { IndicatorName } from "../../../types/indicators";
import { indicatorOptions } from "../../../types/indicators";
import type { ValidationError } from "../../../utils/validation";
import { hasFieldError } from "../../../utils/builder";
import { fieldWidth } from "./fieldWidth";

export interface IndicatorSelectProps {
  /** Current indicator value */
  value: IndicatorName;
  /** Callback when indicator changes */
  onChange: (indicator: IndicatorName) => void;
  /** Element ID for validation error matching */
  elementId: string;
  /** Field name for validation error matching */
  field: string;
  /** Array of validation errors */
  validationErrors?: ValidationError[];
  /** Stop propagation on click (useful for nested components) */
  stopPropagation?: boolean;
}

/**
 * IndicatorSelect - Reusable indicator dropdown
 *
 * Features:
 * - Dynamic width based on indicator label length
 * - Validation error highlighting
 * - Auto-formats underscores to spaces for display
 * - Consistent styling across all cards
 *
 * Usage:
 * ```tsx
 * <IndicatorSelect
 *   value={element.indicator}
 *   onChange={(indicator) => handleIndicatorChange(indicator)}
 *   elementId={element.id}
 *   field="indicator"
 *   validationErrors={validationErrors}
 * />
 * ```
 */
export function IndicatorSelect({
  value,
  onChange,
  elementId,
  field,
  validationErrors = [],
  stopPropagation = false,
}: IndicatorSelectProps) {
  const hasError = hasFieldError(elementId, field, validationErrors);

  // Format label for display (replace underscores with spaces)
  const label = (value || "").replace(/_/g, " ");
  const width = fieldWidth.indicator(label);

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as IndicatorName)}
      onClick={handleClick}
      style={{
        border: hasError ? "2px solid #ef4444" : "1px solid #d1d5db",
        outline: "none",
        padding: "4px 8px",
        background: hasError ? "#fee2e2" : "#fff",
        fontSize: "13px",
        color: "#111827",
        cursor: "pointer",
        borderRadius: "4px",
        width,
        flexShrink: 0,
      }}
      className="focus:ring-2 focus:ring-blue-500"
    >
      {indicatorOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}

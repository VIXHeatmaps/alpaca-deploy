/**
 * PATTERN: Dynamic Field Sizing
 *
 * For consistent field width behavior across all cards:
 *
 * Text inputs (Name):
 *   width: `${Math.max((value.length || 0) * 8 + 30, minWidth)}px`
 *
 * Ticker inputs:
 *   width: `${Math.max((ticker.length || 0) * 9 + 20, 80)}px`
 *
 * Indicator dropdowns:
 *   const indicatorLabel = (indicator || "").replace(/_/g, " ");
 *   const indicatorSelectWidth = `${Math.max(indicatorLabel.length * 9 + 30, 120)}px`;
 *   width: indicatorSelectWidth
 *
 * This ensures fields resize to fit content without truncation.
 */

import { useState, useRef } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion, AnimatePresence } from "framer-motion";
import { Copy } from "lucide-react";
import { VariablePopover } from "./VariablePopover";
import * as variablesApi from "../../api/variables";
import type { VarType } from "../../api/variables";
import type { IndicatorName } from "../../types/indicators";
import {
  indicatorOptions,
  keysForIndicator,
  PARAM_LABELS,
  getEffectiveParams,
  defaultParams,
  paramsToPeriodString,
  getIndicatorUnit,
} from "../../types/indicators";
import type {
  Element,
  GateCondition,
  GateElement,
  TickerElement,
  WeightElement,
  ScaleElement,
  SortElement,
} from "../../types/builder";
import type { ValidationError } from "../../utils/validation";
import {
  countGatesInTree,
  countScalesInTree,
  countSortsInTree,
  deepCloneElement,
  hasFieldError,
  hasUndefinedVariableInField,
} from "../../utils/builder";
import type { TickerMetadata } from "../../api/tickers";
import { TickerCard } from "./TickerCard";
import { WeightCard } from "./WeightCard";
import { ScaleCard } from "./ScaleCard";
import { SortCard } from "./SortCard";
import { TickerInput } from "./shared/TickerInput";
import {
  createDefaultGateElement,
  createDefaultScaleElement,
  createDefaultSortElement,
} from "./shared/elementFactories";
// ========== ADD ELEMENT DROPDOWN ==========

interface AddElementDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onAddElement: (element: Element) => void;
  allElements?: Element[];
  clipboard?: Element | null;
  backgroundColor?: string;
  hoverColor?: string;
}

function AddElementDropdown({
  isOpen,
  onClose,
  onAddElement,
  allElements = [],
  clipboard,
  backgroundColor = "#eff6ff",
  hoverColor = "#dbeafe",
}: AddElementDropdownProps) {
  const [tickerInput, setTickerInput] = useState("");

  if (!isOpen) return null;

  const handleTickerSubmit = () => {
    if (tickerInput.trim()) {
      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: tickerInput.trim().toUpperCase(),
        weight: 100,
      };
      onAddElement(newTicker);
      setTickerInput("");
      onClose();
    }
  };

  const handleSelectType = (type: "weight" | "gate" | "scale" | "sort") => {
    if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: 100,
        weightMode: "equal",
        children: [],
      };
      onAddElement(newWeight);
    } else if (type === "gate") {
      const newGate = createDefaultGateElement(allElements);
      newGate.weight = 100;
      onAddElement(newGate);
    } else if (type === "scale") {
      const newScale = createDefaultScaleElement(100, allElements);
      onAddElement(newScale);
    } else if (type === "sort") {
      const newSort = createDefaultSortElement(100, allElements);
      onAddElement(newSort);
    }
    onClose();
  };

  const handlePaste = () => {
    if (clipboard) {
      const cloned = deepCloneElement(clipboard);
      cloned.weight = 100;
      onAddElement(cloned);
      onClose();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        padding: "8px",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <input
        type="text"
        autoFocus
        value={tickerInput}
        onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleTickerSubmit();
          } else if (e.key === "Escape") {
            onClose();
            setTickerInput("");
          }
        }}
        placeholder="Enter ticker..."
        style={{
          fontSize: "13px",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          padding: "4px 8px",
          outline: "none",
        }}
      />
      <button
        onClick={() => handleSelectType("weight")}
        style={{
          fontSize: "13px",
          padding: "4px 8px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          borderRadius: "4px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Weight
      </button>
      <button
        onClick={() => handleSelectType("gate")}
        style={{
          fontSize: "13px",
          padding: "4px 8px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          borderRadius: "4px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Gate
      </button>
      <button
        onClick={() => handleSelectType("scale")}
        style={{
          fontSize: "13px",
          padding: "4px 8px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          borderRadius: "4px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Scale
      </button>
      <button
        onClick={() => handleSelectType("sort")}
        style={{
          fontSize: "13px",
          padding: "4px 8px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          borderRadius: "4px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Sort
      </button>
      {clipboard && (
        <button
          onClick={handlePaste}
          style={{
            fontSize: "13px",
            padding: "4px 8px",
            background: "transparent",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            borderRadius: "4px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          Paste
        </button>
      )}
    </div>
  );
}
// ========== INDICATOR PARAMS COMPONENT ==========

interface IndicatorParamsProps {
  indicator: IndicatorName;
  params: Record<string, string>;
  onUpdate: (params: Record<string, string>) => void;
  conditionIndex: number;
  elementId: string;
  validationErrors: ValidationError[];
  variableLists: Array<{ name: string }>;
  variablesLoading: boolean;
  inline?: boolean;
}

function IndicatorParams({
  indicator,
  params,
  onUpdate,
  conditionIndex,
  elementId,
  validationErrors,
  variableLists,
  variablesLoading,
  inline = false,
}: IndicatorParamsProps) {
  const paramKeys = keysForIndicator(indicator);

  if (paramKeys.length === 0) {
    return null; // Don't show anything for no-param indicators
  }

  const handleParamChange = (key: string, value: string) => {
    onUpdate({ ...params, [key]: value });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        marginLeft: inline ? '0' : undefined,
      }}
    >
      <span style={{ fontSize: '13px', color: '#9ca3af' }}>(</span>
      {paramKeys.map((key, idx) => {
        const value = params[key] || '';
        const hasUndefinedVar = hasUndefinedVariableInField(value, variableLists, variablesLoading);
        const hasError = hasFieldError(elementId, `conditions.${conditionIndex}.period`, validationErrors);
        const defaultValue = getEffectiveParams(indicator)[key];

        // Check if this param should be a dropdown (MA type)
        const isMatypeParam = key === 'matype' || key === 'slowk_matype' || key === 'slowd_matype';

        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {idx > 0 && <span style={{ fontSize: '13px', color: '#9ca3af' }}>,</span>}

            {isMatypeParam ? (
              // Dropdown for MA type
              <select
                value={value || String(defaultValue)}
                onChange={(e) => handleParamChange(key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  border: (hasError || hasUndefinedVar) ? '2px solid #ef4444' : '1px solid #d1d5db',
                  outline: 'none',
                  padding: '3px 6px',
                  background: (hasError || hasUndefinedVar) ? '#fee2e2' : '#fff',
                  fontSize: '13px',
                  color: '#111827',
                  borderRadius: '3px',
                }}
                className="focus:ring-2 focus:ring-blue-500"
                title={PARAM_LABELS[key]}
              >
                <option value="0">SMA</option>
                <option value="1">EMA</option>
                <option value="2">WMA</option>
                <option value="3">DEMA</option>
                <option value="4">TEMA</option>
                <option value="5">TRIMA</option>
                <option value="6">KAMA</option>
                <option value="7">MAMA</option>
                <option value="8">T3</option>
              </select>
            ) : (
              // Text input for numeric params
              <input
                type="text"
                value={value}
                onChange={(e) => handleParamChange(key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={String(defaultValue)}
                style={{
                  border: (hasError || hasUndefinedVar) ? '2px solid #ef4444' : '1px solid #d1d5db',
                  outline: 'none',
                  padding: '3px 6px',
                  background: (hasError || hasUndefinedVar) ? '#fee2e2' : (value ? '#fff' : '#f9fafb'),
                  fontSize: '13px',
                  color: value ? '#111827' : '#9ca3af',
                  width: `${Math.max((value || String(defaultValue)).length * 9 + 16, 45)}px`,
                  maxWidth: '200px',
                  borderRadius: '3px',
                  textAlign: 'center',
                }}
                className="focus:ring-2 focus:ring-blue-500"
                title={hasUndefinedVar ? `Variable ${value} is not defined` : PARAM_LABELS[key]}
              />
            )}
          </div>
        );
      })}
      <span style={{ fontSize: '13px', color: '#9ca3af' }}>)</span>
    </div>
  );
}

// ========== CONDITION ROW COMPONENT ==========

interface ConditionRowProps {
  condition: GateCondition;
  conditionIndex: number;
  onUpdate: (updates: Partial<GateCondition>) => void;
  onRemove?: () => void;
  showRemove: boolean;
  elementId: string;
  validationErrors: ValidationError[];
  variableLists: Array<{ name: string }>;
  variablesLoading: boolean;
  inline?: boolean; // If true, render without background (for single-line IF mode)
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  onVariableCreated?: () => void;
}

function ConditionRow({
  condition,
  conditionIndex,
  onUpdate,
  onRemove,
  showRemove,
  elementId,
  validationErrors,
  variableLists,
  variablesLoading,
  inline = false,
  tickerMetadata,
  metadataLoading,
  metadataError,
  onVariableCreated,
}: ConditionRowProps) {
  const [showThresholdPopover, setShowThresholdPopover] = useState(false);
  const thresholdInputRef = useRef<HTMLInputElement>(null);

  // Check for undefined variables in this condition's fields
  const tickerHasUndefinedVar = hasUndefinedVariableInField(condition.ticker, variableLists, variablesLoading);
  const periodHasUndefinedVar = hasUndefinedVariableInField(condition.period, variableLists, variablesLoading);
  const thresholdHasUndefinedVar = hasUndefinedVariableInField(condition.threshold, variableLists, variablesLoading);
  const rightTickerHasUndefinedVar = hasUndefinedVariableInField(condition.rightTicker, variableLists, variablesLoading);
  const rightPeriodHasUndefinedVar = hasUndefinedVariableInField(condition.rightPeriod, variableLists, variablesLoading);
  const indicatorLabel = (condition.indicator || "").replace(/_/g, " ");
  const indicatorSelectWidth = `${Math.max(indicatorLabel.length * 9 + 30, 120)}px`;
  const rightIndicatorLabel = ((condition.rightIndicator || "RSI") as string).replace(/_/g, " ");
  const rightIndicatorSelectWidth = `${Math.max(rightIndicatorLabel.length * 9 + 30, 120)}px`;
  const conditionTickerSymbol = condition.ticker?.toUpperCase() ?? "";
  const metadataReady = !!tickerMetadata && !metadataLoading && !metadataError;
  const conditionTickerMetadata = conditionTickerSymbol && tickerMetadata ? tickerMetadata.get(conditionTickerSymbol) : undefined;
  // Only check ticker metadata if it's not a variable reference
  const isVariable = condition.ticker?.trim().startsWith("$");
  const conditionTickerUnknown =
    metadataReady &&
    conditionTickerSymbol.length > 0 &&
    !isVariable &&  // Don't check metadata for variables
    !tickerMetadata?.has(conditionTickerSymbol);
  const conditionTickerTooltip = tickerHasUndefinedVar
    ? `Variable ${condition.ticker} is not defined in Variables tab. Double-click to define.`
    : conditionTickerUnknown
      ? `${conditionTickerSymbol} not found in Alpaca asset list`
      : (conditionTickerMetadata?.name?.trim() || undefined);
  const rightTickerSymbol = condition.rightTicker?.toUpperCase() ?? "";
  const rightTickerMetadata = rightTickerSymbol && tickerMetadata ? tickerMetadata.get(rightTickerSymbol) : undefined;
  const isRightVariable = condition.rightTicker?.trim().startsWith("$");
  const rightTickerUnknown =
    metadataReady &&
    rightTickerSymbol.length > 0 &&
    !isRightVariable &&  // Don't check metadata for variables
    !tickerMetadata?.has(rightTickerSymbol);
  const rightTickerTooltip = rightTickerHasUndefinedVar
    ? `Variable ${condition.rightTicker} is not defined in Variables tab. Double-click to define.`
    : rightTickerUnknown
      ? `${rightTickerSymbol} not found in Alpaca asset list`
      : (rightTickerMetadata?.name?.trim() || undefined);
  const leftTickerHasFieldError = hasFieldError(elementId, `conditions.${conditionIndex}.ticker`, validationErrors);
  const rightTickerHasFieldError = hasFieldError(elementId, `conditions.${conditionIndex}.rightTicker`, validationErrors);
  const leftTickerVisualError = leftTickerHasFieldError || tickerHasUndefinedVar || conditionTickerUnknown;
  const rightTickerVisualError = rightTickerHasFieldError || rightTickerHasUndefinedVar || rightTickerUnknown;

  const handleSaveVariable = async (fieldValue: string, values: string[], type: VarType) => {
    try {
      // Normalize variable name: remove $ prefix and lowercase
      const varName = fieldValue.startsWith("$")
        ? fieldValue.slice(1).toLowerCase()
        : fieldValue.toLowerCase();
      await variablesApi.createVariableList({
        name: varName,
        type,
        values,
        is_shared: false,
      });
      // Refresh variables list to update UI and wait for completion
      if (onVariableCreated) {
        await onVariableCreated();
      }
    } catch (err) {
      console.error("Failed to create variable:", err);
      throw err; // Re-throw so popover knows it failed
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: inline ? '0' : '8px',
      backgroundColor: inline ? 'transparent' : '#f9fafb',
      borderRadius: inline ? '0' : '4px',
      flexWrap: 'wrap',
      position: 'relative',
    }}>
      {/* Left side: INDICATOR(params) of TICKER */}
      <select
        value={condition.indicator}
        onChange={(e) => {
          const newIndicator = e.target.value as IndicatorName;
          const newParams = defaultParams(newIndicator);
          onUpdate({
            indicator: newIndicator,
            params: newParams,
            period: paramsToPeriodString(newIndicator, newParams),
          });
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          border: '1px solid #d1d5db',
          outline: 'none',
          padding: '4px 8px',
          background: '#fff',
          fontSize: '13px',
          color: '#111827',
          cursor: 'pointer',
          borderRadius: '4px',
          width: indicatorSelectWidth,
        }}
        className="focus:ring-2 focus:ring-blue-500"
      >
        {indicatorOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      {/* Indicator params */}
      <IndicatorParams
        indicator={condition.indicator}
        params={condition.params || {}}
        onUpdate={(params) => {
          // Update period field to match params for executor lookup
          const period = paramsToPeriodString(condition.indicator, params);
          onUpdate({ params, period });
        }}
        conditionIndex={conditionIndex}
        elementId={elementId}
        validationErrors={validationErrors}
        variableLists={variableLists}
        variablesLoading={variablesLoading}
      />

      <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>of</span>

      <TickerInput
        value={condition.ticker}
        onChange={(ticker) => onUpdate({ ticker })}
        elementId={elementId}
        field={`conditions.${conditionIndex}.ticker`}
        variableLists={variableLists}
        variablesLoading={variablesLoading}
        tickerMetadata={tickerMetadata}
        metadataLoading={metadataLoading}
        metadataError={metadataError}
        validationErrors={validationErrors}
        onVariableCreated={onVariableCreated}
        placeholder="Ticker"
        maxWidth="300px"
        stopPropagation={true}
      />

      {/* Operator */}
      <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>is</span>

      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as "gt" | "lt" })}
        onClick={(e) => e.stopPropagation()}
        style={{
          border: '1px solid #d1d5db',
          outline: 'none',
          padding: '4px 8px',
          background: '#fff',
          fontSize: '13px',
          color: '#111827',
          cursor: 'pointer',
          borderRadius: '4px',
          width: 'fit-content',
          minWidth: '0',
        }}
        className="focus:ring-2 focus:ring-blue-500"
      >
        <option value="gt">greater than</option>
        <option value="lt">less than</option>
      </select>

      {/* Compare To Toggle */}
      <select
        value={condition.compareTo || "indicator"}
        onChange={(e) => onUpdate({
          compareTo: e.target.value as "threshold" | "indicator",
          ...(e.target.value === "indicator" ? { threshold: undefined } : {}),
        })}
        onClick={(e) => e.stopPropagation()}
        style={{
          border: '1px solid #7f3dff',
          outline: 'none',
          padding: '4px 8px',
          background: '#f3e8ff',
          fontSize: '13px',
          color: '#7f3dff',
          cursor: 'pointer',
          borderRadius: '4px',
          fontWeight: '600',
          width: 'fit-content',
          minWidth: '0',
        }}
        className="focus:ring-2 focus:ring-purple-500"
      >
        <option value="threshold">Threshold</option>
        <option value="indicator">Indicator</option>
      </select>

      {/* Conditional right side based on compareTo */}
      {condition.compareTo === "threshold" ? (
        <>
          <input
            ref={thresholdInputRef}
            type="text"
            value={condition.threshold || ""}
            onChange={(e) => onUpdate({ threshold: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (thresholdHasUndefinedVar) {
                setShowThresholdPopover(true);
              }
            }}
            style={{
              border: (hasFieldError(elementId, `conditions.${conditionIndex}.threshold`, validationErrors) || thresholdHasUndefinedVar) ? '2px solid #ef4444' : '1px solid #d1d5db',
              outline: 'none',
              padding: '4px 8px',
              background: (hasFieldError(elementId, `conditions.${conditionIndex}.threshold`, validationErrors) || thresholdHasUndefinedVar) ? '#fee2e2' : '#fff',
              fontSize: '13px',
              color: condition.threshold ? '#111827' : '#9ca3af',
              width: `${Math.max((condition.threshold || 'Value').length * 9 + 20, 80)}px`,
              maxWidth: '300px',
              flexShrink: 0,
              borderRadius: '4px',
              cursor: thresholdHasUndefinedVar ? 'pointer' : 'text',
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="Value"
            title={thresholdHasUndefinedVar ? `Variable ${condition.threshold} is not defined in Variables tab. Double-click to define.` : undefined}
          />

          {showThresholdPopover && thresholdInputRef.current && (
            <VariablePopover
              variableName={condition.threshold?.startsWith("$") ? condition.threshold.slice(1) : condition.threshold || ""}
              anchorEl={thresholdInputRef.current}
              onSave={(values, type) => handleSaveVariable(condition.threshold || "", values, type)}
              onClose={() => setShowThresholdPopover(false)}
            />
          )}
        </>
      ) : (
        <>
          <select
            value={condition.rightIndicator || "RSI"}
            onChange={(e) => {
              const newIndicator = e.target.value as IndicatorName;
              const newParams = defaultParams(newIndicator);
              onUpdate({
                rightIndicator: newIndicator,
                rightParams: newParams,
                rightPeriod: paramsToPeriodString(newIndicator, newParams),
              });
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: '1px solid #d1d5db',
              outline: 'none',
              padding: '4px 8px',
              background: '#fff',
              fontSize: '13px',
              color: '#111827',
              cursor: 'pointer',
              borderRadius: '4px',
              width: rightIndicatorSelectWidth,
            }}
            className="focus:ring-2 focus:ring-blue-500"
          >
            {indicatorOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          {/* Right indicator params */}
          <IndicatorParams
            indicator={condition.rightIndicator || "RSI"}
            params={condition.rightParams || {}}
            onUpdate={(rightParams) => {
              // Update rightPeriod field to match rightParams for executor lookup
              const rightPeriod = paramsToPeriodString(condition.rightIndicator || "RSI", rightParams);
              onUpdate({ rightParams, rightPeriod });
            }}
            conditionIndex={conditionIndex}
            elementId={elementId}
            validationErrors={validationErrors}
            variableLists={variableLists}
            variablesLoading={variablesLoading}
          />

          <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>of</span>

          <TickerInput
            value={condition.rightTicker || ""}
            onChange={(rightTicker) => onUpdate({ rightTicker })}
            elementId={elementId}
            field={`conditions.${conditionIndex}.rightTicker`}
            variableLists={variableLists}
            variablesLoading={variablesLoading}
            tickerMetadata={tickerMetadata}
            metadataLoading={metadataLoading}
            metadataError={metadataError}
            validationErrors={validationErrors}
            onVariableCreated={onVariableCreated}
            placeholder="Ticker"
            maxWidth="300px"
            stopPropagation={true}
          />
        </>
      )}

      {/* Remove button (if applicable) */}
      {showRemove && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            fontSize: '12px',
            color: '#dc2626',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Remove condition"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ========== GATE CARD ==========

export interface GateCardProps {
  element: GateElement;
  onUpdate: (updated: GateElement) => void;
  onDelete: () => void;
  onCopy?: () => void;
  clipboard?: Element | null;
  depth?: number;
  showWeight?: boolean;
  isWeightInvalid?: boolean;
  allElements?: Element[]; // For counting gates
  validationErrors?: ValidationError[];
  variableLists?: Array<{ name: string }>;
  variablesLoading?: boolean;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  onVariableCreated?: () => void;
}

export function GateCard({ element, onUpdate, onDelete, onCopy, clipboard, depth = 0, showWeight = false, isWeightInvalid = false, allElements = [], validationErrors = [], variableLists = [], variablesLoading = false, tickerMetadata, metadataLoading, metadataError, onVariableCreated }: GateCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showThenDropdown, setShowThenDropdown] = useState(false);
  const [showElseDropdown, setShowElseDropdown] = useState(false);

  // Handle backward compatibility: migrate old single condition to new format
  const conditionMode = element.conditionMode || "if";
  const defaultIndicator: IndicatorName = "RSI";
  const conditions = element.conditions || (element.condition ? [element.condition] : [{
    ticker: "",
    indicator: defaultIndicator,
    period: defaultParams(defaultIndicator).period || "",
    params: defaultParams(defaultIndicator),
    operator: "gt",
    compareTo: "indicator",
    threshold: "",
    rightTicker: "",
    rightIndicator: defaultIndicator,
    rightPeriod: defaultParams(defaultIndicator).period || "",
    rightParams: defaultParams(defaultIndicator),
  }]);

  // Use conditions directly - no migration during render to prevent infinite loops
  const migratedConditions = conditions;

  // Helper functions for managing conditions
  const updateCondition = (index: number, updates: Partial<GateCondition>) => {
    const newConditions = migratedConditions.map((cond, i) =>
      i === index ? { ...cond, ...updates } : cond
    );
    const { condition, ...rest } = element; // Remove old condition field
    onUpdate({ ...rest, conditions: newConditions });
  };

  const addCondition = () => {
    const defaultIndicator: IndicatorName = "RSI";
    const newCondition: GateCondition = {
      ticker: "",
      indicator: defaultIndicator,
      period: defaultParams(defaultIndicator).period || "",
      params: defaultParams(defaultIndicator),
      operator: "gt",
      compareTo: "indicator",
      threshold: "",
      rightTicker: "",
      rightIndicator: defaultIndicator,
      rightPeriod: defaultParams(defaultIndicator).period || "",
      rightParams: defaultParams(defaultIndicator),
    };
    const { condition, ...rest} = element; // Remove old condition field
    onUpdate({ ...rest, conditions: [...migratedConditions, newCondition] });
  };

  const removeCondition = (index: number) => {
    if (migratedConditions.length <= 1) return; // Keep at least one condition
    const newConditions = migratedConditions.filter((_, i) => i !== index);
    const { condition, ...rest } = element; // Remove old condition field
    onUpdate({ ...rest, conditions: newConditions });
  };

  const updateConditionMode = (mode: "if" | "if_all" | "if_any" | "if_none") => {
    // When switching to IF ALL, IF ANY, or IF NONE, auto-add a second condition if only one exists
    if ((mode === "if_all" || mode === "if_any" || mode === "if_none") && migratedConditions.length === 1) {
      addCondition();
    }
    const { condition, ...rest } = element; // Remove old condition field
    onUpdate({ ...rest, conditionMode: mode });
  };

  const handleAddThenElement = (newElement: Element) => {
    newElement.weight = 100;
    onUpdate({ ...element, thenChildren: [...element.thenChildren, newElement] });
  };

  const handleAddElseElement = (newElement: Element) => {
    newElement.weight = 100;
    onUpdate({ ...element, elseChildren: [...element.elseChildren, newElement] });
  };


  const updateThenChild = (id: string, updated: Element) => {
    onUpdate({
      ...element,
      thenChildren: element.thenChildren.map((child) => (child.id === id ? updated : child)),
    });
  };

  const deleteThenChild = (id: string) => {
    onUpdate({
      ...element,
      thenChildren: element.thenChildren.filter((child) => child.id !== id),
    });
  };

  const updateElseChild = (id: string, updated: Element) => {
    onUpdate({
      ...element,
      elseChildren: element.elseChildren.map((child) => (child.id === id ? updated : child)),
    });
  };

  const deleteElseChild = (id: string) => {
    onUpdate({
      ...element,
      elseChildren: element.elseChildren.filter((child) => child.id !== id),
    });
  };

  // Zebra striping: even depths get light gray background
  const bgColor = depth % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)';

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div
        onClick={(e) => {
          // Close dropdowns when clicking anywhere on the card
          if (showThenDropdown) {
            setShowThenDropdown(false);
          }
          if (showElseDropdown) {
            setShowElseDropdown(false);
          }
        }}
        style={{
          position: 'relative',
          backgroundColor: bgColor,
          marginBottom: '8px',
          paddingLeft: depth > 0 ? '24px' : '0px',
          overflow: 'visible'
        }}>
        {/* COLLAPSED BAR - QM Style */}
        <div
          className="w-full hover:bg-gray-50 transition-colors"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            padding: '8px',
            paddingLeft: showWeight ? '80px' : '8px',
            minHeight: 'auto',
            lineHeight: '1.3',
            gap: '8px',
            overflow: 'visible'
          }}
        >
          {/* L-shaped connector */}
          {depth > 0 && (
            <div style={{
              position: 'absolute',
              left: '-24px',
              top: '50%',
              width: '24px',
              height: '1px',
              backgroundColor: '#d1d5db',
            }} />
          )}
          {depth > 0 && (
            <div style={{
              position: 'absolute',
              left: '-24px',
              top: '-8px',
              bottom: '50%',
              width: '1px',
              backgroundColor: '#d1d5db',
            }} />
          )}
          {showWeight && (
            <div style={{
              position: 'absolute',
              left: '0',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              paddingLeft: '8px',
            }}>
              <input
                type="number"
                value={element.weight}
                onChange={(e) => onUpdate({ ...element, weight: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
                style={{
                  border: isWeightInvalid ? '2px solid #ef4444' : '1px solid #d1d5db',
                  outline: 'none',
                  padding: '4px 6px',
                  background: isWeightInvalid ? '#fee2e2' : '#fff',
                  fontSize: '13px',
                  color: '#111827',
                  width: '50px',
                  flexShrink: 0,
                  borderRadius: '4px',
                  MozAppearance: 'textfield',
                  WebkitAppearance: 'none',
                  appearance: 'textfield',
                }}
                className="focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>%</span>
            </div>
          )}

          <motion.div
            onClick={() => setIsOpen(!isOpen)}
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-gray-600 flex-shrink-0 cursor-pointer"
            style={{ fontSize: '12px' }}
          >
            ▶
          </motion.div>

          {/* Inline editable format: [NAME]: IF [DAYS] day [INDICATOR] of [TICKER] is [OP] [DAYS] day [INDICATOR] of [TICKER] */}
          <input
          type="text"
          value={element.name}
          onChange={(e) => onUpdate({ ...element, name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          style={{
            border: '1px solid #d1d5db',
            outline: 'none',
            padding: '4px 8px',
            background: '#fff',
            fontSize: '13px',
            fontWeight: '500',
            color: element.name ? '#111827' : '#9ca3af',
            width: `${Math.max((element.name.length || 4), 4) * 8 + 20}px`,
            minWidth: '80px',
            flexShrink: 0,
            borderRadius: '4px',
          }}
          className="focus:ring-2 focus:ring-blue-500"
          placeholder="Name"
        />

          <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>:</span>

          {/* Condition Mode Dropdown */}
          <select
            value={conditionMode}
            onChange={(e) => updateConditionMode(e.target.value as "if" | "if_all" | "if_any" | "if_none")}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: '1px solid #3b82f6',
              outline: 'none',
              padding: '4px 8px',
              background: '#eff6ff',
              fontSize: '13px',
              color: '#3b82f6',
              cursor: 'pointer',
              borderRadius: '4px',
              fontWeight: '600',
              width: 'fit-content',
              minWidth: '0',
            }}
            className="focus:ring-2 focus:ring-blue-500"
          >
            <option value="if">IF</option>
            <option value="if_all">IF ALL</option>
            <option value="if_any">IF ANY</option>
            <option value="if_none">IF NONE</option>
          </select>

          {/* First condition always inline */}
          <ConditionRow
            condition={migratedConditions[0]}
            conditionIndex={0}
            onUpdate={(updates) => updateCondition(0, updates)}
            showRemove={false}
            elementId={element.id}
            validationErrors={validationErrors}
            variableLists={variableLists}
            variablesLoading={variablesLoading}
            inline={true}
            tickerMetadata={tickerMetadata}
            metadataLoading={metadataLoading}
            metadataError={metadataError}
            onVariableCreated={onVariableCreated}
          />

          {/* Copy and Delete buttons - inline on same row */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', flexShrink: 0 }}>
            {onCopy && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  color: '#3b82f6',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="Copy"
              >
                <Copy size={14} />
              </button>
            )}
            <button
              onClick={onDelete}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                color: '#dc2626',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Additional conditions container - vertically stacked for multi-condition modes (2nd, 3rd, etc.) */}
        {(conditionMode === "if_all" || conditionMode === "if_any" || conditionMode === "if_none") && migratedConditions.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', padding: '0 8px', marginTop: '8px' }}>
          {migratedConditions.slice(1).map((condition, condIndex) => (
            <div key={condIndex + 1} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Invisible spacers to match first row layout */}
              <div style={{ fontSize: '12px', flexShrink: 0, visibility: 'hidden' }}>▶</div>
              <input
                type="text"
                value={element.name}
                disabled
                style={{
                  border: '1px solid transparent',
                  padding: '4px 8px',
                  background: 'transparent',
                  fontSize: '13px',
                  width: `${Math.max((element.name.length || 4), 4) * 8 + 20}px`,
                  minWidth: '80px',
                  flexShrink: 0,
                  borderRadius: '4px',
                  visibility: 'hidden',
                  pointerEvents: 'none',
                }}
              />
              <span style={{ fontSize: '13px', flexShrink: 0, visibility: 'hidden' }}>:</span>
              <select
                disabled
                value={conditionMode}
                style={{
                  border: '1px solid transparent',
                  padding: '4px 8px',
                  background: 'transparent',
                  fontSize: '13px',
                  width: 'fit-content',
                  minWidth: '0',
                  visibility: 'hidden',
                  pointerEvents: 'none',
                }}
              >
                <option value="if_all">IF ALL</option>
                <option value="if_any">IF ANY</option>
                <option value="if_none">IF NONE</option>
              </select>

              <ConditionRow
                condition={condition}
                conditionIndex={condIndex + 1}
                onUpdate={(updates) => updateCondition(condIndex + 1, updates)}
                onRemove={() => removeCondition(condIndex + 1)}
                showRemove={true}
                elementId={element.id}
                validationErrors={validationErrors}
                variableLists={variableLists}
            variablesLoading={variablesLoading}
                inline={true}
                tickerMetadata={tickerMetadata}
                metadataLoading={metadataLoading}
                metadataError={metadataError}
              />
            </div>
          ))}
        </div>
        )}

        {/* + Condition button - show for multi-condition modes */}
        {(conditionMode === "if_all" || conditionMode === "if_any" || conditionMode === "if_none") && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px', marginTop: '8px' }}>
          {/* Invisible spacers to match first row layout */}
          <div style={{ fontSize: '12px', flexShrink: 0, visibility: 'hidden' }}>▶</div>
          <input
            type="text"
            value={element.name}
            disabled
            style={{
              border: '1px solid transparent',
              padding: '4px 8px',
              background: 'transparent',
              fontSize: '13px',
              width: `${Math.max((element.name.length || 4), 4) * 8 + 20}px`,
              minWidth: '80px',
              flexShrink: 0,
              borderRadius: '4px',
              visibility: 'hidden',
              pointerEvents: 'none',
            }}
          />
          <span style={{ fontSize: '13px', flexShrink: 0, visibility: 'hidden' }}>:</span>
          <select
            disabled
            value={conditionMode}
            style={{
              border: '1px solid transparent',
              padding: '4px 8px',
              background: 'transparent',
              fontSize: '13px',
              width: 'fit-content',
              minWidth: '0',
              visibility: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <option value="if_all">IF ALL</option>
            <option value="if_any">IF ANY</option>
            <option value="if_none">IF NONE</option>
          </select>

          <button
            onClick={(e) => {
              e.stopPropagation();
              addCondition();
            }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              color: '#3b82f6',
              background: 'transparent',
              border: '1px dashed #3b82f6',
              borderRadius: '4px',
              cursor: 'pointer',
              width: 'fit-content',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            + Condition
          </button>
        </div>
        )}

        {/* EXPANDED VIEW - Then/Else */}
        <AnimatePresence>
          {isOpen && (
            <Collapsible.Content forceMount asChild>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                  {/* THEN */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{
                      marginBottom: '8px',
                      paddingLeft: '56px',
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: '500', flexShrink: 0 }}>Then</span>
                    </div>
                    <div style={{ position: 'relative', paddingLeft: '24px' }}>
                      {element.thenChildren.map((child) => {
                        if (child.type === "gate") {
                      return (
                        <GateCard
                          key={child.id}
                          element={child}
                          onUpdate={(updated) => updateThenChild(child.id, updated)}
                              onDelete={() => deleteThenChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                          depth={depth + 1}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                        />
                      );
                    } else if (child.type === "ticker") {
                      return (
                        <TickerCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateThenChild(child.id, updated)}
                              onDelete={() => deleteThenChild(child.id)}
                              onCopy={onCopy}
                          depth={depth + 1}
                          showWeight={false}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                        />
                      );
                    } else if (child.type === "weight") {
                      return (
                        <WeightCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateThenChild(child.id, updated)}
                              onDelete={() => deleteThenChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                          depth={depth + 1}
                          showWeight={false}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                        />
                      );
                        } else if (child.type === "scale") {
                          return (
                            <ScaleCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateThenChild(child.id, updated)}
                              onDelete={() => deleteThenChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                              depth={depth + 1}
                              showWeight={false}
                              allElements={allElements}
                              validationErrors={validationErrors}
                              variableLists={variableLists}
                          variablesLoading={variablesLoading}
                              tickerMetadata={tickerMetadata}
                              metadataLoading={metadataLoading}
                              metadataError={metadataError}
                            />
                          );
                        } else if (child.type === "sort") {
                          return (
                            <SortCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateThenChild(child.id, updated)}
                              onDelete={() => deleteThenChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                              depth={depth + 1}
                              showWeight={false}
                              allElements={allElements}
                              validationErrors={validationErrors}
                              variableLists={variableLists}
                          variablesLoading={variablesLoading}
                              tickerMetadata={tickerMetadata}
                              metadataLoading={metadataLoading}
                              metadataError={metadataError}
                            />
                          );
                        }
                        return null;
                      })}
                      {element.thenChildren.length === 0 && (
                        <div style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '8px',
                          marginBottom: '8px',
                          padding: '8px',
                          paddingLeft: '32px',
                          backgroundColor: 'transparent',
                        }}>
                          {/* L-shaped connector for add button */}
                          <div style={{
                            position: 'absolute',
                            left: '0',
                            top: '50%',
                            width: '24px',
                            height: '1px',
                            backgroundColor: '#d1d5db',
                          }} />
                          <div style={{
                            position: 'absolute',
                            left: '0',
                            top: '0',
                            bottom: '50%',
                            width: '1px',
                            backgroundColor: '#d1d5db',
                          }} />
                          {!showThenDropdown ? (
                          <button
                            onClick={() => setShowThenDropdown(true)}
                            style={{
                              fontSize: '14px',
                              color: '#16a34a',
                              background: '#f0fdf4',
                              border: '1px dashed #16a34a',
                              cursor: 'pointer',
                              padding: '4px 12px',
                              borderRadius: '4px',
                              fontWeight: '500',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#dcfce7'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#f0fdf4'}
                          >
                            + Add
                          </button>
                        ) : (
                          <AddElementDropdown
                            isOpen={showThenDropdown}
                            onClose={() => setShowThenDropdown(false)}
                            onAddElement={handleAddThenElement}
                            allElements={allElements}
                            clipboard={clipboard}
                          />
                        )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ELSE */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{
                      marginBottom: '8px',
                      paddingLeft: '56px',
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: '500', flexShrink: 0 }}>Else</span>
                    </div>
                    <div style={{ position: 'relative', paddingLeft: '24px' }}>
                      {element.elseChildren.map((child) => {
                        if (child.type === "gate") {
                      return (
                        <GateCard
                          key={child.id}
                          element={child}
                          onUpdate={(updated) => updateElseChild(child.id, updated)}
                              onDelete={() => deleteElseChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                          depth={depth + 1}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                        />
                      );
                    } else if (child.type === "ticker") {
                      return (
                        <TickerCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateElseChild(child.id, updated)}
                              onDelete={() => deleteElseChild(child.id)}
                              onCopy={onCopy}
                          depth={depth + 1}
                          showWeight={false}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                        />
                      );
                    } else if (child.type === "weight") {
                      return (
                        <WeightCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateElseChild(child.id, updated)}
                              onDelete={() => deleteElseChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                          depth={depth + 1}
                          showWeight={false}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                        />
                      );
                        } else if (child.type === "scale") {
                          return (
                            <ScaleCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateElseChild(child.id, updated)}
                              onDelete={() => deleteElseChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                              depth={depth + 1}
                              showWeight={false}
                              allElements={allElements}
                              validationErrors={validationErrors}
                              variableLists={variableLists}
                          variablesLoading={variablesLoading}
                              tickerMetadata={tickerMetadata}
                              metadataLoading={metadataLoading}
                              metadataError={metadataError}
                            />
                          );
                        } else if (child.type === "sort") {
                          return (
                            <SortCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateElseChild(child.id, updated)}
                              onDelete={() => deleteElseChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                              depth={depth + 1}
                              showWeight={false}
                              allElements={allElements}
                              validationErrors={validationErrors}
                              variableLists={variableLists}
                          variablesLoading={variablesLoading}
                              tickerMetadata={tickerMetadata}
                              metadataLoading={metadataLoading}
                              metadataError={metadataError}
                            />
                          );
                        }
                        return null;
                      })}
                      {element.elseChildren.length === 0 && (
                        <div style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '8px',
                          marginBottom: '8px',
                          padding: '8px',
                          paddingLeft: '32px',
                          backgroundColor: 'transparent',
                        }}>
                          {/* L-shaped connector for add button */}
                          <div style={{
                            position: 'absolute',
                            left: '0',
                            top: '50%',
                            width: '24px',
                            height: '1px',
                            backgroundColor: '#d1d5db',
                          }} />
                          <div style={{
                            position: 'absolute',
                            left: '0',
                            top: '0',
                            bottom: '50%',
                            width: '1px',
                            backgroundColor: '#d1d5db',
                          }} />
                          {!showElseDropdown ? (
                          <button
                            onClick={() => setShowElseDropdown(true)}
                            style={{
                              fontSize: '14px',
                              color: '#dc2626',
                              background: '#fef2f2',
                              border: '1px dashed #dc2626',
                              cursor: 'pointer',
                              padding: '4px 12px',
                              borderRadius: '4px',
                              fontWeight: '500',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#fef2f2'}
                          >
                            + Add
                          </button>
                        ) : (
                          <AddElementDropdown
                            isOpen={showElseDropdown}
                            onClose={() => setShowElseDropdown(false)}
                            onAddElement={handleAddElseElement}
                            allElements={allElements}
                            clipboard={clipboard}
                          />
                        )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </Collapsible.Content>
          )}
        </AnimatePresence>
      </div>
    </Collapsible.Root>
  );
}

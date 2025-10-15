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
  TickerElement,
  WeightElement,
  ScaleElement,
} from "../../types/builder";
import type { ValidationError } from "../../utils/validation";
import {
  deepCloneElement,
  hasFieldError,
  hasUndefinedVariableInField,
} from "../../utils/builder";
import type { TickerMetadata } from "../../api/tickers";
import { TickerCard } from "./TickerCard";
import { WeightCard } from "./WeightCard";
import { GateCard } from "./GateCard";
import { SortCard } from "./SortCard";
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

// ========== SCALE CARD ==========

export interface ScaleCardProps {
  element: ScaleElement;
  onUpdate: (updated: ScaleElement) => void;
  onDelete: () => void;
  onCopy?: () => void;
  clipboard?: Element | null;
  depth?: number;
  showWeight?: boolean;
  allElements?: Element[];
  validationErrors?: ValidationError[];
  variableLists?: Array<{ name: string }>;
  variablesLoading?: boolean;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  onVariableCreated?: () => void;
}

export function ScaleCard({ element, onUpdate, onDelete, onCopy, clipboard, depth = 0, showWeight = false, allElements = [], validationErrors = [], variableLists = [], variablesLoading = false, tickerMetadata, metadataLoading, metadataError, onVariableCreated }: ScaleCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showTickerPopover, setShowTickerPopover] = useState(false);
  const [showRangeMinPopover, setShowRangeMinPopover] = useState(false);
  const [showRangeMaxPopover, setShowRangeMaxPopover] = useState(false);
  const tickerInputRef = useRef<HTMLInputElement>(null);
  const rangeMinInputRef = useRef<HTMLInputElement>(null);
  const rangeMaxInputRef = useRef<HTMLInputElement>(null);

  const config = element.config ?? {
    ticker: "",
    indicator: "CUMULATIVE_RETURN" as IndicatorName,
    params: { ...defaultParams("CUMULATIVE_RETURN") },
    period: paramsToPeriodString("CUMULATIVE_RETURN", defaultParams("CUMULATIVE_RETURN")),
    rangeMin: "0",
    rangeMax: "0",
  };

  const valueUnit = getIndicatorUnit(config.indicator as IndicatorName);
  const unitSuffix = valueUnit === "percent" ? "%" : "";

  const tickerHasUndefinedVar = hasUndefinedVariableInField(config.ticker, variableLists, variablesLoading);
  const rangeMinHasUndefinedVar = hasUndefinedVariableInField(config.rangeMin, variableLists, variablesLoading);
  const rangeMaxHasUndefinedVar = hasUndefinedVariableInField(config.rangeMax, variableLists, variablesLoading);

  const tickerHasError = hasFieldError(element.id, "ticker", validationErrors);
  const indicatorHasError = hasFieldError(element.id, "indicator", validationErrors);
  const rangeMinHasError = hasFieldError(element.id, "rangeMin", validationErrors) || hasFieldError(element.id, "range", validationErrors);
  const rangeMaxHasError = hasFieldError(element.id, "rangeMax", validationErrors) || hasFieldError(element.id, "range", validationErrors);
  const fromBranchHasError = hasFieldError(element.id, "fromChildren", validationErrors);
  const toBranchHasError = hasFieldError(element.id, "toChildren", validationErrors);
  const configTickerSymbol = config.ticker?.toUpperCase() ?? "";
  const metadataReady = !!tickerMetadata && !metadataLoading && !metadataError;
  const configTickerMetadata = configTickerSymbol && tickerMetadata ? tickerMetadata.get(configTickerSymbol) : undefined;
  // Only check ticker metadata if it's not a variable reference
  const isConfigVariable = config.ticker?.trim().startsWith("$");
  const configTickerUnknown =
    metadataReady &&
    configTickerSymbol.length > 0 &&
    !isConfigVariable &&  // Don't check metadata for variables
    !tickerMetadata?.has(configTickerSymbol);
  const configTickerTooltip = tickerHasUndefinedVar
    ? `Variable ${config.ticker} is not defined in Variables tab. Double-click to define.`
    : configTickerUnknown
      ? `${configTickerSymbol} not found in Alpaca asset list`
      : (configTickerMetadata?.name?.trim() || undefined);
  const tickerHasVisualError = tickerHasError || tickerHasUndefinedVar || configTickerUnknown;

  const indicatorLabel = (config.indicator || "").replace(/_/g, " ");
  const indicatorSelectWidth = `${Math.max(indicatorLabel.length * 9 + 30, 120)}px`;

  const updateConfig = (updates: Partial<ScaleElement["config"]>) => {
    onUpdate({ ...element, config: { ...config, ...updates } });
  };

  const handleIndicatorChange = (newIndicator: IndicatorName) => {
    const params = { ...defaultParams(newIndicator) };
    updateConfig({
      indicator: newIndicator,
      params,
      period: paramsToPeriodString(newIndicator, params),
    });
  };

  const handleParamsChange = (params: Record<string, string>) => {
    updateConfig({
      params,
      period: paramsToPeriodString(config.indicator as IndicatorName, params),
    });
  };

  const handleAddFromElement = (newElement: Element) => {
    newElement.weight = 100;
    onUpdate({ ...element, fromChildren: [...element.fromChildren, newElement] });
  };

  const handleAddToElement = (newElement: Element) => {
    newElement.weight = 100;
    onUpdate({ ...element, toChildren: [...element.toChildren, newElement] });
  };

  const updateFromChild = (id: string, updated: Element) => {
    onUpdate({
      ...element,
      fromChildren: element.fromChildren.map((child) => (child.id === id ? updated : child)),
    });
  };

  const deleteFromChild = (id: string) => {
    onUpdate({
      ...element,
      fromChildren: element.fromChildren.filter((child) => child.id !== id),
    });
  };

  const updateToChild = (id: string, updated: Element) => {
    onUpdate({
      ...element,
      toChildren: element.toChildren.map((child) => (child.id === id ? updated : child)),
    });
  };

  const deleteToChild = (id: string) => {
    onUpdate({
      ...element,
      toChildren: element.toChildren.filter((child) => child.id !== id),
    });
  };

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

  const bgColor = depth % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.02)";

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div
        onClick={() => {
          if (showFromDropdown) {
            setShowFromDropdown(false);
          }
          if (showToDropdown) {
            setShowToDropdown(false);
          }
        }}
        style={{
          position: "relative",
          backgroundColor: bgColor,
          marginBottom: "8px",
          paddingLeft: depth > 0 ? "24px" : "0px",
          overflow: "visible",
        }}
      >
        <div
          className="w-full hover:bg-gray-50 transition-colors"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            padding: "8px",
            paddingLeft: showWeight ? "80px" : "8px",
            minHeight: "auto",
            lineHeight: "1.3",
            gap: "8px",
            overflow: "visible",
          }}
        >
          {depth > 0 && (
            <div
              style={{
                position: "absolute",
                left: "-24px",
                top: "50%",
                width: "24px",
                height: "1px",
                backgroundColor: "#d1d5db",
              }}
            />
          )}
          {depth > 0 && (
            <div
              style={{
                position: "absolute",
                left: "-24px",
                top: "-8px",
                bottom: "50%",
                width: "1px",
                backgroundColor: "#d1d5db",
              }}
            />
          )}

          {showWeight && (
            <div
              style={{
                position: "absolute",
                left: "0",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                paddingLeft: "8px",
              }}
            >
              <input
                type="number"
                value={element.weight}
                onChange={(e) => onUpdate({ ...element, weight: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
                style={{
                  border: "1px solid #d1d5db",
                  outline: "none",
                  padding: "4px 6px",
                  background: "#fff",
                  fontSize: "13px",
                  color: "#111827",
                  width: "50px",
                  flexShrink: 0,
                  borderRadius: "4px",
                  MozAppearance: "textfield",
                  WebkitAppearance: "none",
                  appearance: "textfield",
                }}
                className="focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>%</span>
            </div>
          )}

          <motion.div
            onClick={() => setIsOpen(!isOpen)}
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-gray-600 flex-shrink-0 cursor-pointer"
            style={{ fontSize: "12px" }}
          >
            ▶
          </motion.div>

          <input
            type="text"
            value={element.name}
            onChange={(e) => onUpdate({ ...element, name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: "1px solid #d1d5db",
              outline: "none",
              padding: "4px 8px",
              background: "#fff",
              fontSize: "13px",
              fontWeight: "500",
              color: element.name ? "#111827" : "#9ca3af",
              width: `${Math.max((element.name.length || 5) * 8 + 20, 80)}px`,
              minWidth: "80px",
              flexShrink: 0,
              borderRadius: "4px",
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="Scale name"
          />

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>Blend</span>

          <select
            value={config.indicator}
            onChange={(e) => handleIndicatorChange(e.target.value as IndicatorName)}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: indicatorHasError ? "2px solid #ef4444" : "1px solid #d1d5db",
              outline: "none",
              padding: "4px 8px",
              background: indicatorHasError ? "#fee2e2" : "#fff",
              fontSize: "13px",
              color: "#111827",
              borderRadius: "4px",
              cursor: "pointer",
              width: indicatorSelectWidth,
            }}
            className="focus:ring-2 focus:ring-blue-500"
          >
            {indicatorOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <IndicatorParams
            indicator={config.indicator as IndicatorName}
            params={config.params || {}}
            onUpdate={handleParamsChange}
            conditionIndex={0}
            elementId={element.id}
            validationErrors={validationErrors}
            variableLists={variableLists}
            variablesLoading={variablesLoading}
          />

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>of</span>

          <input
            ref={tickerInputRef}
            type="text"
            value={config.ticker}
            onChange={(e) => updateConfig({ ticker: e.target.value.toUpperCase() })}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (tickerHasUndefinedVar) {
                setShowTickerPopover(true);
              }
            }}
            style={{
              border: tickerHasVisualError ? "2px solid #ef4444" : "1px solid #d1d5db",
              outline: "none",
              padding: "4px 8px",
              background: tickerHasVisualError ? "#fee2e2" : "#fff",
              fontSize: "13px",
              color: tickerHasVisualError ? "#b91c1c" : config.ticker ? "#111827" : "#9ca3af",
              width: `${Math.max((config.ticker || "Ticker").length * 9 + 20, 80)}px`,
              maxWidth: "300px",
              flexShrink: 0,
              borderRadius: "4px",
              cursor: tickerHasUndefinedVar ? "pointer" : "text",
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="Ticker"
            title={configTickerTooltip}
          />

          {showTickerPopover && tickerInputRef.current && (
            <VariablePopover
              variableName={config.ticker.startsWith("$") ? config.ticker.slice(1) : config.ticker}
              anchorEl={tickerInputRef.current}
              onSave={(values, type) => handleSaveVariable(config.ticker, values, type)}
              onClose={() => setShowTickerPopover(false)}
            />
          )}

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>from</span>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              ref={rangeMinInputRef}
              type="text"
              value={config.rangeMin}
              onChange={(e) => updateConfig({ rangeMin: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (rangeMinHasUndefinedVar) {
                  setShowRangeMinPopover(true);
                }
              }}
              style={{
                border: (rangeMinHasError || rangeMinHasUndefinedVar) ? "2px solid #ef4444" : "1px solid #d1d5db",
                outline: "none",
                padding: "4px 6px",
                background: (rangeMinHasError || rangeMinHasUndefinedVar) ? "#fee2e2" : "#fff",
                fontSize: "13px",
                color: config.rangeMin ? "#111827" : "#9ca3af",
                width: "80px",
                borderRadius: "4px",
                cursor: rangeMinHasUndefinedVar ? "pointer" : "text",
              }}
              className="focus:ring-2 focus:ring-blue-500"
              placeholder={unitSuffix ? `0${unitSuffix}` : "0"}
              title={rangeMinHasUndefinedVar ? `Variable ${config.rangeMin} is not defined. Double-click to define.` : undefined}
            />
            {unitSuffix && <span style={{ fontSize: "13px", color: "#6b7280" }}>{unitSuffix}</span>}
          </div>

          {showRangeMinPopover && rangeMinInputRef.current && (
            <VariablePopover
              variableName={config.rangeMin.startsWith("$") ? config.rangeMin.slice(1) : config.rangeMin}
              anchorEl={rangeMinInputRef.current}
              onSave={(values, type) => handleSaveVariable(config.rangeMin, values, type)}
              onClose={() => setShowRangeMinPopover(false)}
            />
          )}

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>to</span>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              ref={rangeMaxInputRef}
              type="text"
              value={config.rangeMax}
              onChange={(e) => updateConfig({ rangeMax: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (rangeMaxHasUndefinedVar) {
                  setShowRangeMaxPopover(true);
                }
              }}
              style={{
                border: (rangeMaxHasError || rangeMaxHasUndefinedVar) ? "2px solid #ef4444" : "1px solid #d1d5db",
                outline: "none",
                padding: "4px 6px",
                background: (rangeMaxHasError || rangeMaxHasUndefinedVar) ? "#fee2e2" : "#fff",
                fontSize: "13px",
                color: config.rangeMax ? "#111827" : "#9ca3af",
                width: "80px",
                borderRadius: "4px",
                cursor: rangeMaxHasUndefinedVar ? "pointer" : "text",
              }}
              className="focus:ring-2 focus:ring-blue-500"
              placeholder={unitSuffix ? `0${unitSuffix}` : "0"}
              title={rangeMaxHasUndefinedVar ? `Variable ${config.rangeMax} is not defined. Double-click to define.` : undefined}
            />
            {unitSuffix && <span style={{ fontSize: "13px", color: "#6b7280" }}>{unitSuffix}</span>}
          </div>

          {showRangeMaxPopover && rangeMaxInputRef.current && (
            <VariablePopover
              variableName={config.rangeMax.startsWith("$") ? config.rangeMax.slice(1) : config.rangeMax}
              anchorEl={rangeMaxInputRef.current}
              onSave={(values, type) => handleSaveVariable(config.rangeMax, values, type)}
              onClose={() => setShowRangeMaxPopover(false)}
            />
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: "4px", flexShrink: 0 }}>
            {onCopy && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  color: "#3b82f6",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="Copy"
              >
                <Copy size={14} />
              </button>
            )}
            <button
              onClick={onDelete}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                color: "#dc2626",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>

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
                <div style={{ paddingTop: "8px", paddingBottom: "8px" }}>
                  {/* FROM branch */}
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        marginBottom: "8px",
                        paddingLeft: "56px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          color: fromBranchHasError ? "#dc2626" : "#2563eb",
                          fontSize: "13px",
                          fontWeight: "500",
                          flexShrink: 0,
                        }}
                      >
                        From
                      </span>
                      {fromBranchHasError && (
                        <span style={{ fontSize: "12px", color: "#dc2626" }}>Add at least one element</span>
                      )}
                    </div>
                    <div style={{ position: "relative", paddingLeft: "24px" }}>
                      {element.fromChildren.map((child) => {
                        if (child.type === "gate") {
                          return (
                            <GateCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateFromChild(child.id, updated)}
                              onDelete={() => deleteFromChild(child.id)}
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
                        if (child.type === "ticker") {
                          return (
                            <TickerCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateFromChild(child.id, updated)}
                              onDelete={() => deleteFromChild(child.id)}
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
                        }
                        if (child.type === "weight") {
                          return (
                            <WeightCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateFromChild(child.id, updated)}
                              onDelete={() => deleteFromChild(child.id)}
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
                        if (child.type === "scale") {
                          return (
                            <ScaleCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateFromChild(child.id, updated)}
                              onDelete={() => deleteFromChild(child.id)}
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
                        if (child.type === "sort") {
                          return (
                            <SortCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateFromChild(child.id, updated)}
                              onDelete={() => deleteFromChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                              depth={depth + 1}
                              showWeight={false}
                              validationErrors={validationErrors}
                              variableLists={variableLists}
                          variablesLoading={variablesLoading}
                              tickerMetadata={tickerMetadata}
                              metadataLoading={metadataLoading}
                              metadataError={metadataError}
                              allElements={allElements}
                            />
                          );
                        }
                        return null;
                      })}

                      {element.fromChildren.length === 0 && (
                        <div
                          style={{
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "8px",
                            marginBottom: "8px",
                            padding: "8px",
                            paddingLeft: "32px",
                            backgroundColor: "transparent",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "0",
                              top: "50%",
                              width: "24px",
                              height: "1px",
                              backgroundColor: "#d1d5db",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: "0",
                              top: "0",
                              bottom: "50%",
                              width: "1px",
                              backgroundColor: "#d1d5db",
                            }}
                          />
                          {!showFromDropdown ? (
                            <button
                              onClick={() => setShowFromDropdown(true)}
                              style={{
                                fontSize: "14px",
                                color: fromBranchHasError ? "#dc2626" : "#2563eb",
                                background: fromBranchHasError ? "#fee2e2" : "#eff6ff",
                                border: `1px dashed ${fromBranchHasError ? "#dc2626" : "#2563eb"}`,
                                cursor: "pointer",
                                padding: "4px 12px",
                                borderRadius: "4px",
                                fontWeight: "500",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = fromBranchHasError ? "#fecaca" : "#dbeafe")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = fromBranchHasError ? "#fee2e2" : "#eff6ff")}
                            >
                              + Add
                            </button>
                          ) : (
                            <AddElementDropdown
                              isOpen={showFromDropdown}
                              onClose={() => setShowFromDropdown(false)}
                              onAddElement={handleAddFromElement}
                              allElements={allElements}
                              clipboard={clipboard}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* TO branch */}
                  <div>
                    <div
                      style={{
                        marginBottom: "8px",
                        paddingLeft: "56px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          color: toBranchHasError ? "#dc2626" : "#c026d3",
                          fontSize: "13px",
                          fontWeight: "500",
                          flexShrink: 0,
                        }}
                      >
                        To
                      </span>
                      {toBranchHasError && (
                        <span style={{ fontSize: "12px", color: "#dc2626" }}>Add at least one element</span>
                      )}
                    </div>
                    <div style={{ position: "relative", paddingLeft: "24px" }}>
                      {element.toChildren.map((child) => {
                        if (child.type === "gate") {
                          return (
                            <GateCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateToChild(child.id, updated)}
                              onDelete={() => deleteToChild(child.id)}
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
                        if (child.type === "ticker") {
                          return (
                            <TickerCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateToChild(child.id, updated)}
                              onDelete={() => deleteToChild(child.id)}
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
                        }
                        if (child.type === "weight") {
                          return (
                            <WeightCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateToChild(child.id, updated)}
                              onDelete={() => deleteToChild(child.id)}
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
                        if (child.type === "scale") {
                          return (
                            <ScaleCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateToChild(child.id, updated)}
                              onDelete={() => deleteToChild(child.id)}
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
                        if (child.type === "sort") {
                          return (
                            <SortCard
                              key={child.id}
                              element={child}
                              onUpdate={(updated) => updateToChild(child.id, updated)}
                              onDelete={() => deleteToChild(child.id)}
                              onCopy={onCopy}
                              clipboard={clipboard}
                              depth={depth + 1}
                              showWeight={false}
                              validationErrors={validationErrors}
                              variableLists={variableLists}
                          variablesLoading={variablesLoading}
                              tickerMetadata={tickerMetadata}
                              metadataLoading={metadataLoading}
                              metadataError={metadataError}
                              allElements={allElements}
                            />
                          );
                        }
                        return null;
                      })}

                      {element.toChildren.length === 0 && (
                        <div
                          style={{
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "8px",
                            marginBottom: "8px",
                            padding: "8px",
                            paddingLeft: "32px",
                            backgroundColor: "transparent",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "0",
                              top: "50%",
                              width: "24px",
                              height: "1px",
                              backgroundColor: "#d1d5db",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: "0",
                              top: "0",
                              bottom: "50%",
                              width: "1px",
                              backgroundColor: "#d1d5db",
                            }}
                          />
                          {!showToDropdown ? (
                            <button
                              onClick={() => setShowToDropdown(true)}
                              style={{
                                fontSize: "14px",
                                color: toBranchHasError ? "#dc2626" : "#c026d3",
                                background: toBranchHasError ? "#fee2e2" : "#f5f3ff",
                                border: `1px dashed ${toBranchHasError ? "#dc2626" : "#c026d3"}`,
                                cursor: "pointer",
                                padding: "4px 12px",
                                borderRadius: "4px",
                                fontWeight: "500",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = toBranchHasError ? "#fecaca" : "#ede9fe")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = toBranchHasError ? "#fee2e2" : "#f5f3ff")}
                            >
                              + Add
                            </button>
                          ) : (
                            <AddElementDropdown
                              isOpen={showToDropdown}
                              onClose={() => setShowToDropdown(false)}
                              onAddElement={handleAddToElement}
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

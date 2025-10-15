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

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion, AnimatePresence } from "framer-motion";
import { Copy } from "lucide-react";
import type { IndicatorName } from "../../types/indicators";
import {
  indicatorOptions,
  keysForIndicator,
  PARAM_LABELS,
  getEffectiveParams,
  defaultParams,
  paramsToPeriodString,
} from "../../types/indicators";
import type {
  Element,
  TickerElement,
  WeightElement,
  SortElement,
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
import { ScaleCard } from "./ScaleCard";
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

// ========== SORT CARD ==========

export interface SortCardProps {
  element: SortElement;
  onUpdate: (updated: SortElement) => void;
  onDelete: () => void;
  onCopy?: () => void;
  clipboard?: Element | null;
  depth?: number;
  showWeight?: boolean;
  validationErrors?: ValidationError[];
  variableLists?: Array<{ name: string }>;
  variablesLoading?: boolean;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  allElements?: Element[];
  onVariableCreated?: () => void;
}

export function SortCard({
  element,
  onUpdate,
  onDelete,
  onCopy,
  clipboard,
  depth = 0,
  showWeight = false,
  validationErrors = [],
  variableLists = [],
  variablesLoading = false,
  tickerMetadata,
  metadataLoading,
  metadataError,
  allElements = [],
  onVariableCreated,
}: SortCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const bgColor = depth % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.02)";

  const indicatorLabel = (element.indicator || "").replace(/_/g, " ");
  const indicatorSelectWidth = `${Math.max(indicatorLabel.length * 9 + 30, 120)}px`;

  const indicatorHasError = hasFieldError(element.id, "indicator", validationErrors);
  const countHasError = hasFieldError(element.id, "count", validationErrors);
  const childrenHaveError = hasFieldError(element.id, "children", validationErrors);

  const handleIndicatorChange = (next: IndicatorName) => {
    const params = { ...defaultParams(next) };
    onUpdate({
      ...element,
      indicator: next,
      params,
      period: paramsToPeriodString(next, params),
    });
  };

  const handleParamsChange = (params: Record<string, string>) => {
    onUpdate({
      ...element,
      params,
      period: paramsToPeriodString(element.indicator as IndicatorName, params),
    });
  };

  const handleAddElement = (newElement: Element) => {
    const currentSum = element.children.reduce((sum, child) => sum + (child.weight ?? 0), 0);
    const defaultWeight = element.children.length === 0 ? 100 : Math.max(0, 100 - currentSum);
    newElement.weight = defaultWeight || 100;
    onUpdate({ ...element, children: [...element.children, newElement] });
  };

  const updateChild = (id: string, updated: Element) => {
    onUpdate({
      ...element,
      children: element.children.map((child) => (child.id === id ? updated : child)),
    });
  };

  const deleteChild = (id: string) => {
    onUpdate({
      ...element,
      children: element.children.filter((child) => child.id !== id),
    });
  };

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div
        style={{
          position: "relative",
          marginBottom: "8px",
          padding: "8px",
          paddingLeft: depth > 0 ? (showWeight ? "104px" : "32px") : showWeight ? "80px" : "8px",
          backgroundColor: bgColor,
        }}
      >
        {depth > 0 && (
          <>
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
                top: "-8px",
                bottom: "50%",
                width: "1px",
                backgroundColor: "#d1d5db",
              }}
            />
          </>
        )}

        {showWeight && (
          <div
            style={{
              position: "absolute",
              left: depth > 0 ? "24px" : "0",
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
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
            style={{
              border: "1px solid #d1d5db",
              outline: "none",
              padding: "4px 8px",
              background: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              color: element.name ? "#111827" : "#9ca3af",
              width: `${Math.max((element.name?.length || 0) * 8 + 30, 80)}px`,
              borderRadius: "4px",
              flexShrink: 0,
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="Sort name"
          />

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>Select</span>

          <select
            value={element.direction}
            onChange={(e) => onUpdate({ ...element, direction: e.target.value as "top" | "bottom" })}
            style={{
              border: "1px solid #d1d5db",
              outline: "none",
              padding: "4px 8px",
              background: "#fff",
              fontSize: "13px",
              color: "#111827",
              borderRadius: "4px",
              cursor: "pointer",
              width: "auto",
              flexShrink: 0,
            }}
            className="focus:ring-2 focus:ring-blue-500"
          >
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>

          <input
            type="number"
            value={element.count}
            onChange={(e) => onUpdate({ ...element, count: Number(e.target.value) })}
            style={{
              border: countHasError ? "2px solid #ef4444" : "1px solid #d1d5db",
              outline: "none",
              padding: "4px 8px",
              background: countHasError ? "#fee2e2" : "#fff",
              fontSize: "13px",
              color: "#111827",
              width: "50px",
              borderRadius: "4px",
              flexShrink: 0,
            }}
            className="focus:ring-2 focus:ring-blue-500"
            min={1}
          />

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>by</span>

          <select
            value={element.indicator}
            onChange={(e) => handleIndicatorChange(e.target.value as IndicatorName)}
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
              flexShrink: 0,
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
            indicator={element.indicator as IndicatorName}
            params={element.params || {}}
            onUpdate={handleParamsChange}
            conditionIndex={0}
            elementId={element.id}
            validationErrors={validationErrors}
            variableLists={variableLists}
            variablesLoading={variablesLoading}
            inline
          />

          <div style={{ flexGrow: 1 }} />

          <div style={{ display: "flex", gap: "4px" }}>
            {onCopy && (
              <button
                onClick={onCopy}
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
                <div style={{ paddingLeft: "24px", paddingTop: "8px", paddingBottom: "8px" }}>
                  {childrenHaveError && (
                    <div style={{ color: "#dc2626", fontSize: "12px", marginBottom: "8px" }}>
                      Add at least one branch to rank.
                    </div>
                  )}

                  {element.children.map((child) => {
                    if (child.type === "gate") {
                      return (
                        <GateCard
                          key={child.id}
                          element={child}
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
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
                          onVariableCreated={onVariableCreated}
                        />
                      );
                    }
                    if (child.type === "ticker") {
                      return (
                        <TickerCard
                          key={child.id}
                          element={child}
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          depth={depth + 1}
                          showWeight={false}
                          validationErrors={validationErrors}
                          variableLists={variableLists}
                          variablesLoading={variablesLoading}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                          onVariableCreated={onVariableCreated}
                        />
                      );
                    }
                    if (child.type === "weight") {
                      return (
                        <WeightCard
                          key={child.id}
                          element={child}
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          clipboard={clipboard}
                          depth={depth + 1}
                          showWeight={true}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
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
                          onVariableCreated={onVariableCreated}
                        />
                      );
                    }
                    if (child.type === "sort") {
                      return (
                        <SortCard
                          key={child.id}
                          element={child}
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
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
                        height: "2px",
                        backgroundColor: "#d1d5db",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: "0",
                        top: "-8px",
                        bottom: "50%",
                        width: "2px",
                        backgroundColor: "#d1d5db",
                      }}
                    />

                    {!showDropdown ? (
                      <button
                        onClick={() => setShowDropdown(true)}
                        style={{
                          fontSize: "14px",
                          color: "#3b82f6",
                          background: "#eff6ff",
                          border: "1px dashed #3b82f6",
                          cursor: "pointer",
                          padding: "4px 12px",
                          borderRadius: "4px",
                          fontWeight: "500",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#dbeafe")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#eff6ff")}
                      >
                        + Add
                      </button>
                    ) : (
                      <AddElementDropdown
                        isOpen={showDropdown}
                        onClose={() => setShowDropdown(false)}
                        onAddElement={handleAddElement}
                        allElements={allElements}
                        clipboard={clipboard}
                      />
                    )}
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

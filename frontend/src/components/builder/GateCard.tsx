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

// ========== WEIGHT CARD ==========

export interface WeightCardProps {
  element: WeightElement;
  onUpdate: (updated: WeightElement) => void;
  onDelete: () => void;
  onCopy?: () => void;
  clipboard?: Element | null;
  depth?: number;
  showWeight?: boolean;
  isWeightInvalid?: boolean;
  allElements?: Element[]; // For counting gates
  validationErrors?: ValidationError[];
  definedVariables?: Set<string>;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
}

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

export function WeightCard({ element, onUpdate, onDelete, onCopy, clipboard, initiallyOpen = false, depth = 0, showWeight = false, isWeightInvalid = false, allElements = [], validationErrors = [], definedVariables = new Set<string>(), tickerMetadata, metadataLoading, metadataError }: WeightCardProps & { initiallyOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [showDropdown, setShowDropdown] = useState(false);
  const [tickerInput, setTickerInput] = useState("");

  // Calculate if children weights add up to 100%
  const childrenWeightSum = element.children.reduce((sum, child) => sum + child.weight, 0);
  const areChildWeightsInvalid = element.weightMode === "defined" && element.children.length > 0 && childrenWeightSum !== 100;

  const handleSelectType = (type: "weight" | "gate" | "scale" | "sort") => {
    setShowDropdown(false);
    setTickerInput("");

    // Calculate default weight for new child
    const currentSum = element.children.reduce((sum, child) => sum + child.weight, 0);
    const defaultWeight = element.weightMode === "defined" ? Math.max(0, 100 - currentSum) : 100;

    if (type === "gate") {
      const gateCount = allElements ? countGatesInTree(allElements) : 0;
      const gateName = `Gate${gateCount + 1}`;

      const newGate: GateElement = {
        id: `gate-${Date.now()}`,
        type: "gate",
        name: gateName,
        weight: defaultWeight,
        conditionMode: "if",
        conditions: [{
          ticker: "",
          indicator: "RSI",
          period: "",
          operator: "gt",
          compareTo: "indicator",
          threshold: "",
          rightTicker: "",
          rightIndicator: "RSI",
          rightPeriod: "",
        }],
        thenChildren: [],
        elseChildren: [],
      };
      onUpdate({ ...element, children: [...element.children, newGate] });
    } else if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: defaultWeight,
        weightMode: "equal",
        children: [],
      };
      onUpdate({ ...element, children: [...element.children, newWeight] });
    } else if (type === "scale") {
      const newScale = createDefaultScaleElement(defaultWeight, allElements);
      onUpdate({ ...element, children: [...element.children, newScale] });
    } else if (type === "sort") {
      const newSort = createDefaultSortElement(defaultWeight, allElements);
      onUpdate({ ...element, children: [...element.children, newSort] });
    }
  };

  const handleTickerSubmit = () => {
    if (tickerInput.trim()) {
      // Calculate default weight for new ticker
      const currentSum = element.children.reduce((sum, child) => sum + child.weight, 0);
      const defaultWeight = element.weightMode === "defined" ? Math.max(0, 100 - currentSum) : 100;

      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: tickerInput.trim().toUpperCase(),
        weight: defaultWeight,
      };
      onUpdate({ ...element, children: [...element.children, newTicker] });
      setShowDropdown(false);
      setTickerInput("");
    }
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

  // Zebra striping: even depths get light gray background
  const bgColor = depth % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)';

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div
        onClick={(e) => {
          // Close dropdowns when clicking anywhere on the card
          if (showDropdown) {
            setShowDropdown(false);
            setTickerInput("");
          }
        }}
        style={{
          position: 'relative',
          backgroundColor: bgColor,
          marginBottom: '8px',
          paddingLeft: depth > 0 ? '24px' : '0px',
          overflow: 'visible'
        }}>
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
            className="text-blue-600 flex-shrink-0 cursor-pointer"
            style={{ fontSize: '12px' }}
          >
            ▶
          </motion.div>

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
              width: `${Math.max((element.name.length || 6), 6) * 8 + 20}px`,
              minWidth: '80px',
              flexShrink: 0,
              borderRadius: '4px',
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="WEIGHT"
          />

          <select
            value={element.weightMode}
            onChange={(e) => {
              const newMode = e.target.value as "equal" | "defined";

              // If switching to DEFINED, distribute weights equally
              if (newMode === "defined" && element.weightMode === "equal" && element.children.length > 0) {
                const baseWeight = Math.floor(100 / element.children.length);
                const remainder = 100 - (baseWeight * element.children.length);

                const updatedChildren = element.children.map((child, index) => ({
                  ...child,
                  weight: index === element.children.length - 1 ? baseWeight + remainder : baseWeight
                }));

                onUpdate({ ...element, weightMode: newMode, children: updatedChildren });
              } else {
                onUpdate({ ...element, weightMode: newMode });
              }
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
              width: 'fit-content',
              minWidth: '0',
            }}
            className="focus:ring-2 focus:ring-blue-500"
          >
            <option value="equal">EQUAL</option>
            <option value="defined">DEFINED</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
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
                <div style={{ paddingLeft: '24px', paddingTop: '8px', paddingBottom: '8px' }}>
                  {/* Render children */}
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
                          showWeight={element.weightMode === "defined"}
                          isWeightInvalid={areChildWeightsInvalid}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          depth={depth + 1}
                          showWeight={element.weightMode === "defined"}
                          isWeightInvalid={areChildWeightsInvalid}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          clipboard={clipboard}
                          depth={depth + 1}
                          showWeight={element.weightMode === "defined"}
                          isWeightInvalid={areChildWeightsInvalid}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          showWeight={element.weightMode === "defined"}
                          allElements={allElements}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          clipboard={clipboard}
                          depth={depth + 1}
                          showWeight={element.weightMode === "defined"}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
                          tickerMetadata={tickerMetadata}
                          metadataLoading={metadataLoading}
                          metadataError={metadataError}
                          allElements={allElements}
                        />
                      );
                    }
                    return null;
                  })}

                  {/* + button */}
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
                      height: '2px',
                      backgroundColor: '#d1d5db',
                    }} />
                    <div style={{
                      position: 'absolute',
                      left: '0',
                      top: '-8px',
                      bottom: '50%',
                      width: '2px',
                      backgroundColor: '#d1d5db',
                    }} />
                    {!showDropdown ? (
                      <button
                        onClick={() => setShowDropdown(true)}
                        style={{
                          fontSize: '14px',
                          color: '#3b82f6',
                          background: '#eff6ff',
                          border: '1px dashed #3b82f6',
                          cursor: 'pointer',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontWeight: '500',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#dbeafe'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#eff6ff'}
                      >
                        + Add
                      </button>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          padding: '8px',
                          background: '#fff',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        }}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={tickerInput}
                          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTickerSubmit();
                            } else if (e.key === 'Escape') {
                              setShowDropdown(false);
                              setTickerInput("");
                            }
                          }}
                          placeholder="Enter ticker..."
                          style={{
                            fontSize: '13px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            outline: 'none',
                          }}
                        />
                        <button
                          onClick={() => handleSelectType("weight")}
                          style={{
                            fontSize: '13px',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          Weight
                        </button>
                        <button
                          onClick={() => handleSelectType("sort")}
                          style={{
                            fontSize: '13px',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          Sort
                        </button>
                        <button
                          onClick={() => handleSelectType("gate")}
                          style={{
                            fontSize: '13px',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          Gate
                        </button>
                        <button
                          onClick={() => handleSelectType("scale")}
                          style={{
                            fontSize: '13px',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          Scale
                        </button>
                        {clipboard && (
                          <button
                            onClick={() => {
                              const cloned = deepCloneElement(clipboard);
                              const currentSum = element.children.reduce((sum, child) => sum + child.weight, 0);
                              const defaultWeight = element.weightMode === "defined" ? Math.max(0, 100 - currentSum) : 100;
                              cloned.weight = defaultWeight;
                              onUpdate({ ...element, children: [...element.children, cloned] });
                              setShowDropdown(false);
                              setTickerInput("");
                            }}
                            style={{
                              fontSize: '13px',
                              padding: '4px 8px',
                              background: 'transparent',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              borderRadius: '4px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <Copy size={14} /> Paste
                          </button>
                        )}
                      </div>
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
  definedVariables?: Set<string>;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  allElements?: Element[];
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
  definedVariables = new Set<string>(),
  tickerMetadata,
  metadataLoading,
  metadataError,
  allElements = [],
}: SortCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [tickerInput, setTickerInput] = useState("");

  const bgColor = depth % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.02)";

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

  const handleSelectType = (type: "ticker" | "weight" | "gate" | "scale" | "sort") => {
    setShowDropdown(false);
    setTickerInput("");

    const currentSum = element.children.reduce((sum, child) => sum + (child.weight ?? 0), 0);
    const defaultWeight = element.children.length === 0 ? 100 : Math.max(0, 100 - currentSum);

    if (type === "ticker") {
      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: "",
        weight: defaultWeight || 100,
      };
      onUpdate({ ...element, children: [...element.children, newTicker] });
      return;
    }

    if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: defaultWeight || 100,
        weightMode: "equal",
        children: [],
      };
      onUpdate({ ...element, children: [...element.children, newWeight] });
      return;
    }

    if (type === "gate") {
      const gateCount = allElements ? countGatesInTree(allElements) : 0;
      const newGate: GateElement = {
        id: `gate-${Date.now()}`,
        type: "gate",
        name: `Gate${gateCount + 1}`,
        weight: defaultWeight || 100,
        conditionMode: "if",
        conditions: [
          {
            ticker: "",
            indicator: "RSI",
            period: "",
            operator: "gt",
            compareTo: "indicator",
            threshold: "",
            rightTicker: "",
            rightIndicator: "RSI",
            rightPeriod: "",
          },
        ],
        thenChildren: [],
        elseChildren: [],
      };
      onUpdate({ ...element, children: [...element.children, newGate] });
      return;
    }

    if (type === "scale") {
      const newScale = createDefaultScaleElement(defaultWeight || 100, allElements);
      onUpdate({ ...element, children: [...element.children, newScale] });
      return;
    }

    if (type === "sort") {
      const newSort = createDefaultSortElement(defaultWeight || 100, allElements);
      onUpdate({ ...element, children: [...element.children, newSort] });
    }
  };

  const handleTickerSubmit = () => {
    if (!tickerInput.trim()) return;
    const currentSum = element.children.reduce((sum, child) => sum + (child.weight ?? 0), 0);
    const defaultWeight = element.children.length === 0 ? 100 : Math.max(0, 100 - currentSum);
    const newTicker: TickerElement = {
      id: `ticker-${Date.now()}`,
      type: "ticker",
      ticker: tickerInput.trim().toUpperCase(),
      weight: defaultWeight || 100,
    };
    onUpdate({ ...element, children: [...element.children, newTicker] });
    setShowDropdown(false);
    setTickerInput("");
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
              minWidth: "120px",
              width: "auto",
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

          <IndicatorParams
            indicator={element.indicator as IndicatorName}
            params={element.params || {}}
            onUpdate={handleParamsChange}
            conditionIndex={0}
            elementId={element.id}
            validationErrors={validationErrors}
            definedVariables={definedVariables}
            inline
          />
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
                          showWeight
                          allElements={allElements}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          depth={depth + 1}
                          showWeight
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          clipboard={clipboard}
                          depth={depth + 1}
                          showWeight
                          allElements={allElements}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          showWeight
                          allElements={allElements}
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                          onUpdate={(updated) => updateChild(child.id, updated)}
                          onDelete={() => deleteChild(child.id)}
                          onCopy={onCopy}
                          clipboard={clipboard}
                          depth={depth + 1}
                          showWeight
                          validationErrors={validationErrors}
                          definedVariables={definedVariables}
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
                              setShowDropdown(false);
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
                            onClick={() => {
                              const cloned = deepCloneElement(clipboard);
                              const currentSum = element.children.reduce((sum, child) => sum + (child.weight ?? 0), 0);
                              const defaultWeight = element.children.length === 0 ? 100 : Math.max(0, 100 - currentSum);
                              (cloned as any).weight = defaultWeight || 100;
                              onUpdate({ ...element, children: [...element.children, cloned as Element] });
                              setShowDropdown(false);
                              setTickerInput("");
                            }}
                            style={{
                              fontSize: "13px",
                              padding: "4px 8px",
                              background: "transparent",
                              border: "none",
                              textAlign: "left",
                              cursor: "pointer",
                              borderRadius: "4px",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <Copy size={14} /> Paste
                          </button>
                        )}
                      </div>
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
  definedVariables?: Set<string>;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
}

export function ScaleCard({ element, onUpdate, onDelete, onCopy, clipboard, depth = 0, showWeight = false, allElements = [], validationErrors = [], definedVariables = new Set<string>(), tickerMetadata, metadataLoading, metadataError }: ScaleCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [fromTickerInput, setFromTickerInput] = useState("");
  const [toTickerInput, setToTickerInput] = useState("");

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

  const tickerHasUndefinedVar = hasUndefinedVariableInField(config.ticker, definedVariables);
  const rangeMinHasUndefinedVar = hasUndefinedVariableInField(config.rangeMin, definedVariables);
  const rangeMaxHasUndefinedVar = hasUndefinedVariableInField(config.rangeMax, definedVariables);

  const tickerHasError = hasFieldError(element.id, "ticker", validationErrors);
  const indicatorHasError = hasFieldError(element.id, "indicator", validationErrors);
  const rangeMinHasError = hasFieldError(element.id, "rangeMin", validationErrors) || hasFieldError(element.id, "range", validationErrors);
  const rangeMaxHasError = hasFieldError(element.id, "rangeMax", validationErrors) || hasFieldError(element.id, "range", validationErrors);
  const fromBranchHasError = hasFieldError(element.id, "fromChildren", validationErrors);
  const toBranchHasError = hasFieldError(element.id, "toChildren", validationErrors);
  const configTickerSymbol = config.ticker?.toUpperCase() ?? "";
  const metadataReady = !!tickerMetadata && !metadataLoading && !metadataError;
  const configTickerMetadata = configTickerSymbol && tickerMetadata ? tickerMetadata.get(configTickerSymbol) : undefined;
  const configTickerUnknown =
    metadataReady &&
    configTickerSymbol.length > 0 &&
    !tickerHasUndefinedVar &&
    !tickerMetadata?.has(configTickerSymbol);
  const configTickerTooltip = tickerHasUndefinedVar
    ? `Variable ${config.ticker} is not defined in Variables tab`
    : configTickerUnknown
      ? `${configTickerSymbol} not found in Alpaca asset list`
      : (configTickerMetadata?.name?.trim() || undefined);
  const tickerHasVisualError = tickerHasError || tickerHasUndefinedVar || configTickerUnknown;

  const indicatorLabel = (config.indicator || "").replace(/_/g, " ");
  const indicatorSelectWidth = `${Math.max(indicatorLabel.length + 3, 10)}ch`;

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

  const addChildToBranch = (branch: "from" | "to", child: Element) => {
    if (branch === "from") {
      onUpdate({ ...element, fromChildren: [...element.fromChildren, child] });
    } else {
      onUpdate({ ...element, toChildren: [...element.toChildren, child] });
    }
  };

  const handleBranchSelectType = (branch: "from" | "to", type: "weight" | "gate" | "scale" | "sort") => {
    if (branch === "from") {
      setShowFromDropdown(false);
      setFromTickerInput("");
    } else {
      setShowToDropdown(false);
      setToTickerInput("");
    }

    if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: 100,
        weightMode: "equal",
        children: [],
      };
      addChildToBranch(branch, newWeight);
    } else if (type === "gate") {
      const newGate = createDefaultGateElement(allElements);
      addChildToBranch(branch, newGate);
    } else if (type === "scale") {
      const newScale = createDefaultScaleElement(100, allElements);
      addChildToBranch(branch, newScale);
    } else if (type === "sort") {
      const newSort = createDefaultSortElement(100, allElements);
      addChildToBranch(branch, newSort);
    }
  };

  const handleTickerSubmit = (branch: "from" | "to") => {
    const inputValue = branch === "from" ? fromTickerInput : toTickerInput;
    if (!inputValue.trim()) return;

    const newTicker: TickerElement = {
      id: `ticker-${Date.now()}`,
      type: "ticker",
      ticker: inputValue.trim().toUpperCase(),
      weight: 100,
    };
    addChildToBranch(branch, newTicker);

    if (branch === "from") {
      setShowFromDropdown(false);
      setFromTickerInput("");
    } else {
      setShowToDropdown(false);
      setToTickerInput("");
    }
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

  const bgColor = depth % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.02)";

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div
        onClick={() => {
          if (showFromDropdown) {
            setShowFromDropdown(false);
            setFromTickerInput("");
          }
          if (showToDropdown) {
            setShowToDropdown(false);
            setToTickerInput("");
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
            definedVariables={definedVariables}
          />

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>of</span>

          <input
            type="text"
            value={config.ticker}
            onChange={(e) => updateConfig({ ticker: e.target.value.toUpperCase() })}
            onClick={(e) => e.stopPropagation()}
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
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="Ticker"
            title={configTickerTooltip}
          />

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>from</span>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="text"
              value={config.rangeMin}
              onChange={(e) => updateConfig({ rangeMin: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{
                border: (rangeMinHasError || rangeMinHasUndefinedVar) ? "2px solid #ef4444" : "1px solid #d1d5db",
                outline: "none",
                padding: "4px 6px",
                background: (rangeMinHasError || rangeMinHasUndefinedVar) ? "#fee2e2" : "#fff",
                fontSize: "13px",
                color: config.rangeMin ? "#111827" : "#9ca3af",
                width: "80px",
                borderRadius: "4px",
              }}
              className="focus:ring-2 focus:ring-blue-500"
              placeholder={unitSuffix ? `0${unitSuffix}` : "0"}
              title={rangeMinHasUndefinedVar ? `Variable ${config.rangeMin} is not defined` : undefined}
            />
            {unitSuffix && <span style={{ fontSize: "13px", color: "#6b7280" }}>{unitSuffix}</span>}
          </div>

          <span style={{ fontSize: "13px", color: "#6b7280", flexShrink: 0 }}>to</span>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="text"
              value={config.rangeMax}
              onChange={(e) => updateConfig({ rangeMax: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{
                border: (rangeMaxHasError || rangeMaxHasUndefinedVar) ? "2px solid #ef4444" : "1px solid #d1d5db",
                outline: "none",
                padding: "4px 6px",
                background: (rangeMaxHasError || rangeMaxHasUndefinedVar) ? "#fee2e2" : "#fff",
                fontSize: "13px",
                color: config.rangeMax ? "#111827" : "#9ca3af",
                width: "80px",
                borderRadius: "4px",
              }}
              className="focus:ring-2 focus:ring-blue-500"
              placeholder={unitSuffix ? `0${unitSuffix}` : "0"}
              title={rangeMaxHasUndefinedVar ? `Variable ${config.rangeMax} is not defined` : undefined}
            />
            {unitSuffix && <span style={{ fontSize: "13px", color: "#6b7280" }}>{unitSuffix}</span>}
          </div>

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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                                value={fromTickerInput}
                                onChange={(e) => setFromTickerInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleTickerSubmit("from");
                                  } else if (e.key === "Escape") {
                                    setShowFromDropdown(false);
                                    setFromTickerInput("");
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
                                onClick={() => handleBranchSelectType("from", "weight")}
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
                                onClick={() => handleBranchSelectType("from", "gate")}
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
                                onClick={() => handleBranchSelectType("from", "scale")}
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
                                onClick={() => handleBranchSelectType("to", "sort")}
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
                              <button
                                onClick={() => handleBranchSelectType("from", "sort")}
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
                                  onClick={() => {
                                    const cloned = deepCloneElement(clipboard);
                                    cloned.weight = 100;
                                    addChildToBranch("from", cloned);
                                    setShowFromDropdown(false);
                                    setFromTickerInput("");
                                  }}
                                  style={{
                                    fontSize: "13px",
                                    padding: "4px 8px",
                                    background: "transparent",
                                    border: "none",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    borderRadius: "4px",
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                  <Copy size={14} /> Paste
                                </button>
                              )}
                            </div>
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                                value={toTickerInput}
                                onChange={(e) => setToTickerInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleTickerSubmit("to");
                                  } else if (e.key === "Escape") {
                                    setShowToDropdown(false);
                                    setToTickerInput("");
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
                                onClick={() => handleBranchSelectType("to", "weight")}
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
                                onClick={() => handleBranchSelectType("to", "gate")}
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
                                onClick={() => handleBranchSelectType("to", "scale")}
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
                              {clipboard && (
                                <button
                                  onClick={() => {
                                    const cloned = deepCloneElement(clipboard);
                                    cloned.weight = 100;
                                    addChildToBranch("to", cloned);
                                    setShowToDropdown(false);
                                    setToTickerInput("");
                                  }}
                                  style={{
                                    fontSize: "13px",
                                    padding: "4px 8px",
                                    background: "transparent",
                                    border: "none",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    borderRadius: "4px",
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                  <Copy size={14} /> Paste
                                </button>
                              )}
                            </div>
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

// ========== INDICATOR PARAMS COMPONENT ==========

interface IndicatorParamsProps {
  indicator: IndicatorName;
  params: Record<string, string>;
  onUpdate: (params: Record<string, string>) => void;
  conditionIndex: number;
  elementId: string;
  validationErrors: ValidationError[];
  definedVariables: Set<string>;
  inline?: boolean;
}

function IndicatorParams({
  indicator,
  params,
  onUpdate,
  conditionIndex,
  elementId,
  validationErrors,
  definedVariables,
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
        const hasUndefinedVar = hasUndefinedVariableInField(value, definedVariables);
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
  definedVariables: Set<string>;
  inline?: boolean; // If true, render without background (for single-line IF mode)
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
}

function ConditionRow({
  condition,
  conditionIndex,
  onUpdate,
  onRemove,
  showRemove,
  elementId,
  validationErrors,
  definedVariables,
  inline = false,
  tickerMetadata,
  metadataLoading,
  metadataError,
}: ConditionRowProps) {
  // Check for undefined variables in this condition's fields
  const tickerHasUndefinedVar = hasUndefinedVariableInField(condition.ticker, definedVariables);
  const periodHasUndefinedVar = hasUndefinedVariableInField(condition.period, definedVariables);
  const thresholdHasUndefinedVar = hasUndefinedVariableInField(condition.threshold, definedVariables);
  const rightTickerHasUndefinedVar = hasUndefinedVariableInField(condition.rightTicker, definedVariables);
  const rightPeriodHasUndefinedVar = hasUndefinedVariableInField(condition.rightPeriod, definedVariables);
  const indicatorLabel = (condition.indicator || "").replace(/_/g, " ");
  const indicatorSelectWidth = `${Math.max(indicatorLabel.length + 3, 10)}ch`;
  const rightIndicatorLabel = ((condition.rightIndicator || "RSI") as string).replace(/_/g, " ");
  const rightIndicatorSelectWidth = `${Math.max(rightIndicatorLabel.length + 3, 10)}ch`;
  const conditionTickerSymbol = condition.ticker?.toUpperCase() ?? "";
  const metadataReady = !!tickerMetadata && !metadataLoading && !metadataError;
  const conditionTickerMetadata = conditionTickerSymbol && tickerMetadata ? tickerMetadata.get(conditionTickerSymbol) : undefined;
  const conditionTickerUnknown =
    metadataReady &&
    conditionTickerSymbol.length > 0 &&
    !tickerHasUndefinedVar &&
    !tickerMetadata?.has(conditionTickerSymbol);
  const conditionTickerTooltip = tickerHasUndefinedVar
    ? `Variable ${condition.ticker} is not defined in Variables tab`
    : conditionTickerUnknown
      ? `${conditionTickerSymbol} not found in Alpaca asset list`
      : (conditionTickerMetadata?.name?.trim() || undefined);
  const rightTickerSymbol = condition.rightTicker?.toUpperCase() ?? "";
  const rightTickerMetadata = rightTickerSymbol && tickerMetadata ? tickerMetadata.get(rightTickerSymbol) : undefined;
  const rightTickerUnknown =
    metadataReady &&
    rightTickerSymbol.length > 0 &&
    !rightTickerHasUndefinedVar &&
    !tickerMetadata?.has(rightTickerSymbol);
  const rightTickerTooltip = rightTickerHasUndefinedVar
    ? `Variable ${condition.rightTicker} is not defined in Variables tab`
    : rightTickerUnknown
      ? `${rightTickerSymbol} not found in Alpaca asset list`
      : (rightTickerMetadata?.name?.trim() || undefined);
  const leftTickerHasFieldError = hasFieldError(elementId, `conditions.${conditionIndex}.ticker`, validationErrors);
  const rightTickerHasFieldError = hasFieldError(elementId, `conditions.${conditionIndex}.rightTicker`, validationErrors);
  const leftTickerVisualError = leftTickerHasFieldError || tickerHasUndefinedVar || conditionTickerUnknown;
  const rightTickerVisualError = rightTickerHasFieldError || rightTickerHasUndefinedVar || rightTickerUnknown;

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
        definedVariables={definedVariables}
      />

      <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>of</span>

      <input
        type="text"
        value={condition.ticker}
        onChange={(e) => onUpdate({ ticker: e.target.value.toUpperCase() })}
        onClick={(e) => e.stopPropagation()}
        style={{
          border: leftTickerVisualError ? '2px solid #ef4444' : '1px solid #d1d5db',
          outline: 'none',
          padding: '4px 8px',
          background: leftTickerVisualError ? '#fee2e2' : '#fff',
          fontSize: '13px',
          color: leftTickerVisualError ? '#b91c1c' : condition.ticker ? '#111827' : '#9ca3af',
          width: `${Math.max((condition.ticker || 'Ticker').length * 9 + 20, 80)}px`,
          maxWidth: '300px',
          flexShrink: 0,
          borderRadius: '4px',
        }}
        className="focus:ring-2 focus:ring-blue-500"
        placeholder="Ticker"
        title={conditionTickerTooltip}
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
        <input
          type="text"
          value={condition.threshold || ""}
          onChange={(e) => onUpdate({ threshold: e.target.value })}
          onClick={(e) => e.stopPropagation()}
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
          }}
          className="focus:ring-2 focus:ring-blue-500"
          placeholder="Value"
          title={thresholdHasUndefinedVar ? `Variable ${condition.threshold} is not defined in Variables tab` : undefined}
        />
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
            definedVariables={definedVariables}
          />

          <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>of</span>

          <input
            type="text"
            value={condition.rightTicker || ""}
            onChange={(e) => onUpdate({ rightTicker: e.target.value.toUpperCase() })}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: rightTickerVisualError ? '2px solid #ef4444' : '1px solid #d1d5db',
              outline: 'none',
              padding: '4px 8px',
              background: rightTickerVisualError ? '#fee2e2' : '#fff',
              fontSize: '13px',
              color: rightTickerVisualError ? '#b91c1c' : condition.rightTicker ? '#111827' : '#9ca3af',
              width: `${Math.max((condition.rightTicker || 'Ticker').length * 9 + 20, 80)}px`,
              maxWidth: '300px',
              flexShrink: 0,
              borderRadius: '4px',
        }}
        className="focus:ring-2 focus:ring-blue-500"
        placeholder="Ticker"
        title={rightTickerTooltip}
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
  definedVariables?: Set<string>;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
}

export function GateCard({ element, onUpdate, onDelete, onCopy, clipboard, depth = 0, showWeight = false, isWeightInvalid = false, allElements = [], validationErrors = [], definedVariables = new Set<string>(), tickerMetadata, metadataLoading, metadataError }: GateCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showThenDropdown, setShowThenDropdown] = useState(false);
  const [showElseDropdown, setShowElseDropdown] = useState(false);
  const [thenTickerInput, setThenTickerInput] = useState("");
  const [elseTickerInput, setElseTickerInput] = useState("");

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

  const handleThenSelectType = (type: "weight" | "gate" | "scale") => {
    setShowThenDropdown(false);
    setThenTickerInput("");

    if (type === "gate") {
      const gateCount = allElements ? countGatesInTree(allElements) : 0;
      const gateName = `Gate${gateCount + 1}`;

      const defaultIndicator: IndicatorName = "RSI";
      const defaultP = defaultParams(defaultIndicator);
      const newGate: GateElement = {
        id: `gate-${Date.now()}`,
        type: "gate",
        name: gateName,
        weight: 100,
        conditionMode: "if",
        conditions: [{
          ticker: "",
          indicator: defaultIndicator,
          period: paramsToPeriodString(defaultIndicator, defaultP),
          params: defaultP,
          operator: "gt",
          compareTo: "indicator",
          threshold: "",
          rightTicker: "",
          rightIndicator: defaultIndicator,
          rightPeriod: paramsToPeriodString(defaultIndicator, defaultP),
          rightParams: defaultP,
        }],
        thenChildren: [],
        elseChildren: [],
      };
      onUpdate({ ...element, thenChildren: [...element.thenChildren, newGate] });
    } else if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: 100,
        weightMode: "equal",
        children: [],
      };
      onUpdate({ ...element, thenChildren: [...element.thenChildren, newWeight] });
    } else if (type === "scale") {
      const newScale = createDefaultScaleElement(100, allElements);
      onUpdate({ ...element, thenChildren: [...element.thenChildren, newScale] });
    }
  };

  const handleThenTickerSubmit = () => {
    if (thenTickerInput.trim()) {
      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: thenTickerInput.trim().toUpperCase(),
        weight: 100,
      };
      onUpdate({ ...element, thenChildren: [...element.thenChildren, newTicker] });
      setShowThenDropdown(false);
      setThenTickerInput("");
    }
  };

  const handleElseSelectType = (type: "weight" | "gate" | "scale") => {
    setShowElseDropdown(false);
    setElseTickerInput("");

    if (type === "gate") {
      const gateCount = allElements ? countGatesInTree(allElements) : 0;
      const gateName = `Gate${gateCount + 1}`;

      const defaultIndicator: IndicatorName = "RSI";
      const defaultP = defaultParams(defaultIndicator);
      const newGate: GateElement = {
        id: `gate-${Date.now()}`,
        type: "gate",
        name: gateName,
        weight: 100,
        conditionMode: "if",
        conditions: [{
          ticker: "",
          indicator: defaultIndicator,
          period: paramsToPeriodString(defaultIndicator, defaultP),
          params: defaultP,
          operator: "gt",
          compareTo: "indicator",
          threshold: "",
          rightTicker: "",
          rightIndicator: defaultIndicator,
          rightPeriod: paramsToPeriodString(defaultIndicator, defaultP),
          rightParams: defaultP,
        }],
        thenChildren: [],
        elseChildren: [],
      };
      onUpdate({ ...element, elseChildren: [...element.elseChildren, newGate] });
    } else if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: 100,
        weightMode: "equal",
        children: [],
      };
      onUpdate({ ...element, elseChildren: [...element.elseChildren, newWeight] });
    } else if (type === "scale") {
      const newScale = createDefaultScaleElement(100, allElements);
      onUpdate({ ...element, elseChildren: [...element.elseChildren, newScale] });
    }
  };

  const handleElseTickerSubmit = () => {
    if (elseTickerInput.trim()) {
      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: elseTickerInput.trim().toUpperCase(),
        weight: 100,
      };
      onUpdate({ ...element, elseChildren: [...element.elseChildren, newTicker] });
      setShowElseDropdown(false);
      setElseTickerInput("");
    }
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
            setThenTickerInput("");
          }
          if (showElseDropdown) {
            setShowElseDropdown(false);
            setElseTickerInput("");
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
            definedVariables={definedVariables}
            inline={true}
            tickerMetadata={tickerMetadata}
            metadataLoading={metadataLoading}
            metadataError={metadataError}
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
                definedVariables={definedVariables}
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
                          definedVariables={definedVariables}
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
                          definedVariables={definedVariables}
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
                          definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              padding: '8px',
                              background: '#fff',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            }}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={thenTickerInput}
                              onChange={(e) => setThenTickerInput(e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleThenTickerSubmit();
                                } else if (e.key === 'Escape') {
                                  setShowThenDropdown(false);
                                  setThenTickerInput("");
                                }
                              }}
                              placeholder="Enter ticker..."
                              style={{
                                fontSize: '13px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => handleThenSelectType("weight")}
                              style={{
                                fontSize: '13px',
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Weight
                            </button>
                            <button
                              onClick={() => handleThenSelectType("gate")}
                              style={{
                                fontSize: '13px',
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Gate
                            </button>
                            <button
                              onClick={() => handleThenSelectType("scale")}
                              style={{
                                fontSize: '13px',
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Scale
                            </button>
                            {clipboard && (
                              <button
                                onClick={() => {
                                  const cloned = deepCloneElement(clipboard);
                                  cloned.weight = 100;
                                  onUpdate({ ...element, thenChildren: [...element.thenChildren, cloned] });
                                  setShowThenDropdown(false);
                                  setThenTickerInput("");
                                }}
                                style={{
                                  fontSize: '13px',
                                  padding: '4px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#dcfce7'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <Copy size={14} /> Paste
                              </button>
                            )}
                          </div>
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
                          definedVariables={definedVariables}
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
                          definedVariables={definedVariables}
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
                          definedVariables={definedVariables}
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
                              definedVariables={definedVariables}
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
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              padding: '8px',
                              background: '#fff',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            }}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={elseTickerInput}
                              onChange={(e) => setElseTickerInput(e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleElseTickerSubmit();
                                } else if (e.key === 'Escape') {
                                  setShowElseDropdown(false);
                                  setElseTickerInput("");
                                }
                              }}
                              placeholder="Enter ticker..."
                              style={{
                                fontSize: '13px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => handleElseSelectType("weight")}
                              style={{
                                fontSize: '13px',
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Weight
                            </button>
                            <button
                              onClick={() => handleElseSelectType("gate")}
                              style={{
                                fontSize: '13px',
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Gate
                            </button>
                            <button
                              onClick={() => handleElseSelectType("scale")}
                              style={{
                                fontSize: '13px',
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Scale
                            </button>
                            {clipboard && (
                              <button
                                onClick={() => {
                                  const cloned = deepCloneElement(clipboard);
                                  cloned.weight = 100;
                                  onUpdate({ ...element, elseChildren: [...element.elseChildren, cloned] });
                                  setShowElseDropdown(false);
                                  setElseTickerInput("");
                                }}
                                style={{
                                  fontSize: '13px',
                                  padding: '4px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <Copy size={14} /> Paste
                              </button>
                            )}
                          </div>
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

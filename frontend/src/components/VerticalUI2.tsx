import React, { useState, useMemo, useEffect, useRef } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion, AnimatePresence } from "framer-motion";
import { Copy } from "lucide-react";
import type { IndicatorName } from "../types/indicators";
import { indicatorOptions, keysForIndicator, PARAM_LABELS, getEffectiveParams, defaultParams, paramsToPeriodString } from "../types/indicators";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { validateStrategy, type ValidationError } from "../utils/validation";
import { VariablesTab } from "./VariablesTab";
import { BatchTestsTab } from "./BatchTestsTab";
import type { BatchJob } from "../types/batchJobs";
import { putJob, getAllJobs } from "../storage/batchJobsStore";
import * as variablesApi from "../api/variables";
import * as strategiesApi from "../api/strategies";
import {
  extractStringsFromElements,
  extractVariablesFromStrings,
  hasUndefinedVariable,
  containsVariable,
  generateAssignments,
  applyVariablesToElements,
} from "../utils/verticalVariables";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

// ========== TYPES ==========

interface GateCondition {
  ticker: string;
  indicator: IndicatorName;
  period: string; // Deprecated: kept for backward compatibility
  params?: Record<string, string>; // New: indicator parameters
  operator: "gt" | "lt";
  compareTo: "threshold" | "indicator";
  threshold: string;
  rightTicker?: string;
  rightIndicator?: IndicatorName;
  rightPeriod?: string; // Deprecated: kept for backward compatibility
  rightParams?: Record<string, string>; // New: right indicator parameters
}

interface GateElement {
  id: string;
  type: "gate";
  name: string;
  weight: number;
  conditionMode: "if" | "if_all" | "if_any" | "if_none";
  conditions: GateCondition[];
  condition?: GateCondition; // Backward compatibility - deprecated
  thenChildren: Element[];
  elseChildren: Element[];
}

interface TickerElement {
  id: string;
  type: "ticker";
  ticker: string;
  weight: number;
}

interface WeightElement {
  id: string;
  type: "weight";
  name: string;
  weight: number;
  weightMode: "equal" | "defined";
  children: Element[];
}

type Element = GateElement | TickerElement | WeightElement;

// ========== HELPER FUNCTIONS ==========

// Count gates recursively to generate next gate number
function countGatesInTree(elements: Element[]): number {
  let count = 0;
  for (const el of elements) {
    if (el.type === "gate") {
      count++;
      count += countGatesInTree((el as GateElement).thenChildren);
      count += countGatesInTree((el as GateElement).elseChildren);
    }
    if (el.type === "weight") {
      count += countGatesInTree((el as WeightElement).children);
    }
  }
  return count;
}

// Check if a specific field has validation errors
function hasFieldError(elementId: string, field: string, errors: ValidationError[]): boolean {
  return errors.some(err => err.elementId === elementId && err.field === field);
}

// Check if a field value contains an undefined variable
function hasUndefinedVariableInField(value: unknown, definedVars: Set<string>): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();

  // Check if it's a variable token (starts with $)
  if (!/^\$[A-Za-z0-9_]+$/.test(trimmed)) return false;

  // Extract variable name (without $)
  const varName = trimmed.slice(1).toLowerCase();
  return !definedVars.has(varName);
}

// Deep clone an element and all its children with new IDs
function deepCloneElement(element: Element): Element {
  const newId = `${element.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (element.type === "ticker") {
    return {
      ...element,
      id: newId,
    };
  } else if (element.type === "weight") {
    return {
      ...element,
      id: newId,
      children: element.children.map(child => deepCloneElement(child)),
    };
  } else if (element.type === "gate") {
    return {
      ...element,
      id: newId,
      thenChildren: element.thenChildren.map(child => deepCloneElement(child)),
      elseChildren: element.elseChildren.map(child => deepCloneElement(child)),
    };
  }

  return element;
}

// ========== TICKER CARD ==========

interface TickerCardProps {
  element: TickerElement;
  onUpdate: (updated: TickerElement) => void;
  onDelete: () => void;
  onCopy?: () => void;
  depth?: number;
  showWeight?: boolean;
  isWeightInvalid?: boolean;
  validationErrors?: ValidationError[];
  definedVariables?: Set<string>;
}

function TickerCard({ element, onUpdate, onDelete, onCopy, depth = 0, showWeight = true, isWeightInvalid = false, validationErrors = [], definedVariables = new Set() }: TickerCardProps) {
  // Zebra striping: even depths get light gray background
  const bgColor = depth % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)';

  // Check if ticker field has undefined variable
  const hasUndefinedVar = hasUndefinedVariableInField(element.ticker, definedVariables);
  const hasValidationError = hasFieldError(element.id, "ticker", validationErrors);

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
      padding: '8px',
      paddingLeft: depth > 0 ? (showWeight ? '104px' : '32px') : (showWeight ? '80px' : '8px'),
      backgroundColor: bgColor,
    }}>
      {/* L-shaped connector */}
      {depth > 0 && (
        <div style={{
          position: 'absolute',
          left: '0',
          top: '50%',
          width: '24px',
          height: '1px',
          backgroundColor: '#d1d5db',
        }} />
      )}
      {depth > 0 && (
        <div style={{
          position: 'absolute',
          left: '0',
          top: '-8px',
          bottom: '50%',
          width: '1px',
          backgroundColor: '#d1d5db',
        }} />
      )}
      {showWeight && (
        <div style={{
          position: 'absolute',
          left: depth > 0 ? '24px' : '0',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          paddingLeft: '8px',
        }}>
          <input
            type="number"
            value={element.weight}
            onChange={(e) => onUpdate({ ...element, weight: Number(e.target.value) })}
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

      <input
        type="text"
        value={element.ticker}
        onChange={(e) => onUpdate({ ...element, ticker: e.target.value.toUpperCase() })}
        style={{
          border: (hasValidationError || hasUndefinedVar) ? '2px solid #ef4444' : '1px solid #d1d5db',
          outline: 'none',
          padding: '4px 8px',
          background: (hasValidationError || hasUndefinedVar) ? '#fee2e2' : '#fff',
          fontSize: '13px',
          color: '#111827',
          width: `${(element.ticker.length || 1) * 9 + 20}px`,
          minWidth: '60px',
          flexShrink: 0,
          borderRadius: '4px',
        }}
        className="focus:ring-2 focus:ring-blue-500"
        placeholder="TICKER"
        title={hasUndefinedVar ? `Variable ${element.ticker} is not defined in Variables tab` : undefined}
      />
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
        {onCopy && (
          <button
            onClick={onCopy}
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
  );
}

// ========== WEIGHT CARD ==========

interface WeightCardProps {
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
}

function WeightCard({ element, onUpdate, onDelete, onCopy, clipboard, initiallyOpen = false, depth = 0, showWeight = false, isWeightInvalid = false, allElements = [], validationErrors = [], definedVariables = new Set() }: WeightCardProps & { initiallyOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [showDropdown, setShowDropdown] = useState(false);
  const [tickerInput, setTickerInput] = useState("");

  // Calculate if children weights add up to 100%
  const childrenWeightSum = element.children.reduce((sum, child) => sum + child.weight, 0);
  const areChildWeightsInvalid = element.weightMode === "defined" && element.children.length > 0 && childrenWeightSum !== 100;

  const handleSelectType = (type: "weight" | "gate") => {
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
                        />
                      );
                    } else if (child.type === "ticker") {
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
                        />
                      );
                    } else if (child.type === "weight") {
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

// ========== INDICATOR PARAMS COMPONENT ==========

interface IndicatorParamsProps {
  indicator: IndicatorName;
  params: Record<string, string>;
  onUpdate: (params: Record<string, string>) => void;
  conditionIndex: number;
  elementId: string;
  validationErrors: ValidationError[];
  definedVariables: Set<string>;
}

function IndicatorParams({
  indicator,
  params,
  onUpdate,
  conditionIndex,
  elementId,
  validationErrors,
  definedVariables,
}: IndicatorParamsProps) {
  const paramKeys = keysForIndicator(indicator);

  if (paramKeys.length === 0) {
    return null; // Don't show anything for no-param indicators
  }

  const handleParamChange = (key: string, value: string) => {
    onUpdate({ ...params, [key]: value });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
                  width: '45px',
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
}: ConditionRowProps) {
  // Check for undefined variables in this condition's fields
  const tickerHasUndefinedVar = hasUndefinedVariableInField(condition.ticker, definedVariables);
  const periodHasUndefinedVar = hasUndefinedVariableInField(condition.period, definedVariables);
  const thresholdHasUndefinedVar = hasUndefinedVariableInField(condition.threshold, definedVariables);
  const rightTickerHasUndefinedVar = hasUndefinedVariableInField(condition.rightTicker, definedVariables);
  const rightPeriodHasUndefinedVar = hasUndefinedVariableInField(condition.rightPeriod, definedVariables);

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
          width: 'fit-content',
          minWidth: '0',
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
          border: (hasFieldError(elementId, `conditions.${conditionIndex}.ticker`, validationErrors) || tickerHasUndefinedVar) ? '2px solid #ef4444' : '1px solid #d1d5db',
          outline: 'none',
          padding: '4px 8px',
          background: (hasFieldError(elementId, `conditions.${conditionIndex}.ticker`, validationErrors) || tickerHasUndefinedVar) ? '#fee2e2' : '#fff',
          fontSize: '13px',
          color: condition.ticker ? '#111827' : '#9ca3af',
          width: '80px',
          flexShrink: 0,
          borderRadius: '4px',
        }}
        className="focus:ring-2 focus:ring-blue-500"
        placeholder="Ticker"
        title={tickerHasUndefinedVar ? `Variable ${condition.ticker} is not defined in Variables tab` : undefined}
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
            width: '80px',
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
              width: 'fit-content',
              minWidth: '0',
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
              border: (hasFieldError(elementId, `conditions.${conditionIndex}.rightTicker`, validationErrors) || rightTickerHasUndefinedVar) ? '2px solid #ef4444' : '1px solid #d1d5db',
              outline: 'none',
              padding: '4px 8px',
              background: (hasFieldError(elementId, `conditions.${conditionIndex}.rightTicker`, validationErrors) || rightTickerHasUndefinedVar) ? '#fee2e2' : '#fff',
              fontSize: '13px',
              color: condition.rightTicker ? '#111827' : '#9ca3af',
              width: '80px',
              flexShrink: 0,
              borderRadius: '4px',
            }}
            className="focus:ring-2 focus:ring-blue-500"
            placeholder="Ticker"
            title={rightTickerHasUndefinedVar ? `Variable ${condition.rightTicker} is not defined in Variables tab` : undefined}
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

interface GateCardProps {
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
}

function GateCard({ element, onUpdate, onDelete, onCopy, clipboard, depth = 0, showWeight = false, isWeightInvalid = false, allElements = [], validationErrors = [], definedVariables = new Set() }: GateCardProps) {
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

  const handleThenSelectType = (type: "weight" | "gate") => {
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

  const handleElseSelectType = (type: "weight" | "gate") => {
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

// ========== MAIN COMPONENT ==========

// Strategy tab type
type StrategyTab = {
  id: string;
  elements: Element[];
  history: Element[][];
  historyIndex: number;
  benchmarkSymbol: string;
  startDate: string;
  endDate: string;
  backtestResults: any;
  strategyName: string;
  versioningEnabled: boolean;
  version: { major: number; minor: number; patch: number; fork: string };
  createdAt: string;
  updatedAt: string;
};

interface VerticalUI2Props {
  apiKey?: string;
  hideInternalTabs?: boolean;
  apiSecret?: string;
}

export default function VerticalUI2({ apiKey = "", apiSecret = "" }: VerticalUI2Props = {}) {
  // Strategy tabs state
  const [strategyTabs, setStrategyTabs] = useState<StrategyTab[]>(() => {
    try {
      const saved = localStorage.getItem('verticalUI2_strategy_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load strategy tabs:', err);
    }
    // Default: one empty tab
    return [{
      id: `tab-${Date.now()}`,
      elements: [],
      history: [[]],
      historyIndex: 0,
      benchmarkSymbol: "SPY",
      startDate: "max",
      endDate: new Date().toISOString().slice(0, 10),
      backtestResults: null,
      strategyName: "",
      versioningEnabled: false,
      version: { major: 0, minor: 0, patch: 1, fork: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
  });

  const [activeStrategyTabId, setActiveStrategyTabId] = useState<string>(() => {
    const saved = localStorage.getItem('verticalUI2_active_tab_id');
    return saved || strategyTabs[0]?.id || '';
  });

  // Get current active tab
  const currentTab = strategyTabs.find(t => t.id === activeStrategyTabId) || strategyTabs[0];

  // Derived state from current tab
  const elements = currentTab?.elements || [];
  const history = currentTab?.history || [[]];
  const historyIndex = currentTab?.historyIndex || 0;
  const benchmarkSymbol = currentTab?.benchmarkSymbol || "SPY";
  const startDate = currentTab?.startDate || "max";
  const endDate = currentTab?.endDate || new Date().toISOString().slice(0, 10);
  const backtestResults = currentTab?.backtestResults || null;
  const strategyName = currentTab?.strategyName || "";
  const versioningEnabled = currentTab?.versioningEnabled || false;
  const version = currentTab?.version || { major: 0, minor: 0, patch: 1, fork: "" };
  const createdAt = currentTab?.createdAt || new Date().toISOString();
  const updatedAt = currentTab?.updatedAt || new Date().toISOString();

  // Helper function to update current tab
  const updateCurrentTab = (updates: Partial<StrategyTab>) => {
    setStrategyTabs(tabs => tabs.map(tab =>
      tab.id === activeStrategyTabId ? { ...tab, ...updates } : tab
    ));
  };

  // Setters that update current tab
  const setElements = (newElements: Element[] | ((prev: Element[]) => Element[])) => {
    const updated = typeof newElements === 'function' ? newElements(elements) : newElements;
    updateCurrentTab({ elements: updated });
  };

  const setHistory = (newHistory: Element[][]) => updateCurrentTab({ history: newHistory });
  const setHistoryIndex = (newIndex: number) => updateCurrentTab({ historyIndex: newIndex });
  const setBenchmarkSymbol = (newSymbol: string) => updateCurrentTab({ benchmarkSymbol: newSymbol });
  const setStartDate = (newDate: string) => updateCurrentTab({ startDate: newDate });
  const setEndDate = (newDate: string) => updateCurrentTab({ endDate: newDate });
  const setBacktestResults = (newResults: any) => updateCurrentTab({ backtestResults: newResults });
  const setStrategyName = (newName: string) => updateCurrentTab({ strategyName: newName });
  const setVersioningEnabled = (enabled: boolean) => updateCurrentTab({ versioningEnabled: enabled });
  const setVersion = (newVersion: { major: number; minor: number; patch: number; fork: string }) =>
    updateCurrentTab({ version: newVersion });
  const setCreatedAt = (newDate: string) => updateCurrentTab({ createdAt: newDate });
  const setUpdatedAt = (newDate: string) => updateCurrentTab({ updatedAt: newDate });

  // UI state (not per-tab)
  const [showDropdown, setShowDropdown] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [clipboard, setClipboard] = useState<Element | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const debug = true; // Always include debug data

  // Tab management
  const [activeTab, setActiveTab] = useState<"strategy" | "variables" | "batchtests">("strategy");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [backtestResultsOpen, setBacktestResultsOpen] = useState(true);

  // Batch jobs state
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // Variables state
  const [variableLists, setVariableLists] = useState<variablesApi.VariableList[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(false);

  // Load variables from API
  const loadVariables = async () => {
    try {
      setVariablesLoading(true);
      const lists = await variablesApi.getAllVariableLists();
      setVariableLists(lists);
    } catch (err) {
      console.error('Failed to load variables:', err);
    } finally {
      setVariablesLoading(false);
    }
  };

  // Load variables on mount and when switching tabs
  // This ensures we always have the latest variables when checking strategies
  useEffect(() => {
    loadVariables();
  }, [activeTab]);

  // Load batch jobs from IndexedDB on mount
  useEffect(() => {
    getAllJobs().then((jobs) => {
      setBatchJobs(jobs);
    }).catch((err) => {
      console.error('Failed to load batch jobs:', err);
    });
  }, []);

  // Batch backtest state
  const MAX_ASSIGNMENTS = 10000;
  const [showUndefinedAlert, setShowUndefinedAlert] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<{
    total: number;
    detail: Array<{ name: string; count: number; values: string[] }>;
  } | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<{
    detail: Array<{ name: string; count: number; values: string[] }>;
    lines: string[];
    truncated: boolean;
    total: number;
    shown: number;
    assignments: Array<Record<string, string>>;
  } | null>(null);

  // Batch results viewer state
  const [showResultsViewer, setShowResultsViewer] = useState(false);
  const [viewingResults, setViewingResults] = useState<{
    jobId: string;
    name: string;
    summary: {
      totalRuns: number;
      avgTotalReturn: number;
      bestTotalReturn: number;
      worstTotalReturn: number;
    };
    runs: Array<{
      variables: Record<string, string>;
      metrics: Record<string, number>;
    }>;
  } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Real-time validation - updates whenever elements change
  const validationErrors = useMemo(() => {
    if (elements.length === 0) return [];
    const validation = validateStrategy(elements as any);
    return validation.errors;
  }, [elements]);

  // Check for strategy to load from Library (one-time on mount)
  useEffect(() => {
    const strategyToLoadStr = localStorage.getItem('strategyToLoad');
    if (strategyToLoadStr) {
      try {
        const strategyData = JSON.parse(strategyToLoadStr);
        // Create a new tab with the loaded strategy
        const newTab: StrategyTab = {
          id: `tab-${Date.now()}`,
          elements: strategyData.elements || [],
          history: [strategyData.elements || []],
          historyIndex: 0,
          benchmarkSymbol: "SPY",
          startDate: "max",
          endDate: new Date().toISOString().slice(0, 10),
          backtestResults: null,
          strategyName: strategyData.name || "",
          versioningEnabled: strategyData.versioningEnabled || false,
          version: strategyData.version || { major: 0, minor: 0, patch: 1, fork: "" },
          createdAt: strategyData.createdAt || new Date().toISOString(),
          updatedAt: strategyData.updatedAt || new Date().toISOString(),
        };
        setStrategyTabs(prev => [...prev, newTab]);
        setActiveStrategyTabId(newTab.id);
        // Clear the flag
        localStorage.removeItem('strategyToLoad');
      } catch (err) {
        console.error('Failed to load strategy from Library:', err);
        localStorage.removeItem('strategyToLoad');
      }
    }
  }, []); // Run only once on mount

  // Variable detection and validation
  const strategyStrings = useMemo(() => extractStringsFromElements(elements), [elements]);
  const strategyVariables = useMemo(() => extractVariablesFromStrings(strategyStrings), [strategyStrings]);
  const hasVariables = strategyVariables.length > 0;

  // Load defined variables and create lookup set
  const definedVariables = useMemo(() => {
    return new Set(variableLists.map(v => v.name));
  }, [variableLists]);

  // Check for undefined variables
  const undefinedVariables = useMemo(() => {
    return strategyVariables.filter(varName => !definedVariables.has(varName));
  }, [strategyVariables, definedVariables]);

  // Memoize chart data to prevent constant re-renders
  const chartData = useMemo(() => {
    if (!backtestResults?.dates || !backtestResults?.equityCurve) {
      return [];
    }
    return backtestResults.dates.map((date: string, i: number) => ({
      date,
      strategy: backtestResults.equityCurve[i],
      benchmark: backtestResults.benchmark?.equityCurve?.[i],
    }));
  }, [backtestResults?.dates, backtestResults?.equityCurve, backtestResults?.benchmark?.equityCurve]);

  // Tab management functions
  const addTab = () => {
    const newTab: StrategyTab = {
      id: `tab-${Date.now()}`,
      elements: [],
      history: [[]],
      historyIndex: 0,
      benchmarkSymbol: "SPY",
      startDate: "max",
      endDate: new Date().toISOString().slice(0, 10),
      backtestResults: null,
      strategyName: "",
      versioningEnabled: false,
      version: { major: 0, minor: 0, patch: 1, fork: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStrategyTabs(prev => [...prev, newTab]);
    setActiveStrategyTabId(newTab.id);
  };

  const closeTab = (tabId: string) => {
    if (strategyTabs.length === 1) return; // Can't close last tab
    setStrategyTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeStrategyTabId === tabId) {
      const remaining = strategyTabs.filter(t => t.id !== tabId);
      setActiveStrategyTabId(remaining[0]?.id || '');
    }
  };

  // Save all tabs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('verticalUI2_strategy_tabs', JSON.stringify(strategyTabs));
    } catch (err) {
      console.error('Failed to save strategy tabs:', err);
    }
  }, [strategyTabs]);

  // Save active tab ID to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('verticalUI2_active_tab_id', activeStrategyTabId);
    } catch (err) {
      console.error('Failed to save active tab ID:', err);
    }
  }, [activeStrategyTabId]);

  // Save batch jobs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('verticalUI2_batch_jobs', JSON.stringify(batchJobs));
    } catch (err) {
      console.error('Failed to save batch jobs:', err);
    }
  }, [batchJobs]);

  // Save to history whenever elements change
  const saveToHistory = (newElements: Element[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  const handleSelectType = (type: "weight" | "gate") => {
    setShowDropdown(false);
    setTickerInput("");

    if (type === "gate") {
      const gateCount = countGatesInTree(elements);
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
      saveToHistory([...elements, newGate]);
    } else if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: 100,
        weightMode: "equal",
        children: [],
      };
      saveToHistory([...elements, newWeight]);
    }
  };

  const handleTickerSubmit = () => {
    if (tickerInput.trim()) {
      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: tickerInput.trim().toUpperCase(),
        weight: 100,
      };
      saveToHistory([...elements, newTicker]);
      setShowDropdown(false);
      setTickerInput("");
    }
  };

  const updateElement = (id: string, updated: Element) => {
    const newElements = elements.map((el) => (el.id === id ? updated : el));
    saveToHistory(newElements);
  };

  const deleteElement = (id: string) => {
    const newElements = elements.filter((el) => el.id !== id);
    saveToHistory(newElements);
  };

  // Helper to format version for display (drops trailing zeros, but keeps at least patch if non-zero from start)
  const formatVersion = (v: typeof version): string => {
    const { major, minor, patch, fork } = v;
    const forkLower = fork.toLowerCase();
    // Always show full version if we started with a non-zero patch (v0.0.1)
    if (major === 0 && minor === 0 && patch === 1 && !fork) {
      return `v0.0.1`;
    }
    // Standard formatting: drop trailing zeros
    if (patch > 0) return `v${major}.${minor}.${patch}${forkLower}`;
    if (minor > 0) return `v${major}.${minor}${forkLower}`;
    return `v${major}${forkLower}`;
  };

  // Helper function to save strategy to both localStorage and database
  const saveStrategyToDb = async (strategyData: {
    name: string;
    versioningEnabled: boolean;
    version: { major: number; minor: number; patch: number; fork: string };
    createdAt: string;
    updatedAt: string;
    elements: Element[];
  }) => {
    // Validate strategy name
    if (!strategyData.name || strategyData.name.trim() === '') {
      alert('Please enter a strategy name before saving');
      return;
    }

    // Save to localStorage (for draft cache)
    localStorage.setItem('verticalUI2_strategy_v2', JSON.stringify(strategyData));

    // Save to database
    try {
      await strategiesApi.saveStrategy({
        name: strategyData.name,
        versioningEnabled: strategyData.versioningEnabled,
        version: strategyData.version,
        elements: strategyData.elements,
        createdAt: strategyData.createdAt,
      });
      alert(`Strategy "${strategyData.name}" saved successfully!`);
    } catch (error: any) {
      console.error('Failed to save strategy to database:', error);
      alert(`Failed to save strategy to database: ${error.message}`);
    }
  };

  // Version increment handlers
  const handleSaveSimple = async () => {
    const now = new Date().toISOString();
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSavePatch = async () => {
    const now = new Date().toISOString();
    const newVersion = { ...version, patch: version.patch + 1, fork: "" };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSaveMinor = async () => {
    const now = new Date().toISOString();
    const newVersion = { ...version, minor: version.minor + 1, patch: 0, fork: "" };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSaveMajor = async () => {
    const now = new Date().toISOString();
    const newVersion = { major: version.major + 1, minor: 0, patch: 0, fork: "" };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSaveFork = async () => {
    const now = new Date().toISOString();
    let nextFork = "b";
    if (version.fork) {
      const currentCharCode = version.fork.toLowerCase().charCodeAt(0);
      nextFork = String.fromCharCode(currentCharCode + 1);
    }
    const newVersion = { ...version, fork: nextFork };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleResetVersions = () => {
    const newVersion = { major: 0, minor: 0, patch: 1, fork: "" };
    setVersion(newVersion);
  };

  const exportStrategy = () => {
    const strategyData = {
      version: "2.0",
      name: strategyName,
      versioningEnabled,
      strategyVersion: version,
      createdAt,
      updatedAt,
      timestamp: new Date().toISOString(),
      elements: elements,
    };

    const dataStr = JSON.stringify(strategyData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const versionStr = formatVersion(version);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = strategyName
      ? `${strategyName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${versionStr}-${dateStr}.json`
      : `strategy-${versionStr}-${dateStr}.json`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetStrategy = () => {
    if (elements.length > 0 && !window.confirm('Are you sure you want to clear the entire strategy? This cannot be undone.')) {
      return;
    }
    localStorage.removeItem('verticalUI2_strategy');
    console.log('Cleared saved strategy from localStorage');
    saveToHistory([]);
  };

  const backtestStrategy = async () => {
    console.log('🚀 backtestStrategy called at', new Date().toISOString());

    try {
      // Prevent double-execution
      if (isBacktesting) {
        console.warn('⚠️ Backtest already running, ignoring duplicate call');
        return;
      }

      // Validation is done real-time via useMemo
      // If there are validation errors, button is disabled
      if (validationErrors.length > 0) {
        console.error('Validation failed:', validationErrors);
        return;
      }

      // Check if strategy uses variables
      if (hasVariables) {
        // Check for undefined variables
        const defined = new Map(variableLists.map((v) => [v.name, v]));
        const missing = strategyVariables.filter((v) => !defined.has(v));

        if (missing.length) {
          setShowUndefinedAlert(true);
          return;
        }

        // Generate variable assignment details
        const detail = strategyVariables.map((name) => {
          const entry = defined.get(name);
          return {
            name,
            count: entry?.values.length || 0,
            values: entry?.values || [],
          };
        });

        const total = detail.reduce((acc, d) => acc * Math.max(d.count, 1), 1);

        setBatchConfirm({ total, detail });
        setShowBatchConfirm(true);
        return;
      }

      // Regular single backtest (no variables)
      console.log('Backtesting strategy...');
      setIsBacktesting(true);
      setBacktestResults(null);

      const payload = {
        elements,
        benchmarkSymbol,
        startDate,
        endDate,
        debug,
      };

      console.log('📤 BACKTEST PAYLOAD:', JSON.stringify(payload, null, 2));

      const response = await fetch(`${API_BASE}/api/backtest_strategy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || 'Strategy backtest failed'}`);
        console.error('Backtest error:', data);
        return;
      }

      console.log('Backtest complete:', data);
      setBacktestResults(data);
      setBacktestResultsOpen(true); // Auto-expand results when backtest completes
    } catch (err: any) {
      console.error('Backtest error:', err);
      alert(`Failed to backtest strategy: ${err.message}`);
    } finally {
      setIsBacktesting(false);
    }
  };

  const uploadStrategy = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (!json.elements || !Array.isArray(json.elements)) {
            alert('Invalid JSON format. Expected a "elements" array.');
            return;
          }

          // Load elements into strategy tree
          saveToHistory(json.elements);

          // Restore metadata if available
          if (json.name) {
            updateCurrentTab({ strategyName: json.name });
          }

          if (json.versioningEnabled !== undefined) {
            updateCurrentTab({ versioningEnabled: json.versioningEnabled });
          }

          if (json.strategyVersion) {
            const importedVersion = {
              major: json.strategyVersion.major ?? 0,
              minor: json.strategyVersion.minor ?? 0,
              patch: json.strategyVersion.patch ?? 1,
              fork: json.strategyVersion.fork ?? "",
            };
            updateCurrentTab({ version: importedVersion });
          }

          if (json.createdAt) {
            updateCurrentTab({ createdAt: json.createdAt });
          }

          if (json.updatedAt) {
            updateCurrentTab({ updatedAt: json.updatedAt });
          }

          alert(`Strategy "${json.name || 'Untitled'}" imported successfully!`);
        } catch (error) {
          alert('Error parsing JSON file: ' + (error as Error).message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Batch execution function
  const executeBatchBacktest = async () => {
    if (!batchConfirm) return;

    setShowBatchConfirm(false);
    setBatchConfirm(null);

    const { detail, total } = batchConfirm;

    // Generate all variable assignments
    const { assignments, truncated } = generateAssignments(detail, MAX_ASSIGNMENTS);

    console.log(`Generated ${assignments.length} assignments (truncated: ${truncated})`);

    // Create batch job
    const jobId = `batch-${Date.now()}`;
    const jobName = strategyName ? `${strategyName} Batch` : "Batch Backtest";

    const newJob: BatchJob = {
      id: jobId,
      name: jobName,
      kind: "server",
      status: "queued",
      total: assignments.length,
      completed: 0,
      detail: detail.map(d => ({ name: d.name, count: d.count, values: d.values })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      viewUrl: null,
      csvUrl: null,
      completedAt: null,
      truncated: false,
    };

    // Add job to list and persist to IndexedDB
    setBatchJobs(prev => [newJob, ...prev]);
    await putJob(newJob);

    try {
      // Update job status to running
      const runningJob = { ...newJob, status: "running" as const };
      setBatchJobs(prev => prev.map(j =>
        j.id === jobId ? runningJob : j
      ));
      await putJob(runningJob);

      // Debug: Log credentials being sent
      console.log('[BATCH] Sending credentials:', {
        apiKey: apiKey ? `${apiKey.slice(0, 8)}...` : 'MISSING',
        apiSecret: apiSecret ? `${apiSecret.slice(0, 8)}...` : 'MISSING',
        url: `${API_BASE}/api/batch_backtest_strategy`
      });

      // Send batch request to backend
      const response = await fetch(`${API_BASE}/api/batch_backtest_strategy`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        body: JSON.stringify({
          assignments,
          baseStrategy: {
            elements,
            benchmarkSymbol,
            startDate,
            endDate,
            debug,
          },
          jobId,
          jobName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Batch backtest failed');
      }

      console.log('Batch backtest accepted:', data);

      // Backend accepted the job (202), now poll for completion
      const pollJobStatus = async () => {
        try {
          const statusResponse = await fetch(`${API_BASE}/api/batch_backtest_strategy/${jobId}`, {
            credentials: 'include'
          });
          const statusData = await statusResponse.json();

          if (!statusResponse.ok) {
            throw new Error(statusData.error || 'Failed to get job status');
          }

          // Update job with current status
          const updatedJob = {
            ...(batchJobs.find(j => j.id === jobId) || newJob),
            status: statusData.status,
            completed: statusData.completed || 0,
            viewUrl: statusData.viewUrl || null,
            csvUrl: statusData.csvUrl || null,
            error: statusData.error || null,
            updatedAt: new Date().toISOString(),
            completedAt: statusData.status === 'finished' ? new Date().toISOString() : null,
          };
          setBatchJobs(prev => prev.map(j =>
            j.id === jobId ? updatedJob : j
          ));
          await putJob(updatedJob);

          // If still running, poll again
          if (statusData.status === 'running' || statusData.status === 'queued') {
            setTimeout(pollJobStatus, 2000); // Poll every 2 seconds
          } else if (statusData.status === 'finished') {
            // Switch to Batch Tests tab to show results
            setActiveTab("batchtests");
            alert(`Batch backtest completed! ${statusData.completed || assignments.length} strategies tested.`);
          } else if (statusData.status === 'failed') {
            alert(`Batch backtest failed: ${statusData.error || 'Unknown error'}`);
          }
        } catch (err: any) {
          console.error('Error polling job status:', err);
          // Don't throw - just stop polling
        }
      };

      // Start polling after a short delay
      setTimeout(pollJobStatus, 1000);
    } catch (err: any) {
      console.error('Batch backtest error:', err);

      // Update job with error
      const failedJob = {
        ...(batchJobs.find(j => j.id === jobId) || newJob),
        status: "failed" as const,
        error: err.message || "Batch backtest failed",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      setBatchJobs(prev => prev.map(j =>
        j.id === jobId ? failedJob : j
      ));
      await putJob(failedJob);

      alert(`Batch backtest failed: ${err.message}`);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
    }}>
      {/* Main Tabs */}
      <div style={{
        display: "none", // HIDDEN - tabs moved to App.tsx
        padding: '12px 32px 0 32px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setActiveTab("strategy")}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: activeTab === "strategy" ? '#1677ff' : '#6b7280',
              background: activeTab === "strategy" ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === "strategy" ? '2px solid #1677ff' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            Strategy
          </button>
          <button
            onClick={() => setActiveTab("variables")}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: activeTab === "variables" ? '#1677ff' : '#6b7280',
              background: activeTab === "variables" ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === "variables" ? '2px solid #1677ff' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            Variables
          </button>
          <button
            onClick={() => setActiveTab("batchtests")}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: activeTab === "batchtests" ? '#1677ff' : '#6b7280',
              background: activeTab === "batchtests" ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === "batchtests" ? '2px solid #1677ff' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            Batch Tests
          </button>
        </div>
      </div>

      {/* Strategy Tabs - Editable */}
      {activeTab === "strategy" && (
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '8px 32px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          overflowX: 'auto',
        }}>
          {strategyTabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => {
                if (editingTabId !== tab.id) {
                  setActiveStrategyTabId(tab.id);
                }
              }}
              onDoubleClick={() => {
                if (tab.id === activeStrategyTabId) {
                  setEditingTabId(tab.id);
                }
              }}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                background: tab.id === activeStrategyTabId ? '#ffffff' : 'transparent',
                border: tab.id === activeStrategyTabId ? '1px solid #d1d5db' : '1px solid transparent',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {editingTabId === tab.id ? (
                <input
                  type="text"
                  value={tab.strategyName || ''}
                  onChange={(e) => {
                    setStrategyTabs(tabs => tabs.map(t =>
                      t.id === tab.id ? { ...t, strategyName: e.target.value } : t
                    ));
                  }}
                  onBlur={() => setEditingTabId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingTabId(null);
                    } else if (e.key === 'Escape') {
                      setEditingTabId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  placeholder="Strategy name..."
                  style={{
                    width: 150,
                    padding: '2px 4px',
                    fontSize: 12,
                    border: '1px solid #3b82f6',
                    borderRadius: '2px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tab.strategyName || 'Untitled Strategy'}
                </span>
              )}
              {strategyTabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    fontSize: 14,
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            +
          </button>
        </div>
      )}

      {/* 1. Main Toolbar */}
      <div style={{
        background: "#fff",
        padding: '16px 32px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <button
            onClick={undo}
            disabled={historyIndex === 0}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: historyIndex === 0 ? '#9ca3af' : '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: historyIndex === 0 ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={historyIndex === history.length - 1}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: historyIndex === history.length - 1 ? '#9ca3af' : '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: historyIndex === history.length - 1 ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>

          {/* Versioning Controls */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#666',
            cursor: 'pointer',
            marginLeft: '8px',
          }}>
            <input
              type="checkbox"
              checked={versioningEnabled}
              onChange={(e) => setVersioningEnabled(e.target.checked)}
            />
            Versions
          </label>

          {versioningEnabled ? (
            <>
              {/* Version badge */}
              <div style={{
                padding: '4px 8px',
                background: '#e0e7ff',
                border: '1px solid #c7d2fe',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#4338ca',
              }}>
                {formatVersion(version)}
              </div>

              {/* Save new label */}
              <span style={{ fontSize: '11px', color: '#666', fontWeight: '500' }}>SAVE NEW:</span>

              {/* Save buttons */}
              <button
                onClick={handleSavePatch}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Patch
              </button>
              <button
                onClick={handleSaveMinor}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Minor
              </button>
              <button
                onClick={handleSaveMajor}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Major
              </button>
              <button
                onClick={handleSaveFork}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Fork
              </button>
              <button
                onClick={handleResetVersions}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#dc2626',
                  background: '#fff',
                  border: '1px solid #fca5a5',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Reset Versions
              </button>
            </>
          ) : (
            <>
              {/* Simple save button */}
              <button
                onClick={handleSaveSimple}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Save
              </button>
            </>
          )}

          <div style={{ marginLeft: 'auto' }} />
          <button
            onClick={uploadStrategy}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            title="Upload strategy from JSON"
          >
            📤 Upload
          </button>
          <button
            onClick={exportStrategy}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            title="Export strategy as JSON"
          >
            📥 Export
          </button>
          <button
            onClick={resetStrategy}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: '#dc2626',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            title="Reset and clear all"
          >
            🗑️ Reset
          </button>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div style={{
          padding: '12px 32px',
          background: '#fef2f2',
          borderBottom: '1px solid #fecaca',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>
            ⚠️ Fix {validationErrors.length} error{validationErrors.length > 1 ? 's' : ''} before running backtest:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {validationErrors.slice(0, 5).map((error, idx) => (
              <div key={idx} style={{ fontSize: '12px', color: '#7f1d1d', paddingLeft: '16px' }}>
                • {error.message}
              </div>
            ))}
            {validationErrors.length > 5 && (
              <div style={{ fontSize: '12px', color: '#7f1d1d', paddingLeft: '16px', fontStyle: 'italic' }}>
                ... and {validationErrors.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}


      {/* 2. Backtest Bar (Always Visible) */}
      {activeTab === "strategy" && (
        <div style={{
          margin: '16px 32px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {backtestResults ? (
            <Collapsible.Root open={backtestResultsOpen} onOpenChange={setBacktestResultsOpen}>
              <Collapsible.Trigger asChild>
              <div style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                background: '#fff',
                border: 'none',
                gap: '12px',
                cursor: 'pointer',
              }}>
                <button
                  onClick={backtestStrategy}
                  disabled={elements.length === 0 || isBacktesting || validationErrors.length > 0}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    color: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#9ca3af' : (hasVariables ? '#7f3dff' : '#059669'),
                    background: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#f9fafb' : '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                  }}
                  onMouseEnter={(e) => {
                    if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                      e.currentTarget.style.background = hasVariables ? '#f3e8ff' : '#d1fae5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                      e.currentTarget.style.background = '#fff';
                    }
                  }}
                  title={
                    validationErrors.length > 0
                      ? `Fix ${validationErrors.length} validation error(s) first`
                      : hasVariables
                        ? "Run batch backtests with all variable combinations"
                        : "Run full historical backtest"
                  }
                >
                  {isBacktesting ? '⏳ Running...' : (hasVariables ? '▶️ Batch Backtest' : '▶️ Backtest')}
                </button>

                {/* Benchmark field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                    Benchmark:
                  </label>
                  <input
                    value={benchmarkSymbol}
                    onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())}
                    placeholder="SPY"
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                {/* Start Date field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                    Start:
                  </label>
                  <input
                    type="date"
                    defaultValue={startDate === "max" ? "" : startDate}
                    onBlur={(e) => setStartDate(e.target.value || "max")}
                    placeholder="Max"
                    style={{
                      width: '140px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                {/* End Date field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                    End:
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      width: '140px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                <span style={{
                  fontSize: '14px',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  transform: backtestResultsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>▼</span>
              </div>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div style={{ padding: '24px' }}>
                {/* Metrics Grid */}
                {backtestResults.metrics && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    marginBottom: '24px',
                  }}>
                    {[
                      { label: 'Total Return', value: backtestResults.metrics.totalReturn, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                      { label: 'CAGR', value: backtestResults.metrics.CAGR, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                      { label: 'Volatility', value: backtestResults.metrics.annualVolatility, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                      { label: 'Sharpe', value: backtestResults.metrics.sharpe, format: (v: number) => v.toFixed(2) },
                      { label: 'Sortino', value: backtestResults.metrics.sortino, format: (v: number) => v.toFixed(2) },
                      { label: 'Max Drawdown', value: backtestResults.metrics.maxDrawdown, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                    ].map(({ label, value, format }) => (
                      <div key={label} style={{
                        padding: '12px',
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                      }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
                        <div style={{ fontSize: '18px', fontWeight: '700' }}>
                          {value !== undefined && value !== null ? format(value) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Equity Curve Chart */}
                {backtestResults.dates && backtestResults.equityCurve && (
                  <div style={{
                    padding: '24px',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    marginBottom: '16px',
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Equity Curve</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                      {backtestResults.dates.length} days |
                      Final Value: ${backtestResults.equityCurve[backtestResults.equityCurve.length - 1]?.toFixed(2) || '1.00'}
                    </div>
                    <ResponsiveContainer width="100%" height={280} debounce={300}>
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(val) => {
                            const d = new Date(val);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(val) => `$${val.toFixed(2)}`}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#fff',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                          formatter={(value: any) => `$${Number(value).toFixed(4)}`}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '12px' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="strategy"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          name="Strategy"
                          isAnimationActive={false}
                        />
                        {backtestResults.benchmark && (
                          <Line
                            type="monotone"
                            dataKey="benchmark"
                            stroke="#9ca3af"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={false}
                            name={benchmarkSymbol}
                            isAnimationActive={false}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Debug Info */}
                {backtestResults.debugDays && (
                  <Collapsible.Root defaultOpen>
                    <Collapsible.Trigger asChild>
                      <button style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                      }}>
                        <span>Debug Data ({backtestResults.debugDays.length} days)</span>
                        <span style={{ fontSize: '12px' }}>▼</span>
                      </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content>
                      <div style={{
                        marginTop: '8px',
                        maxHeight: '500px',
                        overflow: 'auto',
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                      }}>
                        {(() => {
                          // Collect all unique tickers and gates
                          const allTickers = new Set<string>();
                          const allGates = new Set<string>();

                          backtestResults.debugDays.forEach((day: any) => {
                            Object.keys(day.allocation || {}).forEach((ticker) => allTickers.add(ticker));
                            Object.keys(day.gateResults || {}).forEach((gate) => allGates.add(gate));
                          });

                          const tickers = Array.from(allTickers).sort();
                          const gates = Array.from(allGates).sort();

                          return (
                            <table style={{
                              fontSize: '11px',
                              borderCollapse: 'collapse',
                            }}>
                              <thead>
                                <tr style={{ background: '#fff', borderBottom: '2px solid #d1d5db' }}>
                                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', position: 'sticky', top: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap' }}>
                                    DATE
                                  </th>
                                  {tickers.map((ticker) => (
                                    <th key={ticker} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', position: 'sticky', top: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap' }}>
                                      {ticker}
                                    </th>
                                  ))}
                                  {gates.map((gate) => (
                                    <th key={gate} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', position: 'sticky', top: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap' }} title={gate}>
                                      {gate.slice(0, 5)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {backtestResults.debugDays.map((day: any, idx: number) => (
                                  <tr key={idx} style={{
                                    borderBottom: '1px solid #e5e7eb',
                                    background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                                  }}>
                                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                      {day.heldDate}
                                    </td>
                                    {tickers.map((ticker) => {
                                      const allocation = day.allocation?.[ticker];
                                      return (
                                        <td key={ticker} style={{ padding: '4px 8px', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                          {allocation ? (allocation * 100).toFixed(1) : '-'}
                                        </td>
                                      );
                                    })}
                                    {gates.map((gate) => {
                                      const result = day.gateResults?.[gate];
                                      return (
                                        <td key={gate} style={{ padding: '4px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                          {result === true ? '✓' : result === false ? '✗' : '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </Collapsible.Content>
                  </Collapsible.Root>
                )}
              </div>
            </Collapsible.Content>
            </Collapsible.Root>
          ) : (
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              background: '#fff',
              border: 'none',
              gap: '12px',
            }}>
              <button
                onClick={backtestStrategy}
                disabled={elements.length === 0 || isBacktesting || validationErrors.length > 0}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  color: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#9ca3af' : (hasVariables ? '#7f3dff' : '#059669'),
                  background: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#f9fafb' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
                onMouseEnter={(e) => {
                  if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                    e.currentTarget.style.background = hasVariables ? '#f3e8ff' : '#d1fae5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                    e.currentTarget.style.background = '#fff';
                  }
                }}
                title={
                  validationErrors.length > 0
                    ? `Fix ${validationErrors.length} validation error(s) first`
                    : hasVariables
                      ? "Run batch backtests with all variable combinations"
                      : "Run full historical backtest"
                }
              >
                {isBacktesting ? '⏳ Running...' : (hasVariables ? '▶️ Batch Backtest' : '▶️ Backtest')}
              </button>

              {/* Benchmark field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                  Benchmark:
                </label>
                <input
                  value={benchmarkSymbol}
                  onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())}
                  placeholder="SPY"
                  style={{
                    width: '60px',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* Start Date field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                  Start:
                </label>
                <input
                  type="date"
                  defaultValue={startDate === "max" ? "" : startDate}
                  onBlur={(e) => setStartDate(e.target.value || "max")}
                  placeholder="Max"
                  style={{
                    width: '140px',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* End Date field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                  End:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: '140px',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Strategy Builder */}
      {activeTab === "strategy" && (
      <div
        onClick={() => {
          if (showDropdown) {
            setShowDropdown(false);
            setTickerInput("");
          }
        }}
        style={{
          padding: '0 16px 200px 16px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
        {/* Render elements */}
        {elements.length === 0 ? (
          <div style={{ padding: '8px 0px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                  {clipboard && (
                    <button
                      onClick={() => {
                        const cloned = deepCloneElement(clipboard);
                        saveToHistory([...elements, cloned]);
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
        ) : null}
        {elements.map((el, idx) => {
          if (el.type === "gate") {
            return (
              <GateCard
                key={el.id}
                element={el}
                onUpdate={(updated) => updateElement(el.id, updated)}
                onDelete={() => deleteElement(el.id)}
                onCopy={() => setClipboard(el)}
                clipboard={clipboard}
                depth={0}
                allElements={elements}
                validationErrors={validationErrors}
                definedVariables={definedVariables}
              />
            );
          } else if (el.type === "ticker") {
            return (
              <TickerCard
                key={el.id}
                element={el}
                onUpdate={(updated) => updateElement(el.id, updated)}
                onDelete={() => deleteElement(el.id)}
                onCopy={() => setClipboard(el)}
                depth={0}
                validationErrors={validationErrors}
                definedVariables={definedVariables}
              />
            );
          } else if (el.type === "weight") {
            return (
              <WeightCard
                key={el.id}
                element={el}
                onUpdate={(updated) => updateElement(el.id, updated)}
                onDelete={() => deleteElement(el.id)}
                onCopy={() => setClipboard(el)}
                clipboard={clipboard}
                initiallyOpen={idx === 0}
                depth={0}
                allElements={elements}
                validationErrors={validationErrors}
                definedVariables={definedVariables}
              />
            );
          }
          return null;
        })}
        </div>
      </div>
      )}

      {/* Variables Tab - MOVED to Library */}
      {false && (
        <div style={{ padding: '24px 32px' }}>
          <VariablesTab />
        </div>
      )}

      {/* Batch Tests Tab - MOVED to Library */}
      {false && (
        <div style={{ padding: '24px 32px' }}>
          <BatchTestsTab
            jobs={batchJobs}
            loading={batchLoading}
            onViewJob={async (job) => {
              if (!job.viewUrl) {
                alert('View URL not available for this job');
                return;
              }

              setLoadingResults(true);
              try {
                const response = await fetch(`${API_BASE}${job.viewUrl}`);
                const data = await response.json();

                if (!response.ok) {
                  throw new Error(data.error || 'Failed to fetch results');
                }

                setViewingResults({
                  jobId: job.id,
                  name: job.name,
                  summary: data.summary,
                  runs: data.runs,
                });
                setShowResultsViewer(true);
              } catch (err: any) {
                console.error('Error fetching results:', err);
                alert(`Failed to load results: ${err.message}`);
              } finally {
                setLoadingResults(false);
              }
            }}
            onDownloadCsv={(job) => {
              if (job.csvUrl) {
                // Download CSV file
                const link = document.createElement('a');
                link.href = `${API_BASE}${job.csvUrl}`;
                link.download = `${job.name.replace(/[^a-z0-9]/gi, '_')}_results.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } else {
                alert('CSV URL not available for this job');
              }
            }}
            onCancelJob={async (job) => {
              if (job.status !== 'running' && job.status !== 'queued') {
                alert('Can only cancel running or queued jobs');
                return;
              }

              if (!confirm(`Cancel batch job "${job.name}"?`)) {
                return;
              }

              try {
                const response = await fetch(`${API_BASE}/api/batch_backtest_strategy/${job.id}/cancel`, {
                  method: 'POST',
                  credentials: 'include',
                });

                if (!response.ok) {
                  const data = await response.json();
                  throw new Error(data.error || 'Failed to cancel job');
                }

                // Update job status locally
                const cancelledJob = {
                  ...job,
                  status: 'failed' as const,
                  error: 'Cancelled by user',
                  updatedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                };
                setBatchJobs(prev => prev.map(j => j.id === job.id ? cancelledJob : j));
                await putJob(cancelledJob);
              } catch (err: any) {
                console.error('Error cancelling job:', err);
                alert(`Failed to cancel job: ${err.message}`);
              }
            }}
          />
        </div>
      )}

      {/* Undefined Variables Alert Modal */}
      {showUndefinedAlert && (
        <div
          onClick={() => setShowUndefinedAlert(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: "100%",
              boxShadow: "0 20px 45px rgba(15,23,42,0.25)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: "#b00020" }}>
              Undefined Variables
            </div>
            <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5, marginBottom: 12 }}>
              {undefinedVariables.length === 1 ? "The following variable is" : "These variables are"} referenced in your
              strategy but not defined in the Variables library:
            </div>
            <div style={{ marginBottom: 16 }}>
              {undefinedVariables.map((v) => (
                <div key={v} style={{ fontSize: 14, fontWeight: 600, color: "#b00020", fontFamily: "monospace" }}>
                  ${v}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 16 }}>
              Add them under the <b>Variables</b> tab, then try again.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => setShowUndefinedAlert(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#1677ff",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Confirmation Modal */}
      {showBatchConfirm && batchConfirm && (
        <div
          onClick={() => {
            setShowBatchConfirm(false);
            setBatchConfirm(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 20px 45px rgba(15,23,42,0.25)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Run Batch Backtests?</div>
            <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>
              This strategy references variables with a combined grid of:
            </div>
            <div style={{ margin: "12px 0", fontSize: 14, fontWeight: 600 }}>
              {batchConfirm.detail.map((d) => `$${d.name} (${d.count})`).join(" × ")} ={" "}
              <span style={{ color: "#7f3dff" }}>{batchConfirm.total.toLocaleString()} backtests</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#bbb",
                  color: "#222",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setShowBatchConfirm(false);
                  setBatchConfirm(null);
                }}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#7f3dff",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                onClick={executeBatchBacktest}
                disabled={batchConfirm.total === 0}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Results Viewer Modal */}
      {showResultsViewer && viewingResults && (
        <div
          onClick={() => setShowResultsViewer(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 900,
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 20px 45px rgba(15,23,42,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{viewingResults.name} - Results</div>
              <button
                onClick={() => setShowResultsViewer(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#666",
                  padding: 0,
                  width: 32,
                  height: 32,
                }}
              >
                ×
              </button>
            </div>

            {/* Summary Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#f9fafb", padding: 16, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                  Total Runs
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>
                  {viewingResults.summary.totalRuns}
                </div>
              </div>
              <div style={{ background: "#f0fdf4", padding: 16, borderRadius: 8, border: "1px solid #bbf7d0" }}>
                <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                  Best Return
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>
                  {(viewingResults.summary.bestTotalReturn * 100).toFixed(2)}%
                </div>
              </div>
              <div style={{ background: "#fef2f2", padding: 16, borderRadius: 8, border: "1px solid #fecaca" }}>
                <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                  Worst Return
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#b91c1c" }}>
                  {(viewingResults.summary.worstTotalReturn * 100).toFixed(2)}%
                </div>
              </div>
              <div style={{ background: "#eff6ff", padding: 16, borderRadius: 8, border: "1px solid #bfdbfe" }}>
                <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                  Avg Return
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1e40af" }}>
                  {(viewingResults.summary.avgTotalReturn * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Results Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>
                      #
                    </th>
                    {viewingResults.runs[0] && Object.keys(viewingResults.runs[0].variables).map((varName) => (
                      <th key={varName} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>
                        ${varName}
                      </th>
                    ))}
                    <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                      Total Return
                    </th>
                    <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                      Sharpe Ratio
                    </th>
                    <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                      Max Drawdown
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {viewingResults.runs.map((run, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                        {idx + 1}
                      </td>
                      {Object.values(run.variables).map((value, vIdx) => (
                        <td key={vIdx} style={{ padding: "10px 12px", fontFamily: "monospace", color: "#111827" }}>
                          {value}
                        </td>
                      ))}
                      <td style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: run.metrics.totalReturn >= 0 ? "#15803d" : "#b91c1c",
                      }}>
                        {(run.metrics.totalReturn * 100).toFixed(2)}%
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>
                        {run.metrics.sharpeRatio?.toFixed(2) ?? 'N/A'}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#b91c1c" }}>
                        {run.metrics.maxDrawdown ? `${(run.metrics.maxDrawdown * 100).toFixed(2)}%` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

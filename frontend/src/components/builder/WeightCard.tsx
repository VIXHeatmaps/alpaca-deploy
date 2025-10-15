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
import type {
  Element,
  TickerElement,
  WeightElement,
} from "../../types/builder";
import type { ValidationError } from "../../utils/validation";
import {
  deepCloneElement,
} from "../../utils/builder";
import type { TickerMetadata } from "../../api/tickers";
import { TickerCard } from "./TickerCard";
import { GateCard } from "./GateCard";
import { ScaleCard } from "./ScaleCard";
import { SortCard } from "./SortCard";
import {
  createDefaultGateElement,
  createDefaultScaleElement,
  createDefaultSortElement,
  createDefaultWeightElement,
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
      const newWeight = createDefaultWeightElement(100, allElements);
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
  variableLists?: Array<{ name: string }>;
  variablesLoading?: boolean;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  onVariableCreated?: () => void;
}

export function WeightCard({ element, onUpdate, onDelete, onCopy, clipboard, initiallyOpen = false, depth = 0, showWeight = false, isWeightInvalid = false, allElements = [], validationErrors = [], variableLists = [], variablesLoading = false, tickerMetadata, metadataLoading, metadataError, onVariableCreated }: WeightCardProps & { initiallyOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [showDropdown, setShowDropdown] = useState(false);

  // Calculate if children weights add up to 100%
  const childrenWeightSum = element.children.reduce((sum, child) => sum + child.weight, 0);
  const areChildWeightsInvalid = element.weightMode === "defined" && element.children.length > 0 && childrenWeightSum !== 100;

  const handleAddElement = (newElement: Element) => {
    // Calculate default weight for new child
    const currentSum = element.children.reduce((sum, child) => sum + child.weight, 0);
    const defaultWeight = element.weightMode === "defined" ? Math.max(0, 100 - currentSum) : 100;
    newElement.weight = defaultWeight;
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

  // Zebra striping: even depths get light gray background
  const bgColor = depth % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)';

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div
        onClick={(e) => {
          // Close dropdowns when clicking anywhere on the card
          if (showDropdown) {
            setShowDropdown(false);
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
                          showWeight={element.weightMode === "defined"}
                          isWeightInvalid={areChildWeightsInvalid}
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
                          showWeight={element.weightMode === "defined"}
                          isWeightInvalid={areChildWeightsInvalid}
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
                          showWeight={element.weightMode === "defined"}
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
                          showWeight={element.weightMode === "defined"}
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

import { Copy } from "lucide-react";
import { useState, useRef } from "react";
import type { TickerElement } from "../../types/builder";
import type { TickerMetadata } from "../../api/tickers";
import type { ValidationError } from "../../utils/validation";
import { hasFieldError, hasUndefinedVariableInField } from "../../utils/builder";
import { VariablePopover } from "./VariablePopover";
import * as variablesApi from "../../api/variables";
import type { VarType } from "../../api/variables";

export interface TickerCardProps {
  element: TickerElement;
  onUpdate: (updated: TickerElement) => void;
  onDelete: () => void;
  onCopy?: () => void;
  depth?: number;
  showWeight?: boolean;
  isWeightInvalid?: boolean;
  validationErrors?: ValidationError[];
  variableLists?: Array<{ name: string }>;
  variablesLoading?: boolean;
  tickerMetadata?: Map<string, TickerMetadata>;
  metadataLoading?: boolean;
  metadataError?: string | null;
  onVariableCreated?: () => void;
}

export function TickerCard({
  element,
  onUpdate,
  onDelete,
  onCopy,
  depth = 0,
  showWeight = true,
  isWeightInvalid = false,
  validationErrors = [],
  variableLists = [],
  variablesLoading = false,
  tickerMetadata,
  metadataLoading = false,
  metadataError = null,
  onVariableCreated,
}: TickerCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasUndefinedVar = hasUndefinedVariableInField(element.ticker, variableLists, variablesLoading);
  const hasValidationError = hasFieldError(element.id, "ticker", validationErrors);
  const bgColor = depth % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.02)";
  const symbol = element.ticker?.toUpperCase() ?? "";
  const resolvedMetadata = symbol && tickerMetadata ? tickerMetadata.get(symbol) : undefined;
  const resolvedName = resolvedMetadata?.name?.trim() ? resolvedMetadata.name.trim() : null;
  const metadataReady = !!tickerMetadata && !metadataLoading && !metadataError;
  // Only check ticker metadata if it's not a variable reference
  const isVariable = element.ticker?.trim().startsWith("$");
  const isUnknownTicker =
    metadataReady &&
    symbol.length > 0 &&
    !isVariable &&  // Don't check metadata for variables
    !tickerMetadata.has(symbol);
  const showErrorBorder = hasValidationError || hasUndefinedVar || isUnknownTicker;
  const tickerTooltip = hasUndefinedVar
    ? `Variable ${element.ticker} is not defined in Variables tab. Double-click to define.`
    : isUnknownTicker
      ? `${symbol} not found in Alpaca asset list`
      : resolvedName || undefined;

  const handleDoubleClick = () => {
    if (hasUndefinedVar) {
      setShowPopover(true);
    }
  };

  const handleSaveVariable = async (values: string[], type: VarType) => {
    try {
      // Get variable name without $ prefix and normalize to lowercase
      const varName = element.ticker.startsWith("$")
        ? element.ticker.slice(1).toLowerCase()
        : element.ticker.toLowerCase();

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

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "8px",
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
              border: isWeightInvalid ? "2px solid #ef4444" : "1px solid #d1d5db",
              outline: "none",
              padding: "4px 6px",
              background: isWeightInvalid ? "#fee2e2" : "#fff",
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

      <input
        ref={inputRef}
        type="text"
        value={element.ticker}
        onChange={(e) => onUpdate({ ...element, ticker: e.target.value.toUpperCase() })}
        onDoubleClick={handleDoubleClick}
        style={{
          border: showErrorBorder ? "2px solid #ef4444" : "1px solid #d1d5db",
          outline: "none",
          padding: "4px 8px",
          background: showErrorBorder ? "#fee2e2" : "#fff",
          fontSize: "13px",
          color: showErrorBorder ? "#b91c1c" : "#111827",
          width: `${(element.ticker.length || 1) * 9 + 20}px`,
          minWidth: "60px",
          flexShrink: 0,
          borderRadius: "4px",
          cursor: hasUndefinedVar ? "pointer" : "text",
        }}
        className="focus:ring-2 focus:ring-blue-500"
        placeholder="TICKER"
        title={tickerTooltip}
      />

      {showPopover && inputRef.current && (
        <VariablePopover
          variableName={element.ticker.startsWith("$") ? element.ticker.slice(1) : element.ticker}
          anchorEl={inputRef.current}
          onSave={handleSaveVariable}
          onClose={() => setShowPopover(false)}
        />
      )}

      <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
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
  );
}

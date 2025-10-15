import { Copy } from "lucide-react";
import type { TickerElement } from "../../types/builder";
import type { TickerMetadata } from "../../api/tickers";
import type { ValidationError } from "../../utils/validation";
import { TickerInput } from "./shared/TickerInput";

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
  const bgColor = depth % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.02)";

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

      <TickerInput
        value={element.ticker}
        onChange={(ticker) => onUpdate({ ...element, ticker })}
        elementId={element.id}
        field="ticker"
        variableLists={variableLists}
        variablesLoading={variablesLoading}
        tickerMetadata={tickerMetadata}
        metadataLoading={metadataLoading}
        metadataError={metadataError}
        validationErrors={validationErrors}
        onVariableCreated={onVariableCreated}
        placeholder="TICKER"
        minWidth={60}
      />

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

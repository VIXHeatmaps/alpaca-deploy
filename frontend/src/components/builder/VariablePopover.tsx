import { useEffect, useRef, useState } from "react";
import type { VarType } from "../../api/variables";

interface VariablePopoverProps {
  variableName: string;
  anchorEl: HTMLElement;
  onSave: (values: string[], type: VarType) => void;
  onClose: () => void;
}

export function VariablePopover({
  variableName,
  anchorEl,
  onSave,
  onClose,
}: VariablePopoverProps) {
  const [values, setValues] = useState("");
  const [type, setType] = useState<VarType>("ticker");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position popover next to anchor element
  useEffect(() => {
    if (popoverRef.current && anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect();
      const popover = popoverRef.current;

      // Position below and aligned with left edge of anchor
      popover.style.top = `${anchorRect.bottom + 8}px`;
      popover.style.left = `${anchorRect.left}px`;
    }
  }, [anchorEl]);

  // Click-away detection
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) {
        handleSave();
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [values, type, anchorEl]);

  const handleSave = () => {
    if (values.trim()) {
      const valuesList = values
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      if (valuesList.length > 0) {
        onSave(valuesList, type);
      }
    }
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        zIndex: 1000,
        backgroundColor: "#fff",
        border: "1px solid #d1d5db",
        borderRadius: "6px",
        padding: "12px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        minWidth: "240px",
        maxWidth: "320px",
      }}
    >
      <div style={{ marginBottom: "8px" }}>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            color: "#6b7280",
            marginBottom: "4px",
          }}
        >
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as VarType)}
          style={{
            width: "100%",
            padding: "4px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "13px",
          }}
        >
          <option value="ticker">Ticker</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
        </select>
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            color: "#6b7280",
            marginBottom: "4px",
          }}
        >
          Values (comma or newline separated)
        </label>
        <textarea
          autoFocus
          value={values}
          onChange={(e) => setValues(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="AAPL, MSFT, GOOGL"
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "11px",
          color: "#9ca3af",
        }}
      >
        Click away or press Escape to save
      </div>
    </div>
  );
}

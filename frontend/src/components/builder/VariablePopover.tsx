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
  const [isSaving, setIsSaving] = useState(false);
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

  // Click-away detection - cancel without saving if already saving
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) {
        if (!isSaving) {
          onClose(); // Just close, don't save on click-away
        }
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [isSaving, anchorEl, onClose]);

  const handleSave = async () => {
    if (isSaving) return; // Prevent double-save
    if (!values.trim()) {
      onClose();
      return;
    }

    const valuesList = values
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (valuesList.length === 0) {
      onClose();
      return;
    }

    // Save with loading state
    setIsSaving(true);
    try {
      await onSave(valuesList, "ticker");
      // Wait a tiny bit to ensure state propagates
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      if (!isSaving) {
        onClose();
      }
    }
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
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder={isSaving ? "Saving..." : "AAPL, MSFT, GOOGL"}
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "monospace",
            resize: "vertical",
            opacity: isSaving ? 0.6 : 1,
            cursor: isSaving ? "wait" : "text",
          }}
        />
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "11px",
          color: isSaving ? "#3b82f6" : "#9ca3af",
          fontWeight: isSaving ? 500 : 400,
        }}
      >
        {isSaving ? "Saving variable..." : "Press Tab or Enter to save, Escape to cancel"}
      </div>
    </div>
  );
}

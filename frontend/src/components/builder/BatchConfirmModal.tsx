interface BatchConfirmDetail {
  name: string;
  count: number;
  values: string[];
}

export interface BatchConfirmData {
  total: number;
  detail: BatchConfirmDetail[];
}

interface BatchConfirmModalProps {
  open: boolean;
  confirm: BatchConfirmData | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BatchConfirmModal({ open, confirm, onCancel, onConfirm }: BatchConfirmModalProps) {
  if (!open || !confirm) return null;

  return (
    <div
      onClick={onCancel}
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
        onClick={(event) => event.stopPropagation()}
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
          {confirm.detail.map((detail) => `$${detail.name} (${detail.count})`).join(" × ")} ={" "}
          <span style={{ color: "#7f3dff" }}>{confirm.total.toLocaleString()} backtests</span>
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
            onClick={onCancel}
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
            onClick={onConfirm}
            disabled={confirm.total === 0}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

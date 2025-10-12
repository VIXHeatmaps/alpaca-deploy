interface UndefinedVariablesModalProps {
  open: boolean;
  variables: string[];
  onClose: () => void;
}

export function UndefinedVariablesModal({ open, variables, onClose }: UndefinedVariablesModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
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
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 20px 45px rgba(15,23,42,0.25)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: "#b00020" }}>
          Undefined Variables
        </div>
        <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5, marginBottom: 12 }}>
          {variables.length === 1
            ? "The following variable is referenced in your strategy but not defined in the Variables library:"
            : "These variables are referenced in your strategy but not defined in the Variables library:"}
        </div>
        <div style={{ marginBottom: 16 }}>
          {variables.map((variable) => (
            <div key={variable} style={{ fontSize: 14, fontWeight: 600, color: "#b00020", fontFamily: "monospace" }}>
              ${variable}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 16 }}>
          Add them under the <b>Variables</b> tab, then try again.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={onClose}
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
  );
}

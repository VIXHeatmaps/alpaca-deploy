import { useState, useEffect } from "react";
import type { VarType } from "../types/variables";
import {
  normalizeVarName,
  loadVarLists,
  normalizeValues,
  hasBeenMigrated,
  markAsMigrated,
  clearLocalStorage,
} from "../types/variables";
import * as variablesApi from "../api/variables";

type VarList = {
  id?: number;
  name: string;
  type: VarType;
  values: string[];
};

export function VariablesTab() {
  const [vars, setVars] = useState<VarList[]>([]);
  const [sel, setSel] = useState<number>(-1);
  const [rawText, setRawText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState<boolean>(false);

  // Load variables from DB on mount
  useEffect(() => {
    loadVariables();
  }, []);

  const loadVariables = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if we need to migrate from localStorage
      if (!hasBeenMigrated()) {
        const localVars = loadVarLists();
        if (localVars.length > 0) {
          await migrateFromLocalStorage(localVars);
          return;
        } else {
          markAsMigrated(); // Mark as migrated even if empty
        }
      }

      // Load from API
      const lists = await variablesApi.getAllVariableLists();
      setVars(lists);
      setSel(lists.length > 0 ? 0 : -1);
    } catch (err: any) {
      console.error("Failed to load variables:", err);
      setError(err.message || "Failed to load variables");
    } finally {
      setLoading(false);
    }
  };

  const migrateFromLocalStorage = async (localVars: VarList[]) => {
    try {
      setMigrating(true);
      console.log(`Migrating ${localVars.length} variables from localStorage to database...`);

      const result = await variablesApi.bulkImportVariableLists(localVars);
      console.log(`Successfully migrated ${result.imported} variables`);

      markAsMigrated();
      clearLocalStorage();

      setVars(result.lists);
      setSel(result.lists.length > 0 ? 0 : -1);
    } catch (err: any) {
      console.error("Migration failed:", err);
      setError(`Migration failed: ${err.message}`);
      // Fall back to localStorage if migration fails
      setVars(localVars);
      setSel(localVars.length > 0 ? 0 : -1);
    } finally {
      setMigrating(false);
      setLoading(false);
    }
  };

  // Keep rawText in sync with selected variable
  useEffect(() => {
    const v = sel >= 0 ? vars[sel] : null;
    setRawText(v ? v.values.join("\n") : "");
  }, [sel, vars]);

  const addVar = async () => {
    const existing = new Set(vars.map((v) => v.name));
    const base = "newvar";
    let name = base,
      i = 1;
    while (existing.has(name)) name = base + ++i;

    try {
      const created = await variablesApi.createVariableList({
        name,
        type: "ticker",
        values: [],
      });

      const next = [...vars, created];
      setVars(next);
      setSel(next.length - 1);
    } catch (err: any) {
      console.error("Failed to create variable:", err);
      setError(err.message || "Failed to create variable");
    }
  };

  const removeVar = async (idx: number) => {
    if (idx < 0) return;
    const varToDelete = vars[idx];
    if (!confirm(`Remove variable "$${varToDelete.name}"?`)) return;

    try {
      if (varToDelete.id) {
        await variablesApi.deleteVariableList(varToDelete.id);
      }

      const next = vars.filter((_, i) => i !== idx);
      setVars(next);
      setSel(next.length ? Math.min(idx, next.length - 1) : -1);
    } catch (err: any) {
      console.error("Failed to delete variable:", err);
      setError(err.message || "Failed to delete variable");
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input is focused
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      if (e.key === "ArrowDown" && sel < vars.length - 1) {
        e.preventDefault();
        setSel(sel + 1);
      } else if (e.key === "ArrowUp" && sel > 0) {
        e.preventDefault();
        setSel(sel - 1);
      } else if (e.key === "Delete" && sel >= 0 && vars[sel]) {
        e.preventDefault();
        removeVar(sel);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        addVar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sel, vars]);

  const commitName = async (idx: number, raw: string) => {
    const norm = normalizeVarName(raw);
    const varToUpdate = vars[idx];

    if (!varToUpdate || norm === varToUpdate.name) return;

    try {
      if (varToUpdate.id) {
        const updated = await variablesApi.updateVariableList(varToUpdate.id, { name: norm });
        setVars((vs) => vs.map((v, i) => (i === idx ? updated : v)));
      } else {
        // Local only (shouldn't happen)
        setVars((vs) => vs.map((v, i) => (i === idx ? { ...v, name: norm } : v)));
      }
    } catch (err: any) {
      console.error("Failed to update variable name:", err);
      setError(err.message || "Failed to update variable name");
    }
  };

  const applyValuesFromRaw = async (idx: number) => {
    if (idx < 0) return;
    const varToUpdate = vars[idx];
    if (!varToUpdate) return;

    const vals = normalizeValues(varToUpdate.type, rawText || "");
    const deduped = Array.from(new Set(vals));

    try {
      if (varToUpdate.id) {
        const updated = await variablesApi.updateVariableList(varToUpdate.id, {
          values: deduped,
        });
        setVars((vs) => vs.map((v, i) => (i === idx ? updated : v)));
      } else {
        // Local only (shouldn't happen)
        setVars((vs) => vs.map((v, i) => (i === idx ? { ...v, values: deduped } : v)));
      }
    } catch (err: any) {
      console.error("Failed to update variable values:", err);
      setError(err.message || "Failed to update variable values");
    }
  };


  const selected = sel >= 0 ? vars[sel] : null;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 120px)",
          color: "#9ca3af",
          fontSize: 14,
        }}
      >
        {migrating ? "Migrating variables from localStorage..." : "Loading variables..."}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        gap: 16,
        padding: 16,
        maxWidth: 1200,
        height: "calc(100vh - 120px)",
      }}
    >
      {/* Error banner */}
      {error && (
        <div
          style={{
            gridColumn: "1 / -1",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: 12,
            color: "#dc2626",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: "bold",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Left sidebar: Variable list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderRight: "1px solid #e5e7eb",
          paddingRight: 16,
          maxHeight: "calc(100vh - 120px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Variables</div>
          <button
            onClick={addVar}
            title="Cmd/Ctrl + N"
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2563eb")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#3b82f6")}
          >
            + Add
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            overflowY: "auto",
            flex: 1,
          }}
          className="scrollable-list"
        >
          {vars.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
                padding: "32px 16px",
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              No variables yet.
              <br />
              <br />
              Click <strong style={{ color: "#6b7280" }}>+ Add</strong> or press{" "}
              <strong style={{ color: "#6b7280" }}>Cmd+N</strong>
            </div>
          ) : (
            vars.map((v, i) => (
              <button
                key={v.id || v.name + i}
                onClick={() => setSel(i)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid " + (sel === i ? "#3b82f6" : "transparent"),
                  background: sel === i ? "#eff6ff" : "transparent",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: sel === i ? 500 : 400,
                  color: sel === i ? "#1e40af" : "#374151",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (sel !== i) {
                    e.currentTarget.style.background = "#f9fafb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (sel !== i) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div style={{ fontFamily: "ui-monospace, monospace" }}>${v.name}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: sel === i ? "#3b82f6" : "#9ca3af",
                    marginTop: 2,
                  }}
                >
                  {v.values.length} value{v.values.length !== 1 ? "s" : ""}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Editor */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          paddingLeft: 4,
        }}
      >
        {!selected ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#9ca3af",
              fontSize: 14,
            }}
          >
            Select a variable to edit
          </div>
        ) : (
          <>
            {/* Header with name and actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: 12,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <input
                value={`$${selected.name}`}
                onChange={(e) => {
                  const raw = e.target.value.startsWith("$")
                    ? e.target.value.slice(1)
                    : e.target.value;
                  commitName(sel, raw);
                }}
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  border: "1px solid transparent",
                  outline: "none",
                  padding: "6px 10px",
                  borderRadius: 4,
                  background: "#f9fafb",
                  fontFamily: "ui-monospace, monospace",
                  color: "#1e40af",
                  minWidth: 200,
                  transition: "all 0.15s ease",
                }}
                onFocus={(e) => {
                  e.target.style.background = "#fff";
                  e.target.style.borderColor = "#3b82f6";
                }}
                onBlur={(e) => {
                  e.target.style.background = "#f9fafb";
                  e.target.style.borderColor = "transparent";
                }}
                placeholder="$variableName"
              />
              <button
                onClick={() => removeVar(sel)}
                title="Delete key"
                style={{
                  background: "transparent",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#fef2f2";
                  e.currentTarget.style.borderColor = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "#fecaca";
                }}
              >
                Remove
              </button>
            </div>

            {/* Values editor */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#374151",
                  }}
                >
                  Values
                  <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: 8 }}>
                    (space, comma, or line separated)
                  </span>
                </label>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  <strong style={{ color: "#6b7280" }}>{selected.values.length}</strong> saved
                </span>
              </div>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                onBlur={() => applyValuesFromRaw(sel)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    applyValuesFromRaw(sel);
                  }
                }}
                placeholder=""
                style={{
                  width: "100%",
                  minHeight: 300,
                  maxHeight: "calc(100vh - 400px)",
                  padding: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  lineHeight: 1.8,
                  resize: "vertical",
                  outline: "none",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#3b82f6";
                  e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                }}
                onBlurCapture={(e) => {
                  e.target.style.borderColor = "#d1d5db";
                  e.target.style.boxShadow = "none";
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  textAlign: "right",
                }}
              >
                {rawText.split("\n").filter((l) => l.trim()).length} lines
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

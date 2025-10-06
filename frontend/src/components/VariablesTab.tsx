import React, { useState, useEffect } from "react";
import type { VarType, VarList } from "../types/variables";
import {
  normalizeVarName,
  loadVarLists,
  saveVarLists,
  normalizeValues,
  exportVarsJson,
  importVarsJson,
} from "../types/variables";

export function VariablesTab() {
  // Local UI styles (kept minimal & consistent with app)
  const box: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 10,
    padding: 10,
    background: "#fff",
  };
  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 6,
    color: "#444",
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #cfcfcf",
    borderRadius: 6,
  };
  const select: React.CSSProperties = { ...input, appearance: "auto" as const };
  const btn: React.CSSProperties = {
    background: "#1677ff",
    color: "#fff",
    border: 0,
    borderRadius: 8,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const [vars, setVars] = useState<VarList[]>(() => loadVarLists());
  const [sel, setSel] = useState<number>(vars.length ? 0 : -1);

  // BUFFER: raw textarea text for the currently selected var
  const [rawText, setRawText] = useState<string>("");

  // Persist whenever vars changes
  useEffect(() => {
    saveVarLists(vars);
  }, [vars]);

  // Keep rawText in sync with the selected variable (show values as lines)
  useEffect(() => {
    const v = sel >= 0 ? vars[sel] : null;
    setRawText(v ? v.values.join("\n") : "");
  }, [sel, vars]);

  // Helpers
  const addVar = () => {
    const existing = new Set(vars.map((v) => v.name));
    const base = "newvar";
    let name = base,
      i = 1;
    while (existing.has(name)) name = base + ++i;

    const next = [...vars, { name, type: "ticker" as VarType, values: [] }];
    setVars(next);
    setSel(next.length - 1);
  };

  const removeVar = (idx: number) => {
    if (idx < 0) return;
    const next = vars.filter((_, i) => i !== idx);
    setVars(next);
    setSel(next.length ? Math.min(idx, next.length - 1) : -1);
  };

  const duplicateVar = (idx: number) => {
    if (idx < 0) return;
    const v = vars[idx];
    const existing = new Set(vars.map((x) => x.name));
    const base = v.name || "copy";
    let name = base,
      i = 1;
    while (existing.has(name)) name = base + ++i;

    const next = [
      ...vars.slice(0, idx + 1),
      { ...v, name } as VarList,
      ...vars.slice(idx + 1),
    ];
    setVars(next);
    setSel(idx + 1);
  };

  const commitName = (idx: number, raw: string) => {
    const norm = normalizeVarName(raw);
    setVars((vs) =>
      vs.map((v, i) =>
        i === idx
          ? {
              ...v,
              name: norm,
            }
          : v
      )
    );
  };

  const commitType = (idx: number, type: VarType) => {
    setVars((vs) => vs.map((v, i) => (i === idx ? { ...v, type } : v)));
    // keep current text; values will be re-parsed on blur/apply using new type
  };

  // APPLY: parse rawText into normalized values for the selected var
  const applyValuesFromRaw = (idx: number) => {
    if (idx < 0) return;
    const v = vars[idx];
    const vals = normalizeValues(v.type, rawText || "");
    const deduped = Array.from(new Set(vals));
    setVars((vs) => vs.map((x, i) => (i === idx ? { ...x, values: deduped } : x)));
    // Keep rawText as typed; it will reflect the canonical list after next selection change
  };

  // Export / Import
  const exportJson = () => {
    const blob = new Blob([exportVarsJson(vars)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "variables.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRef = React.useRef<HTMLInputElement>(null);
  const importJson = () => importRef.current?.click();

  const onImportChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const arr = importVarsJson(String(reader.result || ""));
      if (!arr.length) {
        alert("No variables found in file.");
        return;
      }
      // Merge by name (overwrite existing of same name), otherwise append
      const byName = new Map<string, VarList>(vars.map((v) => [v.name, v]));
      for (const v of arr) byName.set(v.name, v);
      const next = Array.from(byName.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setVars(next);
      const newSel = next.length ? next.findIndex((v) => v.name === arr[0].name) : -1;
      setSel(newSel);
    };
    reader.readAsText(f);
    if (importRef.current) importRef.current.value = "";
  };

  // Quick examples to seed lists
  const quickAddExamples = () => {
    const seed: VarList[] = [
      { name: "index", type: "ticker", values: ["DIA", "SPY", "QQQ"] },
      { name: "rsi5", type: "number", values: Array.from({ length: 21 }, (_, i) => String(i * 5)) }, // 0..100 step 5
    ];
    const byName = new Map<string, VarList>(vars.map((v) => [v.name, v]));
    for (const v of seed) byName.set(v.name, v);
    const next = Array.from(byName.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    setVars(next);
    if (next.length && sel < 0) setSel(0);
  };

  const selected = sel >= 0 ? vars[sel] : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
      {/* Left: list */}
      <div style={box}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <div style={{ fontWeight: 800 }}>Variables</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#0a7" }} onClick={addVar}>
              Add
            </button>
            <button style={{ ...btn, background: "#444" }} onClick={exportJson}>
              Export
            </button>
            <button style={{ ...btn, background: "#555" }} onClick={importJson}>
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              onChange={onImportChange}
              style={{ display: "none" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: 6, maxHeight: "65vh", overflowY: "auto" }}>
          {vars.length === 0 && (
            <div style={{ fontSize: 12, color: "#666" }}>
              No variables yet. Click <b>Add</b> or use <b>Examples</b> below.
            </div>
          )}

          {vars.map((v, i) => (
            <button
              key={v.name + i}
              onClick={() => setSel(i)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid " + (sel === i ? "#1677ff" : "#e6e6e6"),
                background: sel === i ? "#eef4ff" : "#fff",
                cursor: "pointer",
                fontWeight: sel === i ? 700 : 600,
              }}
              title={`$${v.name}`}
            >
              {`$${v.name}`}{" "}
              <span style={{ color: "#666", fontWeight: 400 }}>
                ({v.type}, {v.values.length})
              </span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          <button style={{ ...btn, background: "#6b7280" }} onClick={quickAddExamples}>
            Examples
          </button>
          {selected && (
            <>
              <button
                style={{ ...btn, background: "#f59e0b" }}
                onClick={() => duplicateVar(sel)}
              >
                Duplicate
              </button>
              <button
                style={{ ...btn, background: "#b33" }}
                onClick={() => removeVar(sel)}
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right: editor */}
      <div style={box}>
        {!selected ? (
          <div style={{ color: "#666" }}>Select a variable to edit.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
              <div>
                <div style={label}>Name</div>
                <input
                  style={input}
                  value={`$${selected.name}`}
                  onChange={(e) => {
                    const raw = e.target.value.startsWith("$")
                      ? e.target.value.slice(1)
                      : e.target.value;
                    commitName(sel, raw);
                  }}
                />
              </div>
              <div>
                <div style={label}>Type</div>
                <select
                  style={select}
                  value={selected.type}
                  onChange={(e) => commitType(sel, e.target.value as VarType)}
                >
                  <option value="ticker">ticker</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                </select>
              </div>
            </div>

            <div>
              <div style={label}>Values (paste list; commas, spaces, or new lines)</div>
              <textarea
                style={{
                  ...input,
                  minHeight: 160,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                onBlur={() => applyValuesFromRaw(sel)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    applyValuesFromRaw(sel);
                  }
                }}
                placeholder={
                  selected.type === "ticker"
                    ? "e.g. SPY, QQQ, DIA"
                    : selected.type === "number"
                    ? "e.g. 0 5 10 15 ... 100"
                    : "e.g. 2020-01-01 2024-12-31 max"
                }
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <button
                  style={{ ...btn, background: "#0a7" }}
                  onClick={() => applyValuesFromRaw(sel)}
                >
                  Apply
                </button>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Tip: paste your list and click <b>Apply</b> (or press{" "}
                  <b>Ctrl/Cmd+Enter</b>). Stored: <b>{selected.values.length}</b> items
                  (duplicates removed).
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Variable lists (Stage 2): local persistence + import/export.
 * Names are stored WITHOUT the leading "$" (normalized to lowercase). UI shows the "$".
 */

export type VarType = "ticker" | "number" | "date";

export type VarList = {
  name: string;
  type: VarType;
  values: string[];
};

const VARS_KEY = "vars_v1";

// Case-insensitive, allow any normal characters after the $ (we normalize on save)
export function normalizeVarName(input: string): string {
  if (!input) return "";
  const s = String(input).trim();
  const noDollar = s.startsWith("$") ? s.slice(1) : s;
  return noDollar.toLowerCase();
}

export function loadVarLists(): VarList[] {
  try {
    const raw = localStorage.getItem(VARS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];

    return arr
      .map((v: unknown) => {
        if (!v || typeof v !== "object") return null;
        const obj = v as Record<string, unknown>;
        return {
          name: normalizeVarName(typeof obj?.name === "string" ? obj.name : ""),
          type:
            obj?.type === "ticker" || obj?.type === "number" || obj?.type === "date"
              ? (obj.type as VarType)
              : ("ticker" as VarType),
          values: Array.isArray(obj?.values) ? obj.values.map((x: unknown) => String(x)) : [],
        };
      })
      .filter((v): v is VarList => v !== null && !!v.name);
  } catch {
    return [];
  }
}

export function saveVarLists(list: VarList[]) {
  const cleaned = (list || []).map((v) => ({
    name: normalizeVarName(v.name),
    type: v.type,
    values: Array.isArray(v.values) ? v.values.map(String) : [],
  }));
  localStorage.setItem(VARS_KEY, JSON.stringify(cleaned));
}

function dedupe<T>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = String(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

// Turn a pasted blob into a list of values based on var type.
// (We still allow later filtering/ignoring at use-time.)
export function normalizeValues(type: VarType, text: string): string[] {
  const parts = (text || "")
    .split(/[\s,;\n\r\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (type === "ticker") {
    // Basic ticker constraints; keep light for now.
    return dedupe(
      parts
        .map((s) => s.toUpperCase())
        .filter((s) => /^[A-Z0-9._-]{1,12}$/.test(s))
    );
  }

  if (type === "number") {
    return dedupe(parts.filter((s) => !Number.isNaN(Number(s))));
  }

  // date: simple acceptance of YYYY-MM-DD or 'max'
  return dedupe(
    parts.filter(
      (s) => s.toLowerCase() === "max" || /^\d{4}-\d{2}-\d{2}$/.test(s)
    )
  );
}

/* Quick helpers for JSON import/export (used by VariablesTab) */
export function exportVarsJson(vars: VarList[]): string {
  const payload = vars.map((v) => ({
    name: normalizeVarName(v.name),
    type: v.type,
    values: v.values,
  }));
  return JSON.stringify(payload, null, 2);
}

export function importVarsJson(jsonText: string): VarList[] {
  try {
    const arr = JSON.parse(jsonText);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v: unknown) => {
        if (!v || typeof v !== "object") return null;
        const obj = v as Record<string, unknown>;
        return {
          name: normalizeVarName(typeof obj?.name === "string" ? obj.name : ""),
          type:
            obj?.type === "ticker" || obj?.type === "number" || obj?.type === "date"
              ? (obj.type as VarType)
              : ("ticker" as VarType),
          values: Array.isArray(obj?.values) ? obj.values.map((x: unknown) => String(x)) : [],
        };
      })
      .filter((v): v is VarList => v !== null && !!v.name);
  } catch {
    return [];
  }
}

import { FlowEdge, FlowNode } from './types';

export const clampNumber = (val: any, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

export const sanitizedVariables = (vars: Array<{ name: string; values: string[] }> | undefined) =>
  (vars || []).map((v) => ({
    name: String(v?.name || 'var'),
    values: Array.isArray(v?.values) ? v!.values.map((x) => String(x)) : [],
  }));

export const buildSummary = (runs: Array<{ metrics: Record<string, number> }>, totalRuns: number) => {
  if (!runs.length) {
    return {
      totalRuns,
      avgTotalReturn: 0,
      bestTotalReturn: 0,
      worstTotalReturn: 0,
    };
  }
  let sum = 0;
  let best = -Infinity;
  let worst = Infinity;
  for (const r of runs) {
    const totalReturn = r.metrics.totalReturn ?? 0;
    sum += totalReturn;
    if (totalReturn > best) best = totalReturn;
    if (totalReturn < worst) worst = totalReturn;
  }
  return {
    totalRuns,
    avgTotalReturn: Number((sum / runs.length).toFixed(4)),
    bestTotalReturn: Number(best.toFixed(4)),
    worstTotalReturn: Number(worst.toFixed(4)),
  };
};

export const generateAllAssignments = (vars: Array<{ name: string; values: string[] }>): Array<Record<string, string>> => {
  const out: Array<Record<string, string>> = [];
  if (!vars.length) return out;
  const helper = (idx: number, current: Record<string, string>) => {
    if (idx === vars.length) {
      out.push({ ...current });
      return;
    }
    const v = vars[idx];
    if (!v) return;
    const values = v.values.length ? v.values : [''];
    for (const val of values) {
      current[v.name] = String(val);
      helper(idx + 1, current);
    }
    delete current[v.name];
  };
  helper(0, {});
  return out;
};

const normalizeVarToken = (input: string): string => {
  const trimmed = input.trim();
  return trimmed.startsWith('$') ? trimmed.slice(1).toLowerCase() : trimmed.toLowerCase();
};

export const replaceVariableTokens = (value: any, vars: Record<string, string>): any => {
  if (Array.isArray(value)) return value.map((item) => replaceVariableTokens(item, vars));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceVariableTokens(v, vars);
    return out;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('$')) {
      const key = normalizeVarToken(trimmed);
      if (vars[key] !== undefined) return vars[key];
    }
  }
  return value;
};

export const applyVariablesToNodes = (nodes: FlowNode[], assignment: Record<string, string>): FlowNode[] => {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(assignment)) normalized[normalizeVarToken(k)] = String(v);
  return nodes.map((node) => ({
    ...node,
    data: replaceVariableTokens(node.data, normalized),
  }));
};

export const applyVariablesToElements = (elements: any[], assignment: Record<string, string>): any[] => {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(assignment)) normalized[normalizeVarToken(k)] = String(v);
  return elements.map((element) => replaceVariableTokens(element, normalized));
};

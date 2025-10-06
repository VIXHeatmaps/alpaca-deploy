/**
 * Variable detection and extraction utilities for VerticalUI2
 */

import { normalizeVarName } from "../types/variables";

export const VARIABLE_REGEX = /\$[A-Za-z0-9_]+/g;
export const VARIABLE_TOKEN_RE = /^\$[A-Za-z0-9_]+$/;

export const normalizeVariableToken = (token: string): string =>
  normalizeVarName(token.replace("$", ""));

/**
 * Extract all variables from a list of strings
 */
export const extractVariablesFromStrings = (strings: string[]): string[] => {
  const found = new Set<string>();
  for (const s of strings) {
    const matches = s.match(VARIABLE_REGEX);
    if (!matches) continue;
    for (const raw of matches) {
      const norm = normalizeVariableToken(raw);
      if (norm) found.add(norm);
    }
  }
  return Array.from(found);
};

/**
 * Extract all string/number values from a single element that could contain variables
 */
export const extractStringsFromElement = (element: any): string[] => {
  const values: string[] = [];

  const push = (v: unknown) => {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) values.push(trimmed);
    } else if (typeof v === "number" && Number.isFinite(v)) {
      values.push(String(v));
    }
  };

  if (!element) return values;

  // Extract based on element type
  if (element.type === "ticker") {
    push(element.ticker);
    push(element.weight);
  } else if (element.type === "gate") {
    push(element.name);
    push(element.weight);

    // Extract from conditions array (new format)
    if (element.conditions && Array.isArray(element.conditions)) {
      for (const cond of element.conditions) {
        push(cond.ticker);
        push(cond.period);
        push(cond.threshold);
        push(cond.rightTicker);
        push(cond.rightPeriod);
      }
    }
    // Backward compatibility: extract from single condition (old format)
    else if (element.condition) {
      push(element.condition.ticker);
      push(element.condition.period);
      push(element.condition.threshold);
      push(element.condition.rightTicker);
      push(element.condition.rightPeriod);
    }

    // Recurse into children
    if (Array.isArray(element.thenChildren)) {
      for (const child of element.thenChildren) {
        values.push(...extractStringsFromElement(child));
      }
    }
    if (Array.isArray(element.elseChildren)) {
      for (const child of element.elseChildren) {
        values.push(...extractStringsFromElement(child));
      }
    }
  } else if (element.type === "weight") {
    push(element.name);
    push(element.weight);

    // Recurse into children
    if (Array.isArray(element.children)) {
      for (const child of element.children) {
        values.push(...extractStringsFromElement(child));
      }
    }
  }

  return values;
};

/**
 * Extract all strings from an array of elements
 */
export const extractStringsFromElements = (elements: any[]): string[] => {
  const allStrings: string[] = [];
  for (const element of elements) {
    allStrings.push(...extractStringsFromElement(element));
  }
  return allStrings;
};

/**
 * Generate all combinations of variable assignments
 */
export const generateAssignments = (
  detail: Array<{ name: string; values: string[] }>,
  limit: number
): { assignments: Array<Record<string, string>>; truncated: boolean } => {
  const assignments: Array<Record<string, string>> = [];
  let truncated = false;

  if (!detail.length) return { assignments, truncated };

  const helper = (index: number, current: Record<string, string>) => {
    if (assignments.length >= limit) {
      truncated = true;
      return;
    }
    if (index === detail.length) {
      assignments.push({ ...current });
      return;
    }
    const { name, values } = detail[index];
    if (!values.length) return;
    for (const value of values) {
      current[name] = String(value);
      helper(index + 1, current);
      if (truncated) return;
    }
    delete current[name];
  };

  helper(0, {});
  return { assignments, truncated };
};

/**
 * Check if a string value contains a variable token
 */
export const containsVariable = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return VARIABLE_TOKEN_RE.test(value.trim());
};

/**
 * Check if a specific element field contains an undefined variable
 */
export const hasUndefinedVariable = (
  value: unknown,
  definedVars: Set<string>
): boolean => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!VARIABLE_TOKEN_RE.test(trimmed)) return false;

  const varName = normalizeVariableToken(trimmed);
  return !definedVars.has(varName);
};

/**
 * Substitute variables in a value with actual values from assignment
 */
export const substituteVariables = (
  value: unknown,
  assignment: Record<string, string>
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => substituteVariables(item, assignment));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substituteVariables(v, assignment);
    }
    return result;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (VARIABLE_TOKEN_RE.test(trimmed)) {
      const varName = normalizeVariableToken(trimmed);
      return assignment[varName] ?? value;
    }
  }

  return value;
};

/**
 * Apply variable assignments to elements, creating a new element tree
 */
export const applyVariablesToElements = (
  elements: any[],
  assignment: Record<string, string>
): any[] => {
  return elements.map((element) => {
    const substituted = substituteVariables(element, assignment);
    return substituted;
  });
};

import type { Element, GateElement, SortElement } from "../types/builder";
import type { ValidationError } from "./validation";

export const countGatesInTree = (elements: Element[]): number => {
  let count = 0;
  for (const el of elements) {
    if (el.type === "gate") {
      count++;
      count += countGatesInTree((el as GateElement).thenChildren);
      count += countGatesInTree((el as GateElement).elseChildren);
    }
    if (el.type === "weight") {
      count += countGatesInTree(el.children);
    }
    if (el.type === "scale") {
      count += countGatesInTree(el.fromChildren);
      count += countGatesInTree(el.toChildren);
    }
    if (el.type === "sort") {
      count += countGatesInTree(el.children);
    }
  }
  return count;
};

export const countScalesInTree = (elements: Element[]): number => {
  let count = 0;
  for (const el of elements) {
    if (el.type === "scale") {
      count++;
      count += countScalesInTree(el.fromChildren);
      count += countScalesInTree(el.toChildren);
    }
    if (el.type === "gate") {
      count += countScalesInTree(el.thenChildren);
      count += countScalesInTree(el.elseChildren);
    }
    if (el.type === "weight") {
      count += countScalesInTree(el.children);
    }
    if (el.type === "sort") {
      count += countScalesInTree(el.children);
    }
  }
  return count;
};

export const countSortsInTree = (elements: Element[]): number => {
  let count = 0;
  for (const el of elements) {
    if (el.type === "sort") {
      count++;
      count += countSortsInTree((el as SortElement).children);
    }
    if (el.type === "gate") {
      count += countSortsInTree((el as GateElement).thenChildren);
      count += countSortsInTree((el as GateElement).elseChildren);
    }
    if (el.type === "weight") {
      count += countSortsInTree(el.children);
    }
    if (el.type === "scale") {
      count += countSortsInTree(el.fromChildren);
      count += countSortsInTree(el.toChildren);
    }
  }
  return count;
};

export const hasFieldError = (
  elementId: string,
  field: string,
  errors: ValidationError[]
): boolean => errors.some((err) => err.elementId === elementId && err.field === field);

/**
 * Checks if a field value references an undefined variable
 *
 * Uses Pull Model: checks against the variableLists array directly
 * to ensure always-fresh validation without stale cache issues.
 *
 * @param value - The field value to check (e.g., "$RISKON", "AAPL")
 * @param variableLists - Array of defined variable lists from the API
 * @param isLoading - If true, treats all variables as defined (prevents false positives during loading)
 * @returns True if the value is a variable reference that is not defined
 */
export const hasUndefinedVariableInField = (
  value: unknown,
  variableLists: Array<{ name: string }>,
  isLoading: boolean = false
): boolean => {
  // Don't show red borders while variables are loading
  if (isLoading) return false;

  // Only check string values
  if (typeof value !== "string") return false;

  const trimmed = value.trim();

  // Not a variable reference if doesn't start with $
  if (!trimmed.startsWith("$")) return false;

  // Extract and normalize variable name
  const varName = trimmed.slice(1).toLowerCase();

  // Check if this variable exists in the list (case-insensitive)
  const isDefined = variableLists.some(v => v.name.toLowerCase() === varName);

  return !isDefined;
};

export const deepCloneElement = (element: Element): Element => {
  const newId = `${element.type}-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  if (element.type === "ticker") {
    return {
      ...element,
      id: newId,
    };
  }

  if (element.type === "weight") {
    return {
      ...element,
      id: newId,
      children: element.children.map((child) => deepCloneElement(child)),
    };
  }

  if (element.type === "gate") {
    return {
      ...element,
      id: newId,
      thenChildren: element.thenChildren.map((child) => deepCloneElement(child)),
      elseChildren: element.elseChildren.map((child) => deepCloneElement(child)),
    };
  }

  if (element.type === "scale") {
    return {
      ...element,
      id: newId,
      fromChildren: element.fromChildren.map((child) => deepCloneElement(child)),
      toChildren: element.toChildren.map((child) => deepCloneElement(child)),
    };
  }

  if (element.type === "sort") {
    return {
      ...element,
      id: newId,
      children: element.children.map((child) => deepCloneElement(child)),
    };
  }

  return element;
};

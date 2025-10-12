import type { Element, GateElement } from "../types/builder";
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
  }
  return count;
};

export const hasFieldError = (
  elementId: string,
  field: string,
  errors: ValidationError[]
): boolean => errors.some((err) => err.elementId === elementId && err.field === field);

export const hasUndefinedVariableInField = (
  value: unknown,
  definedVars: Set<string>
): boolean => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("$")) return false;
  const varName = trimmed.slice(1).toLowerCase();
  return !definedVars.has(varName);
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

  return element;
};


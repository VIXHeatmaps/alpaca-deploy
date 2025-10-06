/**
 * Formatting utilities for numbers, percentages, and display values
 */

export const fmt2 = (x: number) => x.toFixed(2);

export const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export const safePct = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";

export const safeNum = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? (value as number).toFixed(2) : "—";

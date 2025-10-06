/**
 * Simple localStorage wrappers
 */

export const lsGet = (k: string, d = "") => localStorage.getItem(k) || d;

export const lsSet = (k: string, v: string) => localStorage.setItem(k, v);

export function normalizeMetrics(raw: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const num = Number(value);
      if (Number.isFinite(num)) out[key] = num;
    }
  }

  out.totalReturn = Number(out.totalReturn ?? out.total_return ?? 0);
  out.CAGR = Number(out.CAGR ?? out.cagr ?? 0);
  out.cagr = Number(out.cagr ?? out.CAGR ?? 0);
  out.sharpe = Number(out.sharpe ?? out.Sharpe ?? 0);
  out.sortino = Number(out.sortino ?? out.Sortino ?? 0);
  out.maxDrawdown = Number(out.maxDrawdown ?? out.max_drawdown ?? 0);

  return out;
}

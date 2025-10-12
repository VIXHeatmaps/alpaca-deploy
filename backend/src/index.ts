/* ===== BEGIN: BLOCK A — Imports & Config (Backend) ===== */
import 'dotenv/config';
import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createApp } from './app';
import { INDICATOR_SERVICE_URL, PORT, QUANTSTATS_TIMEOUT_MS, QUANTSTATS_URL, FEED } from './config/constants';
import { requireAuth } from './auth/jwt';
import { normalizeDate, toRFC3339End, toRFC3339Start, toYMD, todayYMD } from './utils/date';

const app = createApp();

/* ===== BEGIN: BLOCK C-1 — Batch Backtest Endpoints ===== */
/* moved to routes/backtest.ts */
/* ===== END: BLOCK C-1 ===== */



/* ===== BEGIN: BLOCK D — Types ===== */
type SimpleBar = {
  t: string; o: number; h: number; l: number; c: number; v: number;
  n?: number; vw?: number;
};

type PagedBarsResponse = {
  bars?: any[]; barset?: any[]; data?: any[]; items?: any[]; next_page_token?: string | null;
};

type DividendEvent = {
  ex_date?: string;
  exDate?: string;
  cash?: number | string;
  cashAmount?: number | string;
  amount?: number | string;
  symbol?: string;
};
/* ===== END: BLOCK D ===== */


/* ===== BEGIN: BLOCK E — fetchBarsPaged (handles pagination) ===== */
async function fetchBarsPaged(
  symbol: string,
  start: string,
  end: string,
  timeframe: string,
  apiKey: string,
  apiSecret: string,
  adj: 'all' | 'split' = 'all',
  maxBars: number = 200000
): Promise<SimpleBar[]> {
  const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars`;
  const clean = (s: any) => String(s ?? '').trim().replace(/^['"]|['"]$/g, '');
  const headers = { 'APCA-API-KEY-ID': clean(apiKey), 'APCA-API-SECRET-KEY': clean(apiSecret) };

  const out: SimpleBar[] = [];
  let pageToken: string | undefined = undefined;

  while (true) {
    const params: Record<string, any> = {
      feed: FEED,
      timeframe,
      start: toRFC3339Start(start),
      end: toRFC3339End(end),
      adjustment: adj,
      limit: 10000,
    };
    if (pageToken) params.page_token = pageToken;

    const r = await axios.get<PagedBarsResponse>(url, { params, headers });
    const raw = r.data;
    const arr = Array.isArray(raw) ? (raw as any[]) : (raw?.bars ?? raw?.barset ?? raw?.data ?? raw?.items ?? []);

    for (const bar of arr || []) {
      const rec: SimpleBar = {
        t: String(bar.t),
        o: Number(bar.o ?? bar.open ?? NaN),
        h: Number(bar.h ?? bar.high ?? NaN),
        l: Number(bar.l ?? bar.low ?? NaN),
        c: Number(bar.c ?? bar.close ?? NaN),
        v: Number(bar.v ?? bar.volume ?? 0),
        n: (bar.n ?? bar.trades) !== undefined ? Number(bar.n ?? bar.trades) : undefined,
        vw: (bar.vw ?? bar.vwap) !== undefined ? Number(bar.vw ?? bar.vwap) : undefined,
      };
      out.push(rec);
      if (out.length >= maxBars) break;
    }
    if (out.length >= maxBars) break;

    pageToken = (raw as any)?.next_page_token || undefined;
    if (!pageToken) break;
  }

  console.log('fetchBarsPaged', symbol, timeframe, start, '→', end, 'adj:', adj, 'bars:', out.length);
  return out;
}
/* ===== END: BLOCK E ===== */


/* ===== BEGIN: BLOCK E-1 — fetchDividends (per-share cash on ex-date) ===== */
type DividendResponse = {
  corporate_actions?: { cash_dividends?: DividendEvent[] } | DividendEvent[];
  data?: DividendEvent[];
  items?: DividendEvent[];
  next_page_token?: string | null;
  nextPageToken?: string | null;
};

async function fetchDividends(
  symbol: string,
  start: string,
  end: string,
  apiKey: string,
  apiSecret: string,
  maxPages: number = 40
): Promise<Map<string, number>> {
  const url = 'https://data.alpaca.markets/v1/corporate-actions';
  const clean = (s: any) => String(s ?? '').trim().replace(/^['"]|['"]$/g, '');
  const headers = { 'APCA-API-KEY-ID': clean(apiKey), 'APCA-API-SECRET-KEY': clean(apiSecret) };

  const out = new Map<string, number>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, any> = {
      symbols: symbol,
      types: 'cash_dividend',
      start: normalizeDate(start),
      end: normalizeDate(end),
      limit: 1000,
    };
    if (pageToken) params.page_token = pageToken;

    let resp: DividendResponse | null = null;
    try {
      const r = await axios.get<DividendResponse>(url, { params, headers });
      resp = r.data ?? null;
    } catch (err: any) {
      console.warn('fetchDividends failed', symbol, err?.response?.data || err?.message || err);
      break;
    }

    if (!resp) break;
    const arr: DividendEvent[] = (() => {
      if (Array.isArray(resp)) return resp as unknown as DividendEvent[];
      const corp = resp?.corporate_actions as any;
      if (Array.isArray(corp?.cash_dividends)) return corp.cash_dividends as DividendEvent[];
      if (Array.isArray(resp?.data)) return resp!.data as DividendEvent[];
      if (Array.isArray(resp?.items)) return resp!.items as DividendEvent[];
      if (Array.isArray((resp as any)?.results)) return (resp as any).results as DividendEvent[];
      if (Array.isArray((resp as any)?.events)) return (resp as any).events as DividendEvent[];
      return [];
    })();

    for (const ev of arr) {
      if (!ev) continue;
      const rawDate = ev.ex_date || (ev as any)?.exDate || (ev as any)?.['ex-date'] || (ev as any)?.exDateUtc;
      const ymd = toYMD(normalizeDate(String(rawDate || '')));
      if (!ymd) continue;
      const cashRaw = ev.cash ?? ev.cashAmount ?? ev.amount ?? (ev as any)?.rate;
      const cash = Number(cashRaw);
      if (!Number.isFinite(cash) || cash === 0) continue;
      out.set(ymd, (out.get(ymd) ?? 0) + cash);
    }

    const next = (resp.next_page_token || resp.nextPageToken) ?? undefined;
    if (!next) break;
    pageToken = String(next);
  }

  return out;
}
/* ===== END: BLOCK E-1 ===== */


/* ===== BEGIN: BLOCK F — Metrics (trading-day annualization) ===== */
const ZERO_METRICS = {
  totalReturn: 0,
  CAGR: 0,
  annualVolatility: 0,
  sharpe: 0,
  sortino: 0,
  maxDrawdown: 0,
};

function computeDailyReturns(values: number[]): number[] {
  if (!Array.isArray(values) || values.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    const ret = curr / prev - 1;
    if (Number.isFinite(ret)) out.push(ret);
  }
  return out;
}

function buildMetrics(values: number[], dailyReturns: number[]) {
  if (values.length < 2 || dailyReturns.length === 0) {
    return { ...ZERO_METRICS };
  }

  const n = dailyReturns.length;
  const avg = dailyReturns.reduce((a, b) => a + b, 0) / n;
  const variance = dailyReturns.reduce((a, b) => a + (b - avg) ** 2, 0) / n;
  const volDaily = Math.sqrt(variance);
  const annualVolatility = volDaily * Math.sqrt(252);

  const first = values.find((v) => Number.isFinite(v) && Math.abs(Number(v)) > 0) ?? values[0];
  const last = (() => {
    for (let i = values.length - 1; i >= 0; i--) {
      const candidate = values[i];
      if (Number.isFinite(candidate)) return Number(candidate);
    }
    return Number(values[values.length - 1]);
  })();

  const safeFirst = Number.isFinite(first) ? Number(first) : 1;
  const safeLast = Number.isFinite(last) ? Number(last) : safeFirst;
  const totalReturn = safeLast / Math.max(safeFirst, 1e-9) - 1;
  const CAGR = Math.pow(safeLast / Math.max(safeFirst, 1e-9), 252 / n) - 1;

  const down = dailyReturns.filter((r) => r < 0);
  const downDev = Math.sqrt(down.reduce((a, b) => a + b * b, 0) / Math.max(1, down.length));

  const sharpe = (avg / Math.max(volDaily, 1e-9)) * Math.sqrt(252);
  const sortino = (avg / Math.max(downDev, 1e-9)) * Math.sqrt(252);

  let peak = safeFirst > 0 ? safeFirst : 1;
  let maxDrawdown = 0;
  for (const raw of values) {
    if (!Number.isFinite(raw) || Number(raw) <= 0) continue;
    const v = Number(raw);
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  return { totalReturn, CAGR, annualVolatility, sharpe, sortino, maxDrawdown };
}

function computeMetrics(values: number[], dates: string[], dailyReturns?: number[]) {
  const returns = dailyReturns ?? computeDailyReturns(values);
  return buildMetrics(values, returns);
}
/* ===== END: BLOCK F ===== */


async function fetchQuantStatsMetrics(dailyReturns: number[]): Promise<Record<string, number>> {
  if (!Array.isArray(dailyReturns)) return {};

  const cleaned = dailyReturns.filter((r) => Number.isFinite(r));
  if (cleaned.length < 2) return {};
  try {
    const response = await axios.post(QUANTSTATS_URL, {
      returns: cleaned,
      period: 'daily',
    }, { timeout: QUANTSTATS_TIMEOUT_MS });

    const payload = response?.data?.metrics;
    if (!payload || typeof payload !== 'object') return {};

    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) continue;
      const num = Number(value);
      if (Number.isFinite(num)) out[key] = num;
    }
    return out;
  } catch (err: any) {
    const detail = err?.response?.data || err?.message || err;
    console.warn('quantstats metrics request failed', detail);
    return {};
  }
}


/* ===== BEGIN: BLOCK G — Series Alignment Helpers ===== */
function toDateCloseMap(bars: SimpleBar[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bars) m.set(b.t.slice(0, 10), b.c);
  return m;
}
function forwardFillOnDates(dateIndex: string[], src: Map<string, number>): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let last: number | undefined = undefined;
  for (const d of dateIndex) {
    const v = src.get(d);
    if (v !== undefined) last = v;
    out.push(last);
  }
  return out;
}
/* ===== END: BLOCK G ===== */


/* ===== BEGIN: BLOCK H — Indicator Lookback Rules ===== */
function barsNeededForIndicator(indicatorType: string, params: Record<string, any>): number {
  const t = (indicatorType || '').toString().toUpperCase();
  const period  = Number(params?.period ?? params?.timeperiod ?? 14);
  const fast    = Number(params?.fastperiod ?? 12);
  const slow    = Number(params?.slowperiod ?? 26);
  const signal  = Number(params?.signalperiod ?? 9);

  if (t === 'CURRENT_PRICE' || t === 'PRICE' || t === 'CLOSE' || t === 'LAST') return 2;
  if (t === 'RSI' || t === 'SMA' || t === 'EMA') return Math.max(2, period);
  if (t === 'MACD' || t === 'MACD_LINE' || t === 'MACD_SIGNAL' || t === 'MACD_HIST') return Math.max(2, slow + signal);
  if (t === 'PPO' || t === 'PPO_LINE') return Math.max(2, Math.max(fast, slow));
  if (t === 'PPO_SIGNAL' || t === 'PPO_HIST') return Math.max(2, Math.max(fast, slow) + signal);
  if (t === 'BBANDS' || t === 'BBANDS_UPPER' || t === 'BBANDS_MIDDLE' || t === 'BBANDS_LOWER') return Math.max(2, period);

  if (t === 'ATR' || t === 'NATR' || t === 'CCI' || t === 'WILLR' || t === 'ADX' || t === 'AROONOSC') return Math.max(2, period);
  if (t === 'STOCH_K') {
    const fk = Number(params?.fastk_period ?? 14);
    const sk = Number(params?.slowk_period ?? 3);
    const sd = Number(params?.slowd_period ?? 3);
    return Math.max(2, fk + sk + sd);
  }

  if (t === 'MFI') return Math.max(2, period);
  if (t === 'AD' || t === 'ADOSC') return Math.max(2, 2 + Number(params?.slowperiod ?? 10));

  if (t === 'OBV') return 2;
  return Math.max(2, period || slow || 200);
}
/* ===== END: BLOCK H ===== */


/* ===== BEGIN: BLOCK I — GET /api/bars (paged) ===== */
/* moved to routes/backtest.ts */
/* ===== BEGIN: BLOCK P — Variable Lists CRUD ===== */
/* moved to routes/variables.ts */
/* ===== END: BLOCK P ===== */


/* ===== BEGIN: BLOCK Q — Strategies CRUD ===== */
/* moved to routes/strategies.ts */
/* ===== END: BLOCK Q ===== */


/* ===== BEGIN: BLOCK L — Boot ===== */
app.listen(PORT, async () => {
  console.log(`Alpaca algo backend listening on port ${PORT} (feed=${FEED}, indicator=split, returns=all)`);

  // Ensure database tables exist
  try {
    const { ensureAllTables } = await import('./db/ensureTables');
    await ensureAllTables();
  } catch (err: any) {
    console.error('Failed to ensure database tables:', err.message);
  }

  // Start cache purge scheduler for V2 backtest engine
  try {
    const { startCachePurgeScheduler } = await import('./backtest/v2/cachePurgeScheduler');
    await startCachePurgeScheduler();
  } catch (err: any) {
    console.error('Failed to start cache purge scheduler:', err.message);
    console.error('Cache will not be automatically purged at 4pm/8pm ET');
  }

  // Start T-10 rebalancing scheduler if we have API credentials
  const apiKey = process.env.ALPACA_API_KEY?.trim();
  const apiSecret = process.env.ALPACA_API_SECRET?.trim();

  if (apiKey && apiSecret) {
    try {
      const { startT10Scheduler } = await import('./services/scheduler');
      await startT10Scheduler(apiKey, apiSecret);

      const { startFillChecker } = await import('./services/fillChecker');
      startFillChecker(apiKey, apiSecret);

      const { startSnapshotScheduler } = await import('./services/snapshotScheduler');
      await startSnapshotScheduler(apiKey, apiSecret);
    } catch (err: any) {
      console.error('Failed to start schedulers:', err.message);
      console.error('Automatic rebalancing and snapshots may not be available');
    }
  } else {
    console.log('No ALPACA_API_KEY/ALPACA_API_SECRET in environment - schedulers disabled');
    console.log('Rebalancing is still available via POST /api/rebalance endpoint');
  }
});
/* ===== END: BLOCK L ===== */

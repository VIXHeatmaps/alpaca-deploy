import { Router, Request, Response } from 'express';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { requireAuth } from '../auth/jwt';
import { FEED, INDICATOR_SERVICE_URL, INTERNAL_API_BASE, QUANTSTATS_TIMEOUT_MS, QUANTSTATS_URL } from '../config/constants';
import {
  applyVariablesToElements,
  applyVariablesToNodes,
  buildSummary,
  clampNumber,
  generateAllAssignments,
  sanitizedVariables,
} from '../batch/helpers';
import { normalizeMetrics } from '../batch/metrics';
import { BatchJobRecord, BatchJobResult, FlowEdge, FlowGlobals, FlowNode } from '../batch/types';
import * as batchJobsDb from '../db/batchJobsDb';
import { spawnBatchStrategyWorker } from '../workers/spawnBatchStrategyWorker';
import { getMarketDateToday } from '../utils/marketTime';
import { normalizeDate, toRFC3339End, toRFC3339Start, todayYMD, toYMD } from '../utils/date';

const backtestRouter = Router();

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
backtestRouter.get('/bars', async (req: Request, res: Response) => {
  const { symbol, start, end, timeframe = '1Day', adj = 'all' } = req.query as any;
  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const startQ = start ? String(start) : '1900-01-01';
  const endQ = end ? String(end) : todayYMD();
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  try {
    const bars = await fetchBarsPaged(String(symbol), startQ, endQ, String(timeframe), apiKey, apiSecret, adj === 'split' ? 'split' : 'all');
    return res.json({ bars });
  } catch (err: any) {
    console.error('GET /api/bars error:', err.response?.data || err.message);
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});
/* ===== END: BLOCK I ===== */


/* ===== BEGIN: BLOCK J — POST /api/backtest (classic) ===== */
backtestRouter.post('/backtest', async (req: Request, res: Response) => {
  try {
    const {
      indicatorSymbol,
      indicatorType,
      indicatorParams,
      comparison,
      threshold,
      rightIndicator,
      portfolioIfTrue,
      portfolioIfFalse,
      benchmarkSymbol,
      start,
      end,
      debug,
      apiKey: bodyKey,
      apiSecret: bodySecret,
    } = (req.body ?? {}) as any;

    const API_KEY = (req.header('APCA-API-KEY-ID') || bodyKey || process.env.ALPACA_API_KEY || '').toString();
    const API_SECRET = (req.header('APCA-API-SECRET-KEY') || bodySecret || process.env.ALPACA_API_SECRET || '').toString();
    if (!API_KEY || !API_SECRET) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

    const displayStart = (start && String(start).trim()) || '';
    const displayEnd = (end && String(end).trim()) || todayYMD();

    const MAX_START = '1900-01-01';
    const IND_TF = '1Day';

    const leftBars = await fetchBarsPaged(String(indicatorSymbol), MAX_START, displayEnd, IND_TF, API_KEY, API_SECRET, 'split');
    if (!leftBars.length) return res.status(400).json({ error: `No bars for ${indicatorSymbol}` });

    let rightBars: SimpleBar[] = [];
    if (rightIndicator?.symbol && rightIndicator?.type) {
      rightBars = await fetchBarsPaged(String(rightIndicator.symbol), MAX_START, displayEnd, IND_TF, API_KEY, API_SECRET, 'split');
      if (!rightBars.length) return res.status(400).json({ error: `No bars for ${rightIndicator.symbol}` });
    }

    const CLOSE_ONLY = new Set(['CURRENT_PRICE','PRICE','CLOSE','LAST','RSI','SMA','EMA','MACD','MACD_LINE','MACD_SIGNAL','MACD_HIST','PPO','PPO_LINE','PPO_SIGNAL','PPO_HIST','BBANDS','BBANDS_UPPER','BBANDS_MIDDLE','BBANDS_LOWER']);
    const NEEDS_HLC = new Set(['ATR','NATR','CCI','WILLR','ADX','AROONOSC','STOCH_K']);
    const NEEDS_HLCV = new Set(['MFI','AD','ADOSC']);
    const NEEDS_CLOSE_VOL = new Set(['OBV']);

    function buildIndicatorPayload(indName: string, bars: SimpleBar[], params: Record<string, any>) {
      const t = (indName || '').toUpperCase();
      const open = bars.map(b => b.o);
      const high = bars.map(b => b.h);
      const low  = bars.map(b => b.l);
      const close = bars.map(b => b.c);
      const volume = bars.map(b => b.v);
      if (CLOSE_ONLY.has(t)) return { indicator: t, prices: close, close, params: params || {} };
      if (NEEDS_HLC.has(t))  return { indicator: t, high, low, close, params: params || {} };
      if (NEEDS_HLCV.has(t)) return { indicator: t, high, low, close, volume, params: params || {} };
      if (NEEDS_CLOSE_VOL.has(t)) return { indicator: t, close, volume, params: params || {} };
      return { indicator: t, prices: close, close, params: params || {} };
    }

    async function postIndicator(indName: string, bars: SimpleBar[], params: Record<string, any>) {
      const url = `${INDICATOR_SERVICE_URL}/indicator`;
      const payload = buildIndicatorPayload(indName, bars, params);
      const r = await axios.post(url, payload, { timeout: 30_000 });
      return Array.isArray(r?.data?.values) ? (r.data.values as Array<number | null>) : [];
    }

    const leftValues = await postIndicator(String(indicatorType), leftBars, indicatorParams || {});
    let rightValues: Array<number | null> | null = null;
    if (rightBars.length && rightIndicator?.type) {
      rightValues = await postIndicator(String(rightIndicator.type), rightBars, rightIndicator.params || {});
    }

    const leftDates = leftBars.map(b => toYMD(b.t));
    const leftMap = new Map<string, number>();
    for (let i = 0; i < leftDates.length; i++) {
      const v = leftValues[i];
      if (Number.isFinite(v as number)) leftMap.set(leftDates[i], v as number);
    }

    let rightMap: Map<string, number> | null = null;
    if (rightBars.length && rightValues) {
      const rDates = rightBars.map(b => toYMD(b.t));
      rightMap = new Map<string, number>();
      for (let i = 0; i < rDates.length; i++) {
        const v = rightValues[i];
        if (Number.isFinite(v as number)) rightMap.set(rDates[i], v as number);
      }
    }

    const TRUE_SYM = String(portfolioIfTrue?.symbol || 'SPY');
    const FALSE_SYM = String(portfolioIfFalse?.symbol || 'BIL');

    const [trueBarsTR, falseBarsTR, benchBarsTR] = await Promise.all([
      fetchBarsPaged(TRUE_SYM, '1900-01-01', displayEnd, IND_TF, API_KEY, API_SECRET, 'all'),
      fetchBarsPaged(FALSE_SYM, '1900-01-01', displayEnd, IND_TF, API_KEY, API_SECRET, 'all'),
      benchmarkSymbol ? fetchBarsPaged(String(benchmarkSymbol), '1900-01-01', displayEnd, IND_TF, API_KEY, API_SECRET, 'all') : Promise.resolve([] as SimpleBar[]),
    ]);

    const [trueDivs, falseDivs, benchDivs] = await Promise.all([
      fetchDividends(TRUE_SYM, '1900-01-01', displayEnd, API_KEY, API_SECRET).catch(() => new Map<string, number>()),
      fetchDividends(FALSE_SYM, '1900-01-01', displayEnd, API_KEY, API_SECRET).catch(() => new Map<string, number>()),
      benchmarkSymbol
        ? fetchDividends(String(benchmarkSymbol), '1900-01-01', displayEnd, API_KEY, API_SECRET).catch(() => new Map<string, number>())
        : Promise.resolve(new Map<string, number>())
    ]);

    const trueClose = toDateCloseMap(trueBarsTR);
    const falseClose = toDateCloseMap(falseBarsTR);
    const benchClose = toDateCloseMap(benchBarsTR);

    const heldDates: string[] = [];
    const equityCurveAll: number[] = [];
    const debugDaysAll: any[] = [];
    let equity = 1.0;

    for (let i = 1; i < leftDates.length; i++) {
      const decisionDate = leftDates[i - 1];
      const heldDate = leftDates[i];

      const L = leftMap.get(decisionDate);
      const R = rightMap ? rightMap.get(decisionDate) : Number(threshold);
      let pass = false;
      if (Number.isFinite(L) && Number.isFinite(R)) pass = comparison === 'gt' ? (L! > (R as number)) : (L! < (R as number));

      const pos = pass ? TRUE_SYM : FALSE_SYM;
      const closeMap = pass ? trueClose : falseClose;

      const c0 = closeMap.get(decisionDate);
      const c1 = closeMap.get(heldDate);
      const divCash = (pass ? trueDivs : falseDivs).get(heldDate) ?? 0;
      const positionPriceRet = (Number.isFinite(c0) && Number.isFinite(c1) && (c0! > 0)) ? (c1! / c0! - 1) : 0;
      const dividendRet = Number.isFinite(divCash as number) && Number.isFinite(c0) && (c0! > 0) ? (divCash as number) / c0! : 0;
      const dailyRet = positionPriceRet + dividendRet;

      equity *= (1 + dailyRet);
      heldDates.push(heldDate);
      equityCurveAll.push(equity);

      if (debug) {
        const lbPrev = leftBars[i - 1]?.c;
        const lbCurr = leftBars[i]?.c;
        const indicatorPriceRet = (Number.isFinite(lbPrev) && Number.isFinite(lbCurr) && lbPrev! > 0) ? (lbCurr! / lbPrev! - 1) : 0;
        debugDaysAll.push({
          decisionDate,
          heldDate,
          indicator: Number.isFinite(L) ? (L as number) : null,
          passed: pass,
          positionSymbol: pos,
          equity,
          dailyReturn: dailyRet,
          positionPriceReturn: positionPriceRet,
          positionDividendReturn: dividendRet,
          dividendCash: divCash,
          priceRet: indicatorPriceRet,
          dividendRet,
        });
      }
    }

    const inWindow = (d: string) => {
      const afterStart = !displayStart || d >= displayStart;
      const beforeEnd = !displayEnd || d <= displayEnd;
      return afterStart && beforeEnd;
    };

    const idxKeep: number[] = [];
    for (let i = 0; i < heldDates.length; i++) if (inWindow(heldDates[i])) idxKeep.push(i);

    const dates = idxKeep.map(i => heldDates[i]);
    const equityCurve = idxKeep.map(i => equityCurveAll[i]);
    const debugDays = debug ? idxKeep.map(i => debugDaysAll[i]) : undefined;

    let benchmark: any = null;
    if (benchmarkSymbol && dates.length) {
      const first = dates[0];
      const benchDatesAll = benchBarsTR.map(b => toYMD(b.t));
      const bIdxMap = new Map(benchDatesAll.map((d, i) => [d, i]));
      const firstIdx = bIdxMap.get(first);
      if (firstIdx !== undefined) {
        let eq = 1; const eqCurve: number[] = [];
        for (let i = firstIdx + 1; i < benchBarsTR.length; i++) {
          const d0 = benchDatesAll[i - 1]; const d1 = benchDatesAll[i];
          if (!inWindow(d1)) continue;
          const c0 = benchClose.get(d0); const c1 = benchClose.get(d1);
          const divCash = benchDivs.get(d1) ?? 0;
          const priceR = (Number.isFinite(c0) && Number.isFinite(c1) && c0! > 0) ? (c1! / c0! - 1) : 0;
          const divR = Number.isFinite(divCash as number) && Number.isFinite(c0) && c0! > 0 ? (divCash as number) / c0! : 0;
          const r = priceR + divR;
          eq *= (1 + r); eqCurve.push(eq);
        }
        const benchDatesKept = dates.slice();
        const benchEquityCurve = eqCurve.slice(-benchDatesKept.length);
        const benchDailyReturns = computeDailyReturns(benchEquityCurve);
        const benchMetricsBase = computeMetrics(benchEquityCurve, benchDatesKept, benchDailyReturns);
        const benchMetricsQuant = await fetchQuantStatsMetrics(benchDailyReturns);
        benchmark = {
          dates: benchDatesKept,
          equityCurve: benchEquityCurve,
          metrics: { ...benchMetricsBase, ...benchMetricsQuant },
        };
      }
    }

    const equityDailyReturns = computeDailyReturns(equityCurve);
    const metricsBase = computeMetrics(equityCurve, dates, equityDailyReturns);
    const metricsQuant = await fetchQuantStatsMetrics(equityDailyReturns);
    const metrics = { ...metricsBase, ...metricsQuant };

    const firstFiniteDate = (() => {
      for (const d of leftDates) if (Number.isFinite(leftMap.get(d))) return d; return leftDates[0] || null;
    })();

    res.json({ dates, equityCurve, metrics, benchmark, debugDays, info: { requestedStart: displayStart || null, effectiveStart: dates[0] || null, requestedEnd: displayEnd || null, effectiveEnd: dates[dates.length - 1] || null, firstFiniteDate, needBars: 0, startMessage: 'Fetched max range (1900-01-01→end) then trimmed to requested window.' } });
  } catch (err: any) {
    console.error('Backtest error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});
/* ===== END: BLOCK J ===== */


/* ===== BEGIN: BLOCK K — POST /api/backtest_flow (graph evaluator) ===== */
type IndicatorName =
  | 'CURRENT_PRICE' | 'RSI' | 'SMA' | 'EMA'
  | 'MACD' | 'MACD_LINE' | 'MACD_SIGNAL' | 'MACD_HIST'
  | 'PPO_LINE' | 'PPO_SIGNAL' | 'PPO_HIST'
  | 'BBANDS_UPPER' | 'BBANDS_MIDDLE' | 'BBANDS_LOWER'
  | 'ATR' | 'OBV' | 'ADX' | 'STOCH_K' | 'MFI' | 'AROONOSC';

type Condition = {
  left: { symbol: string; type: IndicatorName; params: Record<string, any> };
  op: 'gt' | 'lt';
  threshold?: number;
  rightIndicator?: { symbol: string; type: IndicatorName; params: Record<string, any> };
};

const IS_CLOSE_ONLY = new Set(['CURRENT_PRICE','PRICE','CLOSE','LAST','RSI','SMA','EMA','MACD','MACD_LINE','MACD_SIGNAL','MACD_HIST','PPO','PPO_LINE','PPO_SIGNAL','PPO_HIST','BBANDS','BBANDS_UPPER','BBANDS_MIDDLE','BBANDS_LOWER']);
const IS_HLC = new Set(['ATR','NATR','CCI','WILLR','ADX','AROONOSC','STOCH_K']);
const IS_HLCV = new Set(['MFI','AD','ADOSC']);
const IS_CLOSE_VOL = new Set(['OBV']);

function buildIndicatorPayloadForBars(indName: string, bars: SimpleBar[], params: Record<string, any>) {
  const t = (indName || '').toUpperCase();
  const high = bars.map(b => b.h);
  const low  = bars.map(b => b.l);
  const close = bars.map(b => b.c);
  const volume = bars.map(b => b.v);
  if (IS_CLOSE_ONLY.has(t)) return { indicator: t, prices: close, close, params: params || {} };
  if (IS_HLC.has(t))  return { indicator: t, high, low, close, params: params || {} };
  if (IS_HLCV.has(t)) return { indicator: t, high, low, close, volume, params: params || {} };
  if (IS_CLOSE_VOL.has(t)) return { indicator: t, close, volume, params: params || {} };
  return { indicator: t, prices: close, close, params: params || {} };
}

async function postIndicatorSeries(indName: string, bars: SimpleBar[]) {
  const url = `${INDICATOR_SERVICE_URL}/indicator`;
  const payload = buildIndicatorPayloadForBars(indName, bars, (bars as any).__params || {});
  const r = await axios.post(url, payload, { timeout: 30_000 });
  return Array.isArray(r?.data?.values) ? (r.data.values as Array<number | null>) : [];
}

function cmp(op: 'gt'|'lt', a?: number|null, b?: number|null) {
  if (!Number.isFinite(a as number) || !Number.isFinite(b as number)) return false;
  return op === 'gt' ? (a as number) > (b as number) : (a as number) < (b as number);
}

backtestRouter.post('/backtest_flow', async (req: Request, res: Response) => {
  try {
    const body = req.body as { globals: FlowGlobals; nodes: FlowNode[]; edges: FlowEdge[]; apiKey?: string; apiSecret?: string };
    const { globals, nodes, edges } = body || {};
    if (!globals || !nodes?.length) return res.status(400).json({ error: 'Invalid flow payload' });

    const API_KEY = (req.header('APCA-API-KEY-ID') || (body as any).apiKey || process.env.ALPACA_API_KEY || '').toString();
    const API_SECRET = (req.header('APCA-API-SECRET-KEY') || (body as any).apiSecret || process.env.ALPACA_API_SECRET || '').toString();
    if (!API_KEY || !API_SECRET) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

    const MAX_START = '1900-01-01';
    const TF = '1Day';

    const nodesById = new Map(nodes.map(n => [n.id, n]));
    const edgesByFrom = new Map<string, FlowEdge[]>();
    for (const e of (edges || [])) {
      if (!edgesByFrom.has(e.from)) edgesByFrom.set(e.from, []);
      edgesByFrom.get(e.from)!.push(e);
    }

    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) return res.status(400).json({ error: 'Flow must include a Start node' });

    // ---- collect indicator requests & tickers ----
    const indReq: Array<{ key: string; symbol: string; type: IndicatorName; params: any }> = [];
    const tickers = new Set<string>();
    for (const n of nodes) {
      if (n.type === 'gate') {
        const g = n.data as { conditions: Condition[] };
        for (const c of g.conditions || []) {
          indReq.push({
            key: `${c.left.symbol}|${c.left.type}|${JSON.stringify(c.left.params||{})}`,
            symbol: c.left.symbol.toUpperCase(),
            type: c.left.type,
            params: c.left.params||{}
          });
          if (c.rightIndicator) {
            indReq.push({
              key: `${c.rightIndicator.symbol}|${c.rightIndicator.type}|${JSON.stringify(c.rightIndicator.params||{})}`,
              symbol: c.rightIndicator.symbol.toUpperCase(),
              type: c.rightIndicator.type,
              params: c.rightIndicator.params||{}
            });
          }
        }
      } else if (n.type === 'portfolio') {
        for (const it of (n.data?.items || [])) if (it.symbol) tickers.add(String(it.symbol).toUpperCase());
      }
    }
    if (globals.benchmarkSymbol) tickers.add(globals.benchmarkSymbol.toUpperCase());

    const uniqMap = new Map<string, { symbol: string; type: IndicatorName; params: any }>();
    for (const r of indReq) if (!uniqMap.has(r.key)) uniqMap.set(r.key, { symbol: r.symbol, type: r.type, params: r.params });

    const requestedEnd = globals.end;
    const requestedStart = globals.start && globals.start !== 'max' ? globals.start : MAX_START;

    // ---- fetch indicator & TR bars ----
    const indBarsByKey = new Map<string, SimpleBar[]>();
    await Promise.all(Array.from(uniqMap.entries()).map(async ([key, r]) => {
      const bars = await fetchBarsPaged(r.symbol, MAX_START, requestedEnd, TF, API_KEY, API_SECRET, 'split');
      (bars as any).__params = r.params;
      indBarsByKey.set(key, bars);
    }));

    const trBarsBySym = new Map<string, SimpleBar[]>();
    await Promise.all(Array.from(tickers).map(async (sym) => {
      const bars = await fetchBarsPaged(sym, MAX_START, requestedEnd, TF, API_KEY, API_SECRET, 'all');
      trBarsBySym.set(sym, bars);
    }));

    const dividendsBySym = new Map<string, Map<string, number>>();
    await Promise.all(Array.from(tickers).map(async (sym) => {
      try {
        const divs = await fetchDividends(sym, MAX_START, requestedEnd, API_KEY, API_SECRET);
        dividendsBySym.set(sym, divs);
      } catch (err: any) {
        console.warn('fetchDividends error', sym, err?.response?.data || err?.message || err);
        dividendsBySym.set(sym, new Map());
      }
    }));

    // ---- compute effective "max start": most recent first-available across all tickers,
    //      and the first COMPUTABLE date for each indicator (first bar + lookback) ----
    function firstBarYMD(bars: SimpleBar[] | undefined): string | null {
      return (bars && bars.length) ? toYMD(bars[0].t) : null;
    }
    function firstComputableYMD(type: IndicatorName, params: any, bars: SimpleBar[] | undefined): string | null {
      if (!bars || !bars.length) return null;
      const lookback = barsNeededForIndicator(type, params || {});
      if (bars.length <= lookback) return null;
      return toYMD(bars[lookback].t); // use the date where the indicator first has enough history
    }

    const startCandidates: string[] = [];

    // portfolio + benchmark tickers
    for (const [sym, bars] of trBarsBySym.entries()) {
      const d = firstBarYMD(bars);
      if (d) startCandidates.push(d);
    }

    // indicators (left and right)
    for (const [key, bars] of indBarsByKey.entries()) {
      const [, typeStr, paramsJson] = key.split('|'); // key = SYMBOL|TYPE|PARAMS
      const type = typeStr as IndicatorName;
      const params = JSON.parse(paramsJson || '{}');
      const d = firstComputableYMD(type, params, bars);
      if (d) startCandidates.push(d);
    }

    // If nothing found, fall back to requestedStart
    let effectiveMaxStart = startCandidates.length ? startCandidates.sort().slice(-1)[0] : requestedStart;

    // Respect the user's provided start if it's later
    const effectiveStart = requestedStart ? (requestedStart > effectiveMaxStart ? requestedStart : effectiveMaxStart) : effectiveMaxStart;

    // ---- compute TR close maps now (after we know the symbols) ----
    const trCloses = new Map<string, Map<string, number>>();
    for (const [sym, bars] of trBarsBySym.entries()) {
      trCloses.set(sym, toDateCloseMap(bars));
    }

    // ---- compute indicator series (date -> value) ----
    const indSeries = new Map<string, Map<string, number>>();
    await Promise.all(Array.from(indBarsByKey.entries()).map(async ([key, bars]) => {
      const [, type] = key.split('|');
      const values = await postIndicatorSeries(type, bars);
      const dates = bars.map(b => toYMD(b.t));
      const m = new Map<string, number>();
      for (let i = 0; i < dates.length; i++) {
        const v = values[i];
        if (Number.isFinite(v as number)) m.set(dates[i], v as number);
      }
      indSeries.set(key, m);
    }));

    // ---- build date grid (and clip to effectiveStart/effective end) ----
    let dateGrid: string[] = [];
    const benchSym = globals.benchmarkSymbol?.toUpperCase();
    if (benchSym && trCloses.has(benchSym)) {
      dateGrid = Array.from(trCloses.get(benchSym)!.keys()).sort();
    } else if (trBarsBySym.size) {
      const first = trBarsBySym.values().next().value as SimpleBar[] | undefined;
      dateGrid = first ? first.map(b => toYMD(b.t)) : [];
    } else {
      const any = indBarsByKey.values().next().value as SimpleBar[] | undefined;
      dateGrid = any ? any.map(b => toYMD(b.t)) : [];
    }

    if (effectiveStart) dateGrid = dateGrid.filter(d => d >= effectiveStart);
    if (requestedEnd)   dateGrid = dateGrid.filter(d => d <= requestedEnd);

    // ---- evaluate allocation + capture last gate decision for debug ----
    function evalAtDate(d: string): { alloc: Record<string, number>; last?: { L: number|null; R: number|null; op: 'gt'|'lt'; passed: boolean; gateId: string } } {
      let lastDecision: { L: number|null; R: number|null; op: 'gt'|'lt'; passed: boolean; gateId: string } | undefined;

      function walk(nodeId: string, w: number): Record<string, number> {
        const node = nodesById.get(nodeId);
        if (!node || w <= 0) return {};
        if (node.type === 'portfolio') {
          const out: Record<string, number> = {};
          const items = (node.data?.items || []) as Array<{ symbol: string; weightPct: number }>;
          const sum = items.reduce((a, b) => a + (b.weightPct || 0), 0) || 0;
          for (const it of items) {
            const k = String(it.symbol || '').toUpperCase();
            const ww = sum ? (w * (it.weightPct || 0) / 100) : 0;
            if (ww > 0) out[k] = (out[k] || 0) + ww;
          }
          return out;
        }
        if (node.type === 'gate') {
          const g = node.data as { conditions: Condition[]; thenTargetId?: string; elseTargetId?: string };
          const c = g.conditions?.[0];
          if (!c) return {};
          const lk = `${c.left.symbol.toUpperCase()}|${c.left.type}|${JSON.stringify(c.left.params||{})}`;
          const l = indSeries.get(lk)?.get(d) ?? null;
          let r: number | null = null;
          if (c.rightIndicator) {
            const rk = `${c.rightIndicator.symbol.toUpperCase()}|${c.rightIndicator.type}|${JSON.stringify(c.rightIndicator.params||{})}`;
            r = indSeries.get(rk)?.get(d) ?? null;
          } else {
            r = Number.isFinite(c.threshold as any) ? Number(c.threshold) : null;
          }
          const ok = cmp(c.op, l, r);
          lastDecision = { L: Number.isFinite(l as number) ? (l as number) : null, R: Number.isFinite(r as number) ? (r as number) : null, op: c.op, passed: ok, gateId: node.id };

          const target = ok
            ? (g.thenTargetId || edgesByFrom.get(node.id)?.find(e => e.label === 'then')?.to)
            : (g.elseTargetId || edgesByFrom.get(node.id)?.find(e => e.label === 'else')?.to);
          if (!target) return {};
          return walk(target, w);
        }
        if (node.type === 'start') {
          const outEdge = (edgesByFrom.get(node.id) || [])[0];
          return outEdge ? walk(outEdge.to, w) : {};
        }
        if (node.type === 'weights') {
          const children = (node.data?.children || []) as Array<{ id: string; weightPct: number }>;
          const out: Record<string, number> = {};
          for (const ch of children) {
            const ww = w * ((ch.weightPct || 0) / 100);
            const rec = walk(ch.id, ww);
            for (const k of Object.keys(rec)) out[k] = (out[k] || 0) + rec[k];
          }
          return out;
        }
        return {};
      }

      const alloc = walk(startNode.id, 100);
      return { alloc, last: lastDecision };
    }

    let eq = 1; const equity: number[] = []; const benchEq: number[] = [];
    const debugRows: Array<any> = [];

    function dayComponents(sym: string, i: number): { total: number; price: number; dividend: number } {
      const m = trCloses.get(sym);
      if (!m) return { total: 0, price: 0, dividend: 0 };
      const d0 = dateGrid[i - 1], d1 = dateGrid[i];
      const p0 = m.get(d0), p1 = m.get(d1);
      if (!Number.isFinite(p0 as number) || !Number.isFinite(p1 as number) || (p0 as number) === 0) {
        return { total: 0, price: 0, dividend: 0 };
      }
      const priceRet = (p1 as number) / (p0 as number) - 1;
      const divCash = dividendsBySym.get(sym)?.get(d1) ?? 0;
      const divRet = Number.isFinite(divCash as number) ? (divCash as number) / (p0 as number) : 0;
      return { total: priceRet + divRet, price: priceRet, dividend: divRet };
    }

    if (dateGrid.length) {
      equity.push(eq);
      if (benchSym) benchEq.push(1);
    }

    for (let i = 1; i < dateGrid.length; i++) {
      const decisionDate = dateGrid[i - 1];
      const heldDate = dateGrid[i];
      const { alloc, last } = evalAtDate(decisionDate);
      const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
      const norm = sum > 0 ? Object.fromEntries(Object.entries(alloc).map(([k, v]) => [k, v / sum])) : {};

      let r = 0;
      let pricePortion = 0;
      let dividendPortion = 0;
      for (const [k, w] of Object.entries(norm)) {
        const comps = dayComponents(k, i);
        r += w * comps.total;
        pricePortion += w * comps.price;
        dividendPortion += w * comps.dividend;
      }
      eq *= 1 + r;
      equity.push(eq);

      if (benchSym) {
        const prevBench = benchEq[benchEq.length - 1] ?? 1;
        const comps = dayComponents(benchSym, i);
        benchEq.push(prevBench * (1 + comps.total));
      }

      if (globals.debug) {
        let primary = 'MIX';
        let maxW = 0;
        for (const [k, w] of Object.entries(norm)) if (w > maxW) { maxW = w; primary = k; }
        debugRows.push({
          decisionDate,
          heldDate,
          L: last?.L ?? null,
          R: last?.R ?? null,
          op: last?.op ?? 'gt',
          passed: last?.passed ?? false,
          positionSymbol: primary,
          allocation: norm,
          dailyReturn: r,
          priceReturn: pricePortion,
          dividendReturn: dividendPortion,
          equity: eq,
        });
      }
    }

    const equityDailyReturns = computeDailyReturns(equity);
    const metricsBase = computeMetrics(equity, dateGrid, equityDailyReturns);
    const metricsQuant = await fetchQuantStatsMetrics(equityDailyReturns);

    const resp: any = { dates: dateGrid, equityCurve: equity, metrics: { ...metricsBase, ...metricsQuant } };

    if (benchSym) {
      const benchDailyReturns = computeDailyReturns(benchEq);
      const benchMetricsBase = computeMetrics(benchEq, dateGrid, benchDailyReturns);
      const benchMetricsQuant = await fetchQuantStatsMetrics(benchDailyReturns);
      resp.benchmark = { dates: dateGrid, equityCurve: benchEq, metrics: { ...benchMetricsBase, ...benchMetricsQuant } };
    }
    if (globals.debug) resp.debugDays = debugRows;

    return res.json(resp);
  } catch (err: any) {
    console.error('backtest_flow error', err?.response?.data || err?.message || err);
    return res.status(500).json({ error: err?.message || 'flow backtest failed' });
  }
});
/* ===== END: BLOCK K ===== */


/* ===== BEGIN: BLOCK M — Strategy Execution Endpoint ===== */
backtestRouter.post('/execute_strategy', requireAuth, async (req: Request, res: Response) => {
  try {
    const { elements } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Missing or invalid elements array' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    console.log('\n=== EXECUTING STRATEGY ===');
    console.log('Elements:', JSON.stringify(elements, null, 2));

    // Import execution engine
    const { executeStrategy, collectRequiredIndicators, buildIndicatorMap } = await import('../execution');

    // Step 1: Collect required indicators
    console.log('\nStep 1: Collecting required indicators...');
    const requiredIndicators = collectRequiredIndicators(elements);
    console.log('Required indicators:', requiredIndicators);

    // Step 2: Fetch indicator data from the indicator service
    console.log('\nStep 2: Fetching indicator data...');
    const indicatorValues: Array<any> = [];

    for (const req of requiredIndicators) {
      try {
        console.log(`  Fetching ${req.ticker} ${req.indicator} ${req.period}...`);

        // Fetch current price for the ticker
        const barsUrl = `https://data.alpaca.markets/v2/stocks/${req.ticker}/bars`;
        const barsResponse = await axios.get(barsUrl, {
          params: {
            feed: FEED,
            timeframe: '1Day',
            start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // Last year
            end: todayYMD(),
            adjustment: 'split',
            limit: 500,
          },
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });

        const bars = barsResponse.data.bars || [];

        if (!bars.length) {
          console.log(`    WARNING: No bars found for ${req.ticker}`);
          continue;
        }

        // Calculate the indicator using the indicator service
        let indicatorValue: number;

        if (req.indicator === 'PRICE' || req.indicator === 'CURRENT_PRICE') {
          // For price, just use the latest close
          indicatorValue = bars[bars.length - 1].c;
        } else {
          // Call indicator service
          const closes = bars.map((b: any) => b.c);
          const highs = bars.map((b: any) => b.h);
          const lows = bars.map((b: any) => b.l);
          const volumes = bars.map((b: any) => b.v);

          const period = parseInt(req.period) || 14;

          let payload: any = {
            indicator: req.indicator,
            params: { period },
          };

          // Add appropriate data based on indicator type
          if (req.indicator === 'RSI' || req.indicator === 'SMA' || req.indicator === 'EMA') {
            payload.close = closes;
            payload.prices = closes;
          } else if (req.indicator === 'ATR' || req.indicator === 'ADX') {
            payload.high = highs;
            payload.low = lows;
            payload.close = closes;
          } else if (req.indicator === 'MFI') {
            payload.high = highs;
            payload.low = lows;
            payload.close = closes;
            payload.volume = volumes;
          } else {
            payload.close = closes;
            payload.prices = closes;
          }

          const indResponse = await axios.post(`${INDICATOR_SERVICE_URL}/indicator`, payload, {
            timeout: 10000,
          });

          const values = indResponse.data.values || [];
          indicatorValue = values[values.length - 1]; // Latest value
        }

        console.log(`    ${req.ticker} ${req.indicator} ${req.period} = ${indicatorValue}`);

        indicatorValues.push({
          ticker: req.ticker,
          indicator: req.indicator,
          period: req.period,
          value: indicatorValue,
        });
      } catch (err: any) {
        console.error(`    ERROR fetching ${req.ticker} ${req.indicator}:`, err.message);
      }
    }

    // Step 3: Build indicator data map
    console.log('\nStep 3: Building indicator data map...');
    const indicatorData = buildIndicatorMap(indicatorValues);

    // Step 4: Execute strategy
    console.log('\nStep 4: Executing strategy...');
    const result = executeStrategy(elements, indicatorData);

    console.log('\n=== EXECUTION COMPLETE ===');
    console.log('Execution Path:');
    result.executionPath.forEach(line => console.log('  ' + line));

    console.log('\nFinal Positions:');
    result.positions.forEach(pos => {
      console.log(`  ${pos.ticker}: ${pos.weight.toFixed(2)}%`);
    });

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(err => console.log('  ' + err));
    }

    console.log('');

    return res.json({
      success: true,
      positions: result.positions,
      executionPath: result.executionPath,
      errors: result.errors,
      indicatorData: indicatorValues,
    });
  } catch (err: any) {
    console.error('POST /api/execute_strategy error:', err);
    return res.status(500).json({
      error: err.message || 'Strategy execution failed',
      details: err.response?.data || err.stack,
    });
  }
});
/* ===== END: BLOCK M ===== */


/* ===== BEGIN: BLOCK N — Strategy Backtest Endpoint (Historical) ===== */

backtestRouter.post('/backtest_strategy', async (req: Request, res: Response) => {
  const { runV2Backtest } = await import('../backtest/v2/engine');
  return runV2Backtest(req, res);
});
/* ===== END: BLOCK N ===== */


/* ===== BEGIN: BLOCK O — Validate Strategy Endpoint ===== */
backtestRouter.post('/validate_strategy', async (req: Request, res: Response) => {
  try {
    const { elements } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Missing or invalid elements array' });
    }

    const { validateStrategy } = await import('../execution');
    const validation = validateStrategy(elements);

    return res.json(validation);
  } catch (err: any) {
    console.error('POST /api/validate_strategy error:', err);
    return res.status(500).json({
      error: err.message || 'Strategy validation failed',
    });
  }
});
/* ===== END: BLOCK O ===== */



const batchJobs = new Map<string, BatchJobRecord>();

const normalizeAssignment = (combo: Record<string, any>): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!combo) return out;
  for (const [k, v] of Object.entries(combo)) out[String(k)] = String(v);
  return out;
};

type BatchRequestBody = {
  jobId?: string;
  jobName?: string;
  variables?: Array<{ name: string; values: string[] }>;
  assignments?: Array<Record<string, string>>;
  truncated?: boolean;
  total?: number;
  flow?: {
    globals: FlowGlobals;
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
};

const startBatchJob = async (job: BatchJobRecord, assignments: Array<Record<string, string>>) => {
  let combos = assignments.length ? assignments : generateAllAssignments(job.variables);
  if (assignments.length && job.total && job.total !== combos.length) {
    job.truncated = true;
  }
  job.total = combos.length;

  job.status = 'running';
  job.completed = 0;
  job.updatedAt = new Date().toISOString();
  job.error = null;
  job.result = null;

  if (!job.flow) {
    job.status = 'failed';
    job.error = 'Missing flow payload';
    job.updatedAt = new Date().toISOString();
    return;
  }

  const runs: BatchJobResult['runs'] = [];

  for (let idx = 0; idx < combos.length; idx++) {
    const assignment = combos[idx];
    try {
      const mutatedNodes = applyVariablesToNodes(job.flow.nodes, assignment);
      const payload = {
        globals: job.flow.globals,
        nodes: mutatedNodes,
        edges: job.flow.edges,
      };
      const response = await axios.post(`${INTERNAL_API_BASE}/api/backtest_flow`, payload, {
        headers: {
          'APCA-API-KEY-ID': job.flow.apiKey,
          'APCA-API-SECRET-KEY': job.flow.apiSecret,
        },
      });

      const resp = response?.data || {};
      const metricsRaw = resp.metrics || {};
      runs.push({
        variables: assignment,
        metrics: normalizeMetrics(metricsRaw),
      });

      job.completed = idx + 1;
      job.updatedAt = new Date().toISOString();
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.response?.data?.error || err?.message || 'Batch backtest failed';
      job.updatedAt = new Date().toISOString();
      return;
    }
  }

  job.status = 'finished';
  job.completed = runs.length;
  job.updatedAt = new Date().toISOString();
  job.completedAt = new Date().toISOString();
  job.viewUrl = `/api/batch_backtest/${job.id}/view`;
  job.csvUrl = `/api/batch_backtest/${job.id}/results.csv`;
  job.result = {
    summary: buildSummary(runs, runs.length),
    runs,
  };
};

backtestRouter.post('/batch_backtest', (req: Request, res: Response) => {
  const body = (req.body || {}) as BatchRequestBody;
  const variables = sanitizedVariables(body.variables);
  const totalFromBody = clampNumber(body.total, 0);
  const assignmentsRaw = Array.isArray(body.assignments)
    ? body.assignments.map(normalizeAssignment)
    : [];
  const computedTotal = variables.length
    ? variables.reduce((acc, v) => acc * (v.values.length || 0), 1)
    : assignmentsRaw.length;
  const flowPayload = body.flow;
  if (!flowPayload || !flowPayload.globals || !Array.isArray(flowPayload.nodes) || !Array.isArray(flowPayload.edges)) {
    return res.status(400).json({ error: 'Flow payload is required for batch backtests' });
  }

  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').toString();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').toString();
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  const total = totalFromBody > 0 ? totalFromBody : computedTotal;

  const id = body.jobId || randomUUID();
  const createdAt = new Date().toISOString();

  const job: BatchJobRecord = {
    id,
    name: body.jobName || `Batch ${id.slice(0, 8)}`,
    status: total ? 'queued' : 'finished',
    total,
    completed: 0,
    createdAt,
    updatedAt: createdAt,
    variables,
    truncated: Boolean(body.truncated),
    error: null,
    assignmentsPreview: assignmentsRaw.slice(0, 25),
    result: null,
    viewUrl: null,
    csvUrl: null,
    completedAt: total ? null : createdAt,
    flow: {
      globals: flowPayload.globals,
      nodes: flowPayload.nodes.map((node) => ({ ...node, data: JSON.parse(JSON.stringify(node.data)) })),
      edges: flowPayload.edges.map((edge) => ({ ...edge })),
      apiKey,
      apiSecret,
    },
  };

  batchJobs.set(id, job);

  if (total) {
    startBatchJob(job, assignmentsRaw).catch((err: any) => {
      job.status = 'failed';
      job.error = err?.message || 'Batch backtest failed';
      job.updatedAt = new Date().toISOString();
    });
  } else {
    job.result = {
      summary: buildSummary([], 0),
      runs: [],
    };
    job.viewUrl = `/api/batch_backtest/${id}/view`;
    job.csvUrl = `/api/batch_backtest/${id}/results.csv`;
  }

  return res.status(202).json({
    jobId: id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    truncated: job.truncated,
  });
});

backtestRouter.get('/batch_backtest/:id', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    total: job.total,
    completed: job.completed,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    truncated: job.truncated || false,
    error: job.error || null,
    detail: job.variables.map((v) => ({ name: v.name, count: v.values.length })),
    viewUrl: job.viewUrl || null,
    csvUrl: job.csvUrl || null,
  });
});

backtestRouter.get('/batch_backtest/:id/view', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  if (!job.result) return res.status(202).json({ status: job.status, message: 'Batch still running' });
  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    summary: job.result.summary,
    truncated: job.truncated || false,
    total: job.total,
    completed: job.completed,
    detail: job.variables,
    runs: job.result.runs,
  });
});

backtestRouter.get('/batch_backtest/:id/results.csv', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  if (!job.result) return res.status(202).json({ status: job.status, message: 'Batch still running' });

  const headers = job.variables.map((v) => v.name);

  const metricKeys = new Set<string>();
  for (const run of job.result.runs) {
    for (const key of Object.keys(run.metrics || {})) {
      metricKeys.add(key);
    }
  }
  const metricHeaders = Array.from(metricKeys).sort();

  const csvRows: string[] = [];
  csvRows.push([...headers, ...metricHeaders].join(','));

  for (const run of job.result.runs) {
    const rowValues = headers.map((h) => JSON.stringify(run.variables[h] ?? ''));
    for (const metricKey of metricHeaders) {
      const val = run.metrics[metricKey];
      rowValues.push(val !== undefined && val !== null ? val.toString() : '');
    }
    csvRows.push(rowValues.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="batch-${job.id}.csv"`);
  return res.send(csvRows.join('\n'));
});

type BatchStrategyRequestBody = {
  jobId?: string;
  jobName?: string;
  variables?: Array<{ name: string; values: string[] }>;
  assignments?: Array<Record<string, string>>;
  truncated?: boolean;
  total?: number;
  elements?: any[];
  benchmarkSymbol?: string;
  startDate?: string;
  endDate?: string;
  debug?: boolean;
  baseStrategy?: {
    elements: any[];
    benchmarkSymbol?: string;
    startDate?: string;
    endDate?: string;
    debug?: boolean;
  };
};

backtestRouter.post('/batch_backtest_strategy', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const body = (req.body || {}) as BatchStrategyRequestBody;
  const variables = sanitizedVariables(body.variables);
  const totalFromBody = clampNumber(body.total, 0);
  const assignmentsRaw = Array.isArray(body.assignments)
    ? body.assignments.map(normalizeAssignment)
    : [];
  const computedTotal = variables.length
    ? variables.reduce((acc, v) => acc * (v.values.length || 0), 1)
    : assignmentsRaw.length;

  const elements = body.baseStrategy?.elements || body.elements;
  if (!elements || !Array.isArray(elements)) {
    return res.status(400).json({ error: 'Elements array is required for batch strategy backtests' });
  }

  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').toString();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').toString();
  console.log(`[BATCH STRATEGY] API Key: ${apiKey ? apiKey.slice(0, 8) + '...' : 'MISSING'}, Secret: ${apiSecret ? apiSecret.slice(0, 8) + '...' : 'MISSING'}`);
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  const total = totalFromBody > 0 ? totalFromBody : computedTotal;

  const id = body.jobId || randomUUID();

  const startDate = body.baseStrategy?.startDate || body.startDate;
  const endDate = body.baseStrategy?.endDate || body.endDate;

  const dbJob = await batchJobsDb.createBatchJob({
    id,
    name: body.jobName || `Batch Strategy ${id.slice(0, 8)}`,
    kind: 'server',
    status: total ? 'queued' : 'finished',
    total,
    completed: 0,
    user_id: userId,
    completed_at: total ? null : new Date(),
    error: null,
    truncated: Boolean(body.truncated),
    variables: variables as any,
    strategy_elements: elements as any,
    start_date: startDate && startDate !== 'max' ? startDate : null,
    end_date: endDate && endDate !== 'max' ? endDate : null,
    benchmark_symbol: body.baseStrategy?.benchmarkSymbol || body.benchmarkSymbol || 'SPY',
    assignments_preview: assignmentsRaw.slice(0, 25) as any,
    summary: null,
  });

  if (total) {
    const worker = spawnBatchStrategyWorker({
      jobId: id,
      assignments: assignmentsRaw,
      apiKey,
      apiSecret,
    });

    worker.on('error', async (err) => {
      console.error('[BATCH] Worker spawn error:', err);
      await batchJobsDb.updateBatchJob(id, {
        status: 'failed',
        error: err?.message || 'Batch worker failed to start',
      });
    });

    worker.on('exit', async (code) => {
      if (code && code !== 0) {
        console.error(`[BATCH] Worker exited with code ${code}`);
        await batchJobsDb.updateBatchJob(id, {
          status: 'failed',
          error: `Batch worker exited with status ${code}`,
        });
      }
    });
  } else {
    await batchJobsDb.updateBatchJob(id, {
      summary: buildSummary([], 0) as any,
    });
  }

  const createdAtIso =
    dbJob.created_at instanceof Date ? dbJob.created_at.toISOString() : new Date().toISOString();
  const updatedAtIso =
    dbJob.updated_at instanceof Date ? dbJob.updated_at.toISOString() : createdAtIso;
  const startedAtIso =
    dbJob.started_at instanceof Date ? dbJob.started_at.toISOString() : null;

  return res.status(202).json({
    jobId: id,
    status: dbJob.status,
    total: dbJob.total,
    completed: dbJob.completed,
    truncated: dbJob.truncated,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    startedAt: startedAtIso,
    durationMs: null,
  });
});

backtestRouter.get('/batch_backtest_strategy/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const job = await batchJobsDb.getBatchJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  const toIso = (value: Date | string | null | undefined) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const createdAtIso = toIso(job.created_at);
  const updatedAtIso = toIso(job.updated_at);
  const startedAtIso = toIso(job.started_at);
  const completedAtIso = toIso(job.completed_at);

  let durationMs: number | null = null;
  if (startedAtIso) {
    const startMs = new Date(startedAtIso).getTime();
    const endMs = completedAtIso ? new Date(completedAtIso).getTime() : Date.now();
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      durationMs = Math.max(0, endMs - startMs);
    }
  }

  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    total: job.total,
    completed: job.completed,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    durationMs,
    truncated: job.truncated || false,
    error: job.error || null,
    detail: (job.variables as any[]).map((v) => ({
      name: v.name,
      count: Array.isArray(v.values) ? v.values.length : 0,
      values: Array.isArray(v.values) ? v.values : [],
      label: v.label,
      originalName: v.originalName,
    })),
    viewUrl: job.status === 'finished' ? `/api/batch_backtest_strategy/${job.id}/view` : null,
    csvUrl: job.status === 'finished' ? `/api/batch_backtest_strategy/${job.id}/results.csv` : null,
    summary: job.summary || null,
  });
});

backtestRouter.post('/batch_backtest_strategy/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const job = await batchJobsDb.getBatchJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  if (job.status !== 'running' && job.status !== 'queued') {
    return res.status(400).json({ error: 'Can only cancel running or queued jobs' });
  }

  const deleted = await batchJobsDb.deleteBatchJob(req.params.id);

  if (!deleted) {
    return res.status(500).json({ error: 'Failed to delete job' });
  }

  return res.json({ success: true, message: 'Job deleted' });
});

backtestRouter.get('/batch_backtest_strategy/:id/view', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const jobWithRuns = await batchJobsDb.getBatchJobWithRuns(req.params.id);
  if (!jobWithRuns) return res.status(404).json({ error: 'batch strategy job not found' });

  const { job, runs } = jobWithRuns;

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  if (job.status !== 'finished') {
    return res.status(202).json({ status: job.status, message: 'Batch still running' });
  }

  return res.json({
    jobId: job.id,
    name: job.name,
    status: job.status,
    summary: job.summary,
    truncated: job.truncated || false,
    total: job.total,
    completed: job.completed,
    detail: job.variables,
    runs: runs.map((r) => ({
      variables: r.variables,
      metrics: r.metrics,
    })),
  });
});

backtestRouter.get('/batch_backtest_strategy/:id/results.csv', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const jobWithRuns = await batchJobsDb.getBatchJobWithRuns(req.params.id);
  if (!jobWithRuns) return res.status(404).json({ error: 'batch strategy job not found' });

  const { job, runs } = jobWithRuns;

  if (job.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden: You do not own this batch job' });
  }

  if (job.status !== 'finished') {
    return res.status(202).json({ status: job.status, message: 'Batch still running' });
  }

  const headers = (job.variables as any[]).map((v) => v.name);

  const metricKeys = new Set<string>();
  for (const run of runs) {
    for (const key of Object.keys((run.metrics as any) || {})) {
      metricKeys.add(key);
    }
  }
  const metricHeaders = Array.from(metricKeys).sort();

  const csvRows: string[] = [];
  csvRows.push([...headers, ...metricHeaders].join(','));

  for (const run of runs) {
    const rowValues = headers.map((h) => JSON.stringify(run.variables[h] ?? ''));
    for (const metricKey of metricHeaders) {
      const val = run.metrics[metricKey];
      rowValues.push(val !== undefined && val !== null ? val.toString() : '');
    }
    csvRows.push(rowValues.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="batch-strategy-${job.id}.csv"`);
  return res.send(csvRows.join('\n'));
});

/* ===== BEGIN: BLOCK I — GET /api/bars (paged) ===== */
backtestRouter.get('/bars', async (req: Request, res: Response) => {
  const { symbol, start, end, timeframe = '1Day', adj = 'all' } = req.query as any;
  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const startQ = start ? String(start) : '1900-01-01';
  const endQ = end ? String(end) : todayYMD();
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  try {
    const bars = await fetchBarsPaged(String(symbol), startQ, endQ, String(timeframe), apiKey, apiSecret, adj === 'split' ? 'split' : 'all');
    return res.json({ bars });
  } catch (err: any) {
    console.error('GET /api/bars error:', err.response?.data || err.message);
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});
/* ===== END: BLOCK I ===== */


export default backtestRouter;

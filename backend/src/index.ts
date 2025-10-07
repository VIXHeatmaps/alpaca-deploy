/* ===== BEGIN: BLOCK A — Imports & Config (Backend) ===== */
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { Strategy as DiscordStrategy, Profile } from 'passport-discord';
import passport from 'passport';

const app = express();
const port = Number(process.env.PORT) || 4000;
const INDICATOR_SERVICE_URL = process.env.INDICATOR_SERVICE_URL || 'http://127.0.0.1:8001';
const QUANTSTATS_URL = `${INDICATOR_SERVICE_URL}/metrics/quantstats`;
const QUANTSTATS_TIMEOUT_MS = Number(process.env.QUANTSTATS_TIMEOUT_MS || 5000);
const FEED: string = (process.env.ALPACA_FEED || 'sip').toLowerCase();
const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE || `http://127.0.0.1:${port}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const parseCsvEnv = (value: string | undefined, normalize?: (input: string) => string): Set<string> => {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (normalize ? normalize(item) : item))
  );
};

const DISCORD_ALLOWED_USER_IDS = parseCsvEnv(process.env.DISCORD_ALLOWED_USER_IDS);
const DISCORD_ALLOWED_EMAILS = parseCsvEnv(process.env.DISCORD_ALLOWED_EMAILS, (email) => email.toLowerCase());
const DISCORD_ALLOWED_EMAIL_DOMAINS = parseCsvEnv(
  process.env.DISCORD_ALLOWED_EMAIL_DOMAINS,
  (domain) => domain.replace(/^\./, '').toLowerCase()
);

type DiscordWhitelistResult =
  | { allowed: true }
  | { allowed: false; code: 'discord_email_required' | 'discord_whitelist_denied'; detail: string };

const isDiscordWhitelistEnabled =
  DISCORD_ALLOWED_USER_IDS.size > 0 ||
  DISCORD_ALLOWED_EMAILS.size > 0 ||
  DISCORD_ALLOWED_EMAIL_DOMAINS.size > 0;

const checkDiscordWhitelist = (profile: Profile): DiscordWhitelistResult => {
  if (!isDiscordWhitelistEnabled) {
    return { allowed: true };
  }

  const userId = profile.id;
  if (DISCORD_ALLOWED_USER_IDS.has(userId)) {
    return { allowed: true };
  }

  const email = (profile.email || '').toLowerCase();
  if (!email && (DISCORD_ALLOWED_EMAILS.size > 0 || DISCORD_ALLOWED_EMAIL_DOMAINS.size > 0)) {
    return {
      allowed: false,
      code: 'discord_email_required',
      detail: 'Discord account must have a verified email to access this application.',
    };
  }

  if (email && DISCORD_ALLOWED_EMAILS.has(email)) {
    return { allowed: true };
  }

  if (email) {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain && DISCORD_ALLOWED_EMAIL_DOMAINS.has(domain)) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    code: 'discord_whitelist_denied',
    detail: 'Your Discord account is not on the approved access list.',
  };
};

type BatchJobStatus = 'queued' | 'running' | 'finished' | 'failed';

type BatchJobRecord = {
  id: string;
  name: string;
  status: BatchJobStatus;
  total: number;
  completed: number;
  createdAt: string;
  updatedAt: string;
  variables: Array<{ name: string; values: string[] }>;
  truncated?: boolean;
  error?: string | null;
  assignmentsPreview: Array<Record<string, string>>;
  result?: BatchJobResult | null;
  viewUrl?: string | null;
  csvUrl?: string | null;
  completedAt?: string | null;
  flow: {
    globals: FlowGlobals;
    nodes: FlowNode[];
    edges: FlowEdge[];
    apiKey: string;
    apiSecret: string;
  };
};

type BatchJobResult = {
  summary: {
    totalRuns: number;
    avgTotalReturn: number;
    bestTotalReturn: number;
    worstTotalReturn: number;
  };
  runs: Array<{
    variables: Record<string, string>;
    metrics: Record<string, number>;
  }>;
};

const batchJobs = new Map<string, BatchJobRecord>();

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

const clampNumber = (val: any, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const sanitizedVariables = (vars: Array<{ name: string; values: string[] }> | undefined) =>
  (vars || []).map((v) => ({
    name: String(v?.name || 'var'),
    values: Array.isArray(v?.values) ? v!.values.map((x) => String(x)) : [],
  }));

const buildSummary = (runs: BatchJobResult['runs'], totalRuns: number) => {
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

const generateAllAssignments = (vars: Array<{ name: string; values: string[] }>): Array<Record<string, string>> => {
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

const replaceVariableTokens = (value: any, vars: Record<string, string>): any => {
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

const applyVariablesToNodes = (nodes: FlowNode[], assignment: Record<string, string>): FlowNode[] => {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(assignment)) normalized[normalizeVarToken(k)] = String(v);
  return nodes.map((node) => ({
    ...node,
    data: replaceVariableTokens(node.data, normalized),
  }));
};

const applyVariablesToElements = (elements: any[], assignment: Record<string, string>): any[] => {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(assignment)) normalized[normalizeVarToken(k)] = String(v);
  return elements.map((element) => replaceVariableTokens(element, normalized));
};

async function startBatchJob(job: BatchJobRecord, assignments: Array<Record<string, string>>) {
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
}

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser());

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days

// Helper functions for JWT
function generateToken(user: any): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Passport configuration (minimal, just for OAuth)
app.use(passport.initialize());

// Discord OAuth Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  callbackURL: `${process.env.BACKEND_URL || `http://localhost:${port}`}/auth/discord/callback`,
  scope: ['identify', 'email']
}, (_accessToken: string, _refreshToken: string, profile: Profile, done: any) => {
  const whitelistResult = checkDiscordWhitelist(profile);
  if (whitelistResult.allowed === false) {
    const { code, detail } = whitelistResult;
    console.warn(`[AUTH] Discord user ${profile.id} rejected: ${detail} (code: ${code})`);
    return done(null, false, {
      message: code,
      detail,
    });
  }

  // Return user profile (will be encoded in JWT)
  return done(null, {
    id: profile.id,
    username: profile.username,
    discriminator: profile.discriminator,
    avatar: profile.avatar,
    email: profile.email
  });
}));

// Auth middleware to protect routes
function requireAuth(req: Request, res: Response, next: any) {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  (req as any).user = user;
  return next();
}

/* ===== END: BLOCK A ===== */


/* ===== BEGIN: BLOCK B — Date Utilities (RFC3339 helpers) ===== */
const normalizeDate = (s: string) => (s ? s.replace(/[./]/g, '-') : s);
const toRFC3339Start = (s: string) => {
  const v = normalizeDate(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v;
};
const toRFC3339End = (s: string) => {
  const v = normalizeDate(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59Z` : v;
};
const toYMD = (s: string) => (s || '').slice(0, 10);
const todayYMD = () => new Date().toISOString().slice(0, 10);
/* ===== END: BLOCK B ===== */


/* ===== BEGIN: BLOCK AUTH — Discord OAuth Routes ===== */

// Initiate Discord OAuth
app.get('/auth/discord', passport.authenticate('discord'));

// Discord OAuth callback
app.get('/auth/discord/callback', (req: Request, res: Response, next) => {
  passport.authenticate('discord', { session: false }, (err, user, info) => {
    if (err) {
      console.error('[AUTH] Discord callback error:', err);
      const redirectUrl = new URL(FRONTEND_URL);
      redirectUrl.searchParams.set('authError', 'auth_internal_error');
      return res.redirect(redirectUrl.toString());
    }

    if (!user) {
      const redirectUrl = new URL(FRONTEND_URL);
      const errorCode = typeof info?.message === 'string' ? info.message : 'auth_failed';
      redirectUrl.searchParams.set('authError', errorCode);
      if (info?.detail && typeof info.detail === 'string') {
        redirectUrl.searchParams.set('authErrorDetail', info.detail);
      }
      return res.redirect(redirectUrl.toString());
    }

    const token = generateToken(user);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(FRONTEND_URL);
  })(req, res, next);
});

// Get current user
app.get('/auth/user', (req: Request, res: Response) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  res.json({ user });
});

// Logout
app.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({ success: true });
});

/* ===== END: BLOCK AUTH ===== */


/* ===== BEGIN: BLOCK C — Health/Debug Endpoints ===== */
app.get('/health', (_req, res) => res.json({ ok: true, service: 'api', port }));
app.get('/api/health', (_req: Request, res: Response) => res.json({ status: 'ok', port }));

app.get('/indicators/health', async (_req, res) => {
  try {
    const r = await axios.get(`${INDICATOR_SERVICE_URL}/health`).catch((err) =>
      err.response ? err.response : Promise.reject(err)
    );
    return res.json({ ok: true, reachable: true, status: r.status, upstream: r.data ?? null });
  } catch (err: any) {
    return res.status(502).json({ ok: false, reachable: false, error: err.message });
  }
});

app.get('/api/debug/env', (req: Request, res: Response) => {
  res.json({
    hasKey: !!process.env.ALPACA_API_KEY,
    hasSecret: !!process.env.ALPACA_API_SECRET,
    headerKey: !!req.header('APCA-API-KEY-ID'),
    headerSecret: !!req.header('APCA-API-SECRET-KEY'),
    feed: FEED,
    indicatorAdjustment: 'split',
    returnsAdjustment: 'all',
  });
});

app.get('/api/account', async (req: Request, res: Response) => {
  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Missing Alpaca API credentials' });
  }

  try {
    const response = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 10000,
    });

    return res.json(response.data);
  } catch (err: any) {
    console.error('GET /api/account error:', err?.response?.data || err?.message);
    return res.status(err?.response?.status || 500).json({
      error: err?.response?.data?.message || err?.message || 'Failed to fetch account information',
    });
  }
});
/* ===== END: BLOCK C ===== */


/* ===== BEGIN: BLOCK C-2 — Live Trading Endpoints ===== */
import { getActiveStrategy, setActiveStrategy, clearActiveStrategy, hasActiveStrategy } from './storage/activeStrategy';
import { placeMarketOrder, waitForFill, getCurrentPrice, getAlpacaPositions } from './services/orders';
import { evaluateFlowWithCurrentPrices, extractSymbols } from './services/flowEval';
import { genId } from './utils/id';

/**
 * GET /api/strategy
 * Get current active strategy with live holdings data
 */
app.get('/api/strategy', async (req: Request, res: Response) => {
  try {
    const strategy = await getActiveStrategy();

    if (!strategy) {
      return res.json({ strategy: null });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      // Return strategy without live data if no credentials
      return res.json({ strategy });
    }

    // Get live positions from Alpaca
    const positions = await getAlpacaPositions(apiKey, apiSecret);

    // Calculate current value from live positions
    let currentValue = 0;
    const liveHoldings = strategy.holdings.map(h => {
      const pos = positions.find(p => p.symbol === h.symbol);
      const marketValue = pos?.market_value || 0;
      currentValue += marketValue;
      return {
        symbol: h.symbol,
        qty: pos?.qty || h.qty,
        marketValue,
      };
    });

    const totalReturn = currentValue - strategy.investAmount;
    const totalReturnPct = (totalReturn / strategy.investAmount) * 100;

    return res.json({
      strategy: {
        ...strategy,
        currentValue,
        totalReturn,
        totalReturnPct,
        holdings: liveHoldings,
      },
    });
  } catch (err: any) {
    console.error('GET /api/strategy error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get strategy' });
  }
});

/**
 * GET /api/strategy/snapshots
 * Get daily snapshots for the active strategy
 */
app.get('/api/strategy/snapshots', async (req: Request, res: Response) => {
  try {
    const strategy = await getActiveStrategy();

    if (!strategy) {
      return res.json({ snapshots: [] });
    }

    const { getSnapshots } = await import('./storage/strategySnapshots');
    const snapshots = await getSnapshots(strategy.id);

    return res.json({ snapshots });
  } catch (err: any) {
    console.error('GET /api/strategy/snapshots error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get snapshots' });
  }
});

/**
 * POST /api/invest
 * Deploy a strategy with initial investment
 */
app.post('/api/invest', async (req: Request, res: Response) => {
  try {
    // Check if strategy already exists
    if (await hasActiveStrategy()) {
      return res.status(400).json({ error: 'A strategy is already active. Liquidate it first.' });
    }

    const { name, amount, flow, benchmarkSymbol } = req.body;

    if (!name || !amount || !flow) {
      return res.status(400).json({ error: 'Missing required fields: name, amount, flow' });
    }

    const investAmount = parseFloat(amount);
    if (!Number.isFinite(investAmount) || investAmount <= 0) {
      return res.status(400).json({ error: 'Invalid investment amount' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    console.log(`\n=== INVEST: ${name} with $${investAmount} ===`);

    // Step 1: Evaluate Flow logic
    console.log('Step 1: Evaluating Flow logic...');
    const allocation = await evaluateFlowWithCurrentPrices(flow, apiKey, apiSecret);
    console.log('Target allocation:', allocation);

    // Step 2: Place orders
    console.log('Step 2: Placing orders...');
    const holdings: Array<{ symbol: string; qty: number }> = [];
    const pendingOrders: Array<{ orderId: string; symbol: string; side: 'buy' | 'sell'; qty: number }> = [];
    let totalInvested = 0;

    for (const [symbol, percentage] of Object.entries(allocation)) {
      const targetDollars = investAmount * percentage;
      const price = await getCurrentPrice(symbol, apiKey, apiSecret);
      const qty = targetDollars / price;

      console.log(`  ${symbol}: $${targetDollars.toFixed(2)} / $${price.toFixed(2)} = ${qty.toFixed(4)} shares`);

      // Place order
      const order = await placeMarketOrder(symbol, qty, 'buy', apiKey, apiSecret);
      console.log(`  Order placed: ${order.id}`);

      // Wait for fill (returns pending if market closed)
      const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

      if (pending) {
        console.log(`  Order pending (market closed) - will fill when market opens`);
        // Store order info for later verification
        pendingOrders.push({ orderId: order.id, symbol, side: 'buy', qty });
        holdings.push({ symbol, qty: 0 }); // Will update after market opens
      } else {
        console.log(`  Filled: ${filledQty} @ $${avgPrice.toFixed(2)}`);
        holdings.push({ symbol, qty: filledQty });
        totalInvested += filledQty * avgPrice;
      }
    }

    // Step 3: Create and save strategy
    console.log('Step 3: Saving strategy...');
    const deployedAt = new Date();
    const deployTimestamp = deployedAt.toISOString().slice(0, 16).replace('T', ' '); // YYYY-MM-DD HH:mm
    const deployedName = `${name} [Deployed: ${deployTimestamp}]`;

    const strategy = {
      id: genId(),
      name: deployedName,
      investAmount,
      currentValue: totalInvested,
      flowData: flow,
      holdings,
      pendingOrders: pendingOrders.length > 0 ? pendingOrders : undefined,
      createdAt: deployedAt.toISOString(),
      lastRebalance: deployedAt.toISOString(),
    };

    await setActiveStrategy(strategy);
    console.log(`Strategy saved: ${strategy.id}`);

    // Create initial snapshot (only if orders filled immediately)
    if (pendingOrders.length === 0 && holdings.length > 0) {
      console.log('Creating initial snapshot...');
      const { createSnapshot } = await import('./storage/strategySnapshots');

      // Get prices for snapshot
      const holdingsWithPrices = await Promise.all(
        holdings.map(async h => ({
          symbol: h.symbol,
          qty: h.qty,
          price: await getCurrentPrice(h.symbol, apiKey, apiSecret),
        }))
      );

      await createSnapshot(
        strategy.id,
        investAmount,
        holdingsWithPrices,
        'initial'
      );
      console.log('Initial snapshot created');
    }

    console.log('=== INVEST COMPLETE ===\n');

    return res.json({
      success: true,
      strategy: {
        id: strategy.id,
        name: strategy.name,
        investAmount: strategy.investAmount,
        currentValue: strategy.currentValue,
        holdings: strategy.holdings,
      },
    });
  } catch (err: any) {
    console.error('POST /api/invest error:', err);
    return res.status(500).json({ error: err.message || 'Investment failed' });
  }
});

/**
 * POST /api/rebalance
 * Manually trigger rebalancing of the active strategy
 */
app.post('/api/rebalance', requireAuth, async (req: Request, res: Response) => {
  try {
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    if (!await hasActiveStrategy()) {
      return res.status(400).json({ error: 'No active strategy to rebalance' });
    }

    console.log('\n=== MANUAL REBALANCE TRIGGERED ===');

    const { rebalanceActiveStrategy } = await import('./services/rebalance');
    const result = await rebalanceActiveStrategy(apiKey, apiSecret);

    return res.json({
      success: true,
      soldSymbols: result.soldSymbols,
      boughtSymbols: result.boughtSymbols,
      cashRemaining: result.cashRemaining,
      holdings: result.updatedHoldings,
    });
  } catch (err: any) {
    console.error('POST /api/rebalance error:', err);
    return res.status(500).json({ error: err.message || 'Rebalance failed' });
  }
});

/**
 * POST /api/liquidate
 * Liquidates the active strategy by selling all positions
 * Works immediately if market is open, or queues orders for next market open
 */
app.post('/api/liquidate', requireAuth, async (req: Request, res: Response) => {
  try {
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    const strategy = await getActiveStrategy();
    if (!strategy) {
      return res.status(400).json({ error: 'No active strategy to liquidate' });
    }

    console.log(`\n=== LIQUIDATING STRATEGY: ${strategy.name} ===`);

    // Import necessary services
    const { placeMarketOrder, waitForFill } = await import('./services/orders');

    const soldPositions: Array<{ symbol: string; qty: number; proceeds: number }> = [];
    let totalProceeds = 0;

    // Sell all holdings
    for (const holding of strategy.holdings) {
      if (holding.qty <= 0) continue;

      try {
        console.log(`Selling ${holding.qty.toFixed(4)} ${holding.symbol}...`);
        const order = await placeMarketOrder(holding.symbol, holding.qty, 'sell', apiKey, apiSecret);
        const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

        if (pending) {
          console.log(`Sell order pending for ${holding.symbol} - will fill when market opens`);
          soldPositions.push({ symbol: holding.symbol, qty: filledQty, proceeds: 0 });
        } else {
          const proceeds = filledQty * avgPrice;
          totalProceeds += proceeds;
          soldPositions.push({ symbol: holding.symbol, qty: filledQty, proceeds });
          console.log(`Sold ${filledQty} ${holding.symbol} @ $${avgPrice.toFixed(2)} = $${proceeds.toFixed(2)}`);
        }
      } catch (err: any) {
        console.error(`Failed to sell ${holding.symbol}:`, err.message);
        // Continue selling other positions even if one fails
      }
    }

    // Create final snapshot before clearing (only if orders filled immediately)
    if (totalProceeds > 0) {
      console.log('Creating final liquidation snapshot...');
      const { createSnapshot } = await import('./storage/strategySnapshots');

      // All positions sold, so empty holdings with proceeds as cash
      await createSnapshot(
        strategy.id,
        strategy.investAmount,
        [], // No holdings left
        'liquidation'
      );
      console.log('Final snapshot created');
    }

    // Clear the active strategy
    await clearActiveStrategy();

    console.log('=== LIQUIDATION COMPLETE ===');
    console.log(`Total proceeds: $${totalProceeds.toFixed(2)}`);

    return res.json({
      success: true,
      message: 'Strategy liquidated successfully',
      soldPositions,
      totalProceeds,
    });
  } catch (err: any) {
    console.error('POST /api/liquidate error:', err);
    return res.status(500).json({ error: err.message || 'Liquidation failed' });
  }
});
/* ===== END: BLOCK C-2 ===== */


/* ===== BEGIN: BLOCK C-1 — Batch Backtest Endpoints ===== */
const normalizeAssignment = (combo: Record<string, any>): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!combo) return out;
  for (const [k, v] of Object.entries(combo)) out[String(k)] = String(v);
  return out;
};

app.post('/api/batch_backtest', (req: Request, res: Response) => {
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

  console.log('[BACKEND DEBUG] body.jobName:', body.jobName, 'type:', typeof body.jobName);

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

app.get('/api/batch_backtest/:id', (req: Request, res: Response) => {
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

app.get('/api/batch_backtest/:id/view', (req: Request, res: Response) => {
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

app.get('/api/batch_backtest/:id/results.csv', (req: Request, res: Response) => {
  const job = batchJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch job not found' });
  if (!job.result) return res.status(202).json({ status: job.status, message: 'Batch still running' });

  const headers = job.variables.map((v) => v.name);

  // Collect all unique metric keys from all runs
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

/* ===== BEGIN: BLOCK C-2 — Batch Backtest Strategy Endpoints ===== */
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
  // Support for VerticalUI2 format
  baseStrategy?: {
    elements: any[];
    benchmarkSymbol?: string;
    startDate?: string;
    endDate?: string;
    debug?: boolean;
  };
};

type BatchStrategyJobRecord = {
  id: string;
  name: string;
  status: BatchJobStatus;
  total: number;
  completed: number;
  createdAt: string;
  updatedAt: string;
  variables: Array<{ name: string; values: string[] }>;
  truncated: boolean;
  error: string | null;
  assignmentsPreview: Array<Record<string, string>>;
  result: BatchJobResult | null;
  viewUrl: string | null;
  csvUrl: string | null;
  completedAt: string | null;
  strategy?: {
    elements: any[];
    benchmarkSymbol: string;
    startDate: string;
    endDate: string;
    debug: boolean;
    apiKey: string;
    apiSecret: string;
  };
};

const batchStrategyJobs = new Map<string, BatchStrategyJobRecord>();

async function startBatchStrategyJob(job: BatchStrategyJobRecord, assignments: Array<Record<string, string>>) {
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

  if (!job.strategy) {
    job.status = 'failed';
    job.error = 'Missing strategy payload';
    job.updatedAt = new Date().toISOString();
    return;
  }

  const runs: BatchJobResult['runs'] = [];

  for (let idx = 0; idx < combos.length; idx++) {
    const assignment = combos[idx];
    try {
      console.log(`\nBatch job ${job.id}: Running backtest ${idx + 1}/${combos.length}...`);
      console.log('Assignment:', assignment);

      const mutatedElements = applyVariablesToElements(job.strategy.elements, assignment);
      const payload = {
        elements: mutatedElements,
        benchmarkSymbol: job.strategy.benchmarkSymbol,
        startDate: job.strategy.startDate,
        endDate: job.strategy.endDate,
        debug: job.strategy.debug,
      };
      const response = await axios.post(`${INTERNAL_API_BASE}/api/backtest_strategy`, payload, {
        headers: {
          'APCA-API-KEY-ID': job.strategy.apiKey,
          'APCA-API-SECRET-KEY': job.strategy.apiSecret,
        },
        timeout: 300000, // 5 minutes per backtest
      });

      const resp = response?.data || {};
      const metricsRaw = resp.metrics || {};
      runs.push({
        variables: assignment,
        metrics: normalizeMetrics(metricsRaw),
      });

      job.completed = idx + 1;
      job.updatedAt = new Date().toISOString();
      console.log(`Batch job ${job.id}: Completed ${job.completed}/${job.total}`);
    } catch (err: any) {
      console.error(`Batch job ${job.id} failed:`, err?.response?.data || err?.message || err);
      job.status = 'failed';
      job.error = err?.response?.data?.error || err?.message || 'Batch strategy backtest failed';
      job.updatedAt = new Date().toISOString();
      return;
    }
  }

  job.status = 'finished';
  job.completed = runs.length;
  job.updatedAt = new Date().toISOString();
  job.completedAt = new Date().toISOString();
  job.viewUrl = `/api/batch_backtest_strategy/${job.id}/view`;
  job.csvUrl = `/api/batch_backtest_strategy/${job.id}/results.csv`;
  job.result = {
    summary: buildSummary(runs, runs.length),
    runs,
  };
}

app.post('/api/batch_backtest_strategy', (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as BatchStrategyRequestBody;
    const variables = sanitizedVariables(body.variables);
    const totalFromBody = clampNumber(body.total, 0);
    const assignmentsRaw = Array.isArray(body.assignments)
      ? body.assignments.map(normalizeAssignment)
      : [];
    const computedTotal = variables.length
      ? variables.reduce((acc, v) => acc * (v.values.length || 0), 1)
      : assignmentsRaw.length;

    // Support both direct elements and baseStrategy.elements format (VerticalUI2)
    const elements = body.baseStrategy?.elements || body.elements;
    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Elements array is required for batch strategy backtests' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').toString();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').toString();
    if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Missing Alpaca API credentials' });

  const total = totalFromBody > 0 ? totalFromBody : computedTotal;

  const id = body.jobId || randomUUID();
  const createdAt = new Date().toISOString();

  const job: BatchStrategyJobRecord = {
    id,
    name: body.jobName || `Batch Strategy ${id.slice(0, 8)}`,
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
    strategy: {
      elements,
      benchmarkSymbol: body.baseStrategy?.benchmarkSymbol || body.benchmarkSymbol || 'SPY',
      startDate: body.baseStrategy?.startDate || body.startDate || 'max',
      endDate: body.baseStrategy?.endDate || body.endDate || '2024-12-31',
      debug: body.baseStrategy?.debug ?? body.debug ?? false,
      apiKey,
      apiSecret,
    },
  };

  batchStrategyJobs.set(id, job);

  if (total) {
    startBatchStrategyJob(job, assignmentsRaw).catch((err: any) => {
      job.status = 'failed';
      job.error = err?.message || 'Batch strategy backtest failed';
      job.updatedAt = new Date().toISOString();
    });
  } else {
    job.result = {
      summary: buildSummary([], 0),
      runs: [],
    };
    job.viewUrl = `/api/batch_backtest_strategy/${id}/view`;
    job.csvUrl = `/api/batch_backtest_strategy/${id}/results.csv`;
  }

    return res.status(202).json({
      jobId: id,
      status: job.status,
      total: job.total,
      completed: job.completed,
      truncated: job.truncated,
    });
  } catch (err: any) {
    console.error('Batch backtest strategy endpoint error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

app.get('/api/batch_backtest_strategy/:id', (req: Request, res: Response) => {
  const job = batchStrategyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });
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

app.post('/api/batch_backtest_strategy/:id/cancel', (req: Request, res: Response) => {
  const job = batchStrategyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });

  if (job.status !== 'running' && job.status !== 'queued') {
    return res.status(400).json({ error: 'Can only cancel running or queued jobs' });
  }

  job.status = 'failed';
  job.error = 'Cancelled by user';
  job.updatedAt = new Date().toISOString();
  job.completedAt = new Date().toISOString();

  return res.json({ success: true, message: 'Job cancelled' });
});

app.get('/api/batch_backtest_strategy/:id/view', (req: Request, res: Response) => {
  const job = batchStrategyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });
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

app.get('/api/batch_backtest_strategy/:id/results.csv', (req: Request, res: Response) => {
  const job = batchStrategyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'batch strategy job not found' });
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
  res.setHeader('Content-Disposition', `attachment; filename="batch-strategy-${job.id}.csv"`);
  return res.send(csvRows.join('\n'));
});
/* ===== END: BLOCK C-2 ===== */

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


function normalizeMetrics(raw: any): Record<string, number> {
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
app.get('/api/bars', async (req: Request, res: Response) => {
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
app.post('/api/backtest', async (req: Request, res: Response) => {
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

type FlowGlobals = { benchmarkSymbol: string; start: string; end: string; debug: boolean };
type FlowNode = { id: string; type: 'start' | 'gate' | 'weights' | 'portfolio'; data: any; };
type FlowEdge = { from: string; to: string; label?: 'then' | 'else' };
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

app.post('/api/backtest_flow', async (req: Request, res: Response) => {
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
app.post('/api/execute_strategy', requireAuth, async (req: Request, res: Response) => {
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
    const { executeStrategy, collectRequiredIndicators, buildIndicatorMap } = await import('./execution');

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
app.post('/api/backtest_strategy', async (req: Request, res: Response) => {
  try {
    const { elements, benchmarkSymbol, startDate, endDate, debug } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Missing or invalid elements array' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    console.log('\n=== BACKTESTING STRATEGY (HISTORICAL) ===');
    console.log(`Benchmark: ${benchmarkSymbol || 'SPY'}`);
    console.log(`Start: ${startDate || 'max'}, End: ${endDate || todayYMD()}`);
    console.log(`Debug: ${debug}`);

    // Import execution engine
    const { collectRequiredIndicators, createIndicatorKey, buildIndicatorMap } = await import('./execution');

    // Collect required indicators and tickers
    console.log('\nStep 1: Collecting required indicators and tickers...');
    const requiredIndicators = collectRequiredIndicators(elements);
    console.log('Required indicators:', requiredIndicators);

    // Collect all tickers from the strategy
    const tickers = new Set<string>();
    function collectTickers(els: any[]): void {
      for (const el of els) {
        if (el.type === 'ticker') tickers.add(el.ticker.toUpperCase());
        if (el.children) collectTickers(el.children);
        if (el.thenChildren) collectTickers(el.thenChildren);
        if (el.elseChildren) collectTickers(el.elseChildren);
      }
    }
    collectTickers(elements);
    console.log('Tickers in strategy:', Array.from(tickers));

    const bench = (benchmarkSymbol || 'SPY').toUpperCase();
    tickers.add(bench);

    const requestedEnd = endDate || todayYMD();
    // Use provided startDate, or default to 10 years ago (Alpaca's max is ~10 years anyway)
    const effectiveStart = startDate === 'max' || !startDate
      ? new Date(new Date().setFullYear(new Date().getFullYear() - 10)).toISOString().split('T')[0]
      : startDate;
    const TF = '1Day';

    // Step 2: Fetch all indicator bars and TR bars
    console.log('\nStep 2: Fetching historical data...');

    const indBarsByKey = new Map<string, SimpleBar[]>();
    const uniqueIndicatorFetches = new Map<string, { ticker: string; indicator: string; period: string }>();

    for (const req of requiredIndicators) {
      const key = `${req.ticker}|${req.indicator}|${req.period}`;
      if (!uniqueIndicatorFetches.has(key)) {
        uniqueIndicatorFetches.set(key, req);
      }
    }

    await Promise.all(Array.from(uniqueIndicatorFetches.values()).map(async (req) => {
      const key = `${req.ticker}|${req.indicator}|${req.period}`;
      const bars = await fetchBarsPaged(req.ticker, effectiveStart, requestedEnd, TF, apiKey, apiSecret, 'split');
      console.log(`  Fetched ${bars.length} bars for ${req.ticker} (indicator calc)`);
      indBarsByKey.set(key, bars);
    }));

    const trBarsBySym = new Map<string, SimpleBar[]>();
    await Promise.all(Array.from(tickers).map(async (sym) => {
      const bars = await fetchBarsPaged(sym, effectiveStart, requestedEnd, TF, apiKey, apiSecret, 'all');
      console.log(`  Fetched ${bars.length} TR bars for ${sym}`);
      trBarsBySym.set(sym, bars);
    }));

    const dividendsBySym = new Map<string, Map<string, number>>();
    await Promise.all(Array.from(tickers).map(async (sym) => {
      try {
        const divs = await fetchDividends(sym, MAX_START, requestedEnd, apiKey, apiSecret);
        dividendsBySym.set(sym, divs);
      } catch (err: any) {
        console.warn(`  Warning: Could not fetch dividends for ${sym}`);
        dividendsBySym.set(sym, new Map());
      }
    }));

    // Step 3: Calculate all indicators
    console.log('\nStep 3: Calculating indicators...');
    const indSeriesByKey = new Map<string, Map<string, number>>();

    for (const [key, bars] of indBarsByKey.entries()) {
      const [ticker, indicator, periodStr] = key.split('|');

      if (indicator === 'PRICE' || indicator === 'CURRENT_PRICE') {
        const m = new Map<string, number>();
        for (const bar of bars) {
          m.set(toYMD(bar.t), bar.c);
        }
        indSeriesByKey.set(key, m);
        continue;
      }

      // Call indicator service
      const closes = bars.map(b => b.c);
      const highs = bars.map(b => b.h);
      const lows = bars.map(b => b.l);
      const volumes = bars.map(b => b.v);

      const period = parseInt(periodStr) || 14;

      let payload: any = {
        indicator,
        params: { period },
      };

      // Add appropriate data based on indicator type
      if (indicator === 'RSI' || indicator === 'SMA' || indicator === 'EMA') {
        payload.close = closes;
        payload.prices = closes;
      } else if (indicator === 'ATR' || indicator === 'ADX') {
        payload.high = highs;
        payload.low = lows;
        payload.close = closes;
      } else if (indicator === 'MFI') {
        payload.high = highs;
        payload.low = lows;
        payload.close = closes;
        payload.volume = volumes;
      } else {
        payload.close = closes;
        payload.prices = closes;
      }

      const indResponse = await axios.post(`${INDICATOR_SERVICE_URL}/indicator`, payload, {
        timeout: 30000,
      });

      const values = indResponse.data.values || [];
      const dates = bars.map(b => toYMD(b.t));
      const m = new Map<string, number>();
      for (let i = 0; i < dates.length; i++) {
        const v = values[i];
        if (Number.isFinite(v as number)) m.set(dates[i], v as number);
      }
      indSeriesByKey.set(key, m);
      console.log(`  Calculated ${indicator} for ${ticker}: ${m.size} valid values`);
    }

    // Step 4: Build date grid
    console.log('\nStep 4: Building date grid...');
    const trCloses = new Map<string, Map<string, number>>();
    for (const [sym, bars] of trBarsBySym.entries()) {
      trCloses.set(sym, toDateCloseMap(bars));
    }

    let dateGrid: string[] = [];
    if (trCloses.has(bench)) {
      dateGrid = Array.from(trCloses.get(bench)!.keys()).sort();
    } else if (trBarsBySym.size) {
      const firstBars = trBarsBySym.values().next().value as SimpleBar[];
      dateGrid = firstBars.map(b => toYMD(b.t));
    }

    // Determine effective start date
    const startCandidates: string[] = [];
    for (const [, bars] of trBarsBySym.entries()) {
      if (bars.length) startCandidates.push(toYMD(bars[0].t));
    }
    for (const [key, m] of indSeriesByKey.entries()) {
      const dates = Array.from(m.keys()).sort();
      if (dates.length) startCandidates.push(dates[0]);
    }

    const effectiveMaxStart = startCandidates.length ? startCandidates.sort().slice(-1)[0] : MAX_START;
    const requestedStart = startDate && startDate !== 'max' ? startDate : effectiveMaxStart;
    const effectiveStart = requestedStart > effectiveMaxStart ? requestedStart : effectiveMaxStart;

    if (effectiveStart) dateGrid = dateGrid.filter(d => d >= effectiveStart);
    if (requestedEnd) dateGrid = dateGrid.filter(d => d <= requestedEnd);

    console.log(`Date grid: ${dateGrid.length} days (${dateGrid[0]} to ${dateGrid[dateGrid.length - 1]})`);

    // Step 5: Execute strategy for each day
    console.log('\nStep 5: Executing strategy for each day...');
    const { executeStrategy } = await import('./execution');

    let eq = 1;
    const equity: number[] = [];
    const benchEq: number[] = [];
    const debugRows: Array<any> = [];

    if (dateGrid.length) {
      equity.push(eq);
      benchEq.push(1);
    }

    for (let i = 1; i < dateGrid.length; i++) {
      const decisionDate = dateGrid[i - 1];
      const heldDate = dateGrid[i];

      // Build indicator data for this decision date
      const indicatorValuesForDate: Array<any> = [];
      for (const req of requiredIndicators) {
        const key = `${req.ticker}|${req.indicator}|${req.period}`;
        const series = indSeriesByKey.get(key);
        if (series) {
          const value = series.get(decisionDate);
          if (value !== undefined) {
            indicatorValuesForDate.push({
              ticker: req.ticker,
              indicator: req.indicator,
              period: req.period,
              value,
            });
          }
        }
      }

      const indicatorData = buildIndicatorMap(indicatorValuesForDate);

      // Execute strategy
      const result = executeStrategy(elements, indicatorData);

      // Calculate returns for this day
      const positions = result.positions;
      const sum = positions.reduce((a, b) => a + b.weight, 0);
      const norm = sum > 0 ? positions.map(p => ({ ticker: p.ticker, weight: p.weight / sum })) : [];

      let dailyRet = 0;
      let priceRet = 0;
      let divRet = 0;

      for (const pos of norm) {
        const sym = pos.ticker.toUpperCase();
        const closeMap = trCloses.get(sym);
        if (!closeMap) continue;

        const p0 = closeMap.get(decisionDate);
        const p1 = closeMap.get(heldDate);
        if (!Number.isFinite(p0 as number) || !Number.isFinite(p1 as number) || (p0 as number) === 0) continue;

        const priceReturn = (p1 as number) / (p0 as number) - 1;
        const divCash = dividendsBySym.get(sym)?.get(heldDate) ?? 0;
        const dividendReturn = Number.isFinite(divCash as number) ? (divCash as number) / (p0 as number) : 0;

        dailyRet += pos.weight * (priceReturn + dividendReturn);
        priceRet += pos.weight * priceReturn;
        divRet += pos.weight * dividendReturn;
      }

      eq *= 1 + dailyRet;
      equity.push(eq);

      // Benchmark return
      const benchCloseMap = trCloses.get(bench);
      if (benchCloseMap) {
        const prevBench = benchEq[benchEq.length - 1] ?? 1;
        const bp0 = benchCloseMap.get(decisionDate);
        const bp1 = benchCloseMap.get(heldDate);
        if (Number.isFinite(bp0 as number) && Number.isFinite(bp1 as number) && (bp0 as number) > 0) {
          const benchPriceRet = (bp1 as number) / (bp0 as number) - 1;
          const benchDivCash = dividendsBySym.get(bench)?.get(heldDate) ?? 0;
          const benchDivRet = Number.isFinite(benchDivCash as number) ? (benchDivCash as number) / (bp0 as number) : 0;
          benchEq.push(prevBench * (1 + benchPriceRet + benchDivRet));
        } else {
          benchEq.push(prevBench);
        }
      }

      if (debug) {
        const allocation: Record<string, number> = {};
        for (const pos of norm) allocation[pos.ticker] = pos.weight;

        // Build gate evaluations object
        const gateResults: Record<string, boolean> = {};
        for (const gate of result.gateEvaluations) {
          gateResults[gate.gateName] = gate.conditionMet;
        }

        debugRows.push({
          decisionDate,
          heldDate,
          allocation,
          gateResults,
          dailyReturn: dailyRet,
          priceReturn: priceRet,
          dividendReturn: divRet,
          equity: eq,
        });
      }
    }

    // Step 6: Calculate metrics
    console.log('\nStep 6: Calculating metrics...');
    const equityDailyReturns = computeDailyReturns(equity);
    const metricsBase = computeMetrics(equity, dateGrid, equityDailyReturns);
    const metricsQuant = await fetchQuantStatsMetrics(equityDailyReturns);

    const benchDailyReturns = computeDailyReturns(benchEq);
    const benchMetricsBase = computeMetrics(benchEq, dateGrid, benchDailyReturns);
    const benchMetricsQuant = await fetchQuantStatsMetrics(benchDailyReturns);

    console.log('=== BACKTEST COMPLETE ===\n');

    return res.json({
      dates: dateGrid,
      equityCurve: equity,
      metrics: { ...metricsBase, ...metricsQuant },
      benchmark: {
        dates: dateGrid,
        equityCurve: benchEq,
        metrics: { ...benchMetricsBase, ...benchMetricsQuant },
      },
      debugDays: debug ? debugRows : undefined,
    });
  } catch (err: any) {
    console.error('POST /api/backtest_strategy error:', err);
    return res.status(500).json({
      error: err.message || 'Strategy backtest failed',
      details: err.response?.data || err.stack,
    });
  }
});
/* ===== END: BLOCK N ===== */


/* ===== BEGIN: BLOCK O — Validate Strategy Endpoint ===== */
app.post('/api/validate_strategy', async (req: Request, res: Response) => {
  try {
    const { elements } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Missing or invalid elements array' });
    }

    const { validateStrategy } = await import('./execution');
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


/* ===== BEGIN: BLOCK L — Boot ===== */
app.listen(port, async () => {
  console.log(`Alpaca algo backend listening on port ${port} (feed=${FEED}, indicator=split, returns=all)`);

  // Start T-10 rebalancing scheduler if we have API credentials
  const apiKey = process.env.ALPACA_API_KEY?.trim();
  const apiSecret = process.env.ALPACA_API_SECRET?.trim();

  if (apiKey && apiSecret) {
    try {
      const { startT10Scheduler } = await import('./services/scheduler');
      await startT10Scheduler(apiKey, apiSecret);

      const { startFillChecker } = await import('./services/fillChecker');
      startFillChecker(apiKey, apiSecret);
    } catch (err: any) {
      console.error('Failed to start T-10 scheduler:', err.message);
      console.error('Automatic rebalancing will not be available');
    }
  } else {
    console.log('No ALPACA_API_KEY/ALPACA_API_SECRET in environment - T-10 scheduler disabled');
    console.log('Rebalancing is still available via POST /api/rebalance endpoint');
  }
});
/* ===== END: BLOCK L ===== */

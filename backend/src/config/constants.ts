export const PORT = Number(process.env.PORT) || 4000;

export const INDICATOR_SERVICE_URL = process.env.INDICATOR_SERVICE_URL || 'http://127.0.0.1:8001';
export const QUANTSTATS_URL = `${INDICATOR_SERVICE_URL}/metrics/quantstats`;
export const QUANTSTATS_TIMEOUT_MS = Number(process.env.QUANTSTATS_TIMEOUT_MS || 5000);

export const FEED: string = (process.env.ALPACA_FEED || 'sip').toLowerCase();
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY) || 4;

export const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE || `http://127.0.0.1:${PORT}`;

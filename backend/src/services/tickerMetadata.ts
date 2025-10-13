import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const ALPACA_BASE_URL = 'https://data.alpaca.markets';
const CACHE_FILENAME = 'ticker-metadata.json';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type AlpacaAsset = {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable?: boolean;
  maintenance_margin_requirement?: number;
  attributes?: string[] | null;
};

export type TickerMetadata = {
  symbol: string;
  name: string;
  exchange: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easyToBorrow: boolean;
  fractionable: boolean;
};

type CacheFile = {
  lastFetched: string;
  assets: TickerMetadata[];
};

type FetchOptions = {
  forceRefresh?: boolean;
  ttlMs?: number;
};

type MetadataResult = {
  assets: TickerMetadata[];
  lastFetched: string | null;
};

let inFlightRefresh: Promise<CacheFile | null> | null = null;

const cacheFilePath = path.resolve(__dirname, '../../data', CACHE_FILENAME);

async function readCache(): Promise<CacheFile | null> {
  try {
    const raw = await fs.readFile(cacheFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.assets)) return null;
    return parsed as CacheFile;
  } catch (err: any) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return null;
    }
    console.warn('[TickerMetadata] Failed to read cache:', err?.message ?? err);
    return null;
  }
}

async function writeCache(cache: CacheFile): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    await fs.writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('[TickerMetadata] Failed to write cache:', (err as Error).message);
  }
}

function buildHeaders() {
  const apiKey = process.env.ALPACA_API_KEY?.trim();
  const apiSecret = process.env.ALPACA_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error('Alpaca API credentials are required (ALPACA_API_KEY/ALPACA_API_SECRET)');
  }

  return {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': apiSecret,
  };
}

async function fetchAllAssets(): Promise<TickerMetadata[]> {
  const headers = buildHeaders();
  const assets: TickerMetadata[] = [];
  let pageToken: string | undefined;

  while (true) {
    const params: Record<string, string> = {
      status: 'active',
      asset_class: 'us_equity',
      limit: '1000',
    };
    if (pageToken) params.page_token = pageToken;

    const url = `${ALPACA_BASE_URL}/v2/assets`;
    const response = await axios.get<AlpacaAsset[]>(url, { params, headers });
    const batch = response.data ?? [];

    for (const asset of batch) {
      if (!asset?.symbol) continue;
      assets.push({
        symbol: asset.symbol.toUpperCase(),
        name: asset.name || '',
        exchange: asset.exchange || '',
        status: asset.status || '',
        tradable: Boolean(asset.tradable),
        marginable: Boolean(asset.marginable),
        shortable: Boolean(asset.shortable),
        easyToBorrow: Boolean(asset.easy_to_borrow),
        fractionable: Boolean(asset.fractionable),
      });
    }

    if (batch.length < 1000) {
      break;
    }
    pageToken = response.headers['x-next-page-token'] as string | undefined;
    if (!pageToken) break;
  }

  return assets;
}

async function refreshCache(): Promise<CacheFile | null> {
  try {
    const assets = await fetchAllAssets();
    const cache: CacheFile = {
      lastFetched: new Date().toISOString(),
      assets,
    };
    await writeCache(cache);
    return cache;
  } catch (err) {
    console.error('[TickerMetadata] Failed to refresh cache:', (err as Error).message);
    return null;
  }
}

async function ensureCache({ forceRefresh = false, ttlMs = CACHE_MAX_AGE_MS }: FetchOptions = {}): Promise<CacheFile | null> {
  const existing = await readCache();
  const now = Date.now();

  const cacheFresh =
    existing?.lastFetched &&
    Number.isFinite(Date.parse(existing.lastFetched)) &&
    now - Date.parse(existing.lastFetched) < ttlMs;

  if (!forceRefresh && cacheFresh) {
    return existing!;
  }

  if (!inFlightRefresh) {
    inFlightRefresh = refreshCache().finally(() => {
      inFlightRefresh = null;
    });
  }

  const updated = await inFlightRefresh;
  if (updated) return updated;
  return existing;
}

export async function getTickerMetadata(options: FetchOptions & { symbols?: string[]; includeAll?: boolean } = {}): Promise<MetadataResult> {
  const { symbols, includeAll = false, ...cacheOptions } = options;
  const cache = await ensureCache(cacheOptions);

  if (!cache) {
    throw new Error('Ticker metadata cache is unavailable and refresh failed');
  }

  let selected = cache.assets;
  if (!includeAll && Array.isArray(symbols) && symbols.length > 0) {
    const lookup = new Map(cache.assets.map((asset) => [asset.symbol, asset]));
    selected = [];
    for (const raw of symbols) {
      const sym = (raw || '').trim().toUpperCase();
      if (!sym) continue;
      const asset = lookup.get(sym);
      if (asset) {
        selected.push(asset);
      }
    }
  }

  return {
    assets: selected,
    lastFetched: cache.lastFetched ?? null,
  };
}

export async function forceRefreshTickerMetadata(): Promise<MetadataResult> {
  const cache = await ensureCache({ forceRefresh: true });
  if (!cache) {
    throw new Error('Ticker metadata refresh failed');
  }
  return {
    assets: cache.assets,
    lastFetched: cache.lastFetched,
  };
}

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { fetchTickerMetadata, type TickerMetadata } from "../api/tickers";
import { containsVariable } from "../utils/verticalVariables";

type MetadataStoreState = {
  map: Map<string, TickerMetadata>;
  lastFetched: string | null;
};

const STORAGE_KEY = "tickerMetadataCache_v1";

const subscribers = new Set<() => void>();
let storageLoaded = false;

let storeState: MetadataStoreState = {
  map: new Map(),
  lastFetched: null,
};

function notifySubscribers() {
  for (const callback of subscribers) {
    callback();
  }
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot(): MetadataStoreState {
  return storeState;
}

function persistStore() {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    const payload = {
      lastFetched: storeState.lastFetched,
      assets: Array.from(storeState.map.values()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[useTickerMetadata] Failed to persist cache:", (err as Error).message);
  }
}

function loadFromStorage() {
  if (storageLoaded) return;
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    storageLoaded = true;
    return;
  }
  storageLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.assets)) return;
    const map = new Map<string, TickerMetadata>();
    for (const asset of parsed.assets) {
      if (asset?.symbol) {
        map.set(String(asset.symbol).toUpperCase(), {
          symbol: String(asset.symbol).toUpperCase(),
          name: asset.name ?? "",
          exchange: asset.exchange ?? "",
          status: asset.status ?? "",
          tradable: Boolean(asset.tradable),
          marginable: Boolean(asset.marginable),
          shortable: Boolean(asset.shortable),
          easyToBorrow: Boolean(asset.easyToBorrow),
          fractionable: Boolean(asset.fractionable),
        });
      }
    }
    storeState = {
      map,
      lastFetched: typeof parsed.lastFetched === "string" ? parsed.lastFetched : null,
    };
  } catch (err) {
    console.warn("[useTickerMetadata] Failed to load cache:", (err as Error).message);
  }
}

function updateStore(assets: TickerMetadata[], lastFetched: string | null) {
  if (!assets.length) {
    if (lastFetched && lastFetched !== storeState.lastFetched) {
      storeState = {
        map: storeState.map,
        lastFetched,
      };
      notifySubscribers();
    }
    return;
  }

  let changed = false;
  const nextMap = new Map(storeState.map);

  for (const asset of assets) {
    if (!asset?.symbol) continue;
    const symbol = asset.symbol.toUpperCase();
    const existing = nextMap.get(symbol);
    const payload: TickerMetadata = {
      symbol,
      name: asset.name || "",
      exchange: asset.exchange || "",
      status: asset.status || "",
      tradable: Boolean(asset.tradable),
      marginable: Boolean(asset.marginable),
      shortable: Boolean(asset.shortable),
      easyToBorrow: Boolean(asset.easyToBorrow),
      fractionable: Boolean(asset.fractionable),
    };
    if (!existing || JSON.stringify(existing) !== JSON.stringify(payload)) {
      nextMap.set(symbol, payload);
      changed = true;
    }
  }

  if (!changed && lastFetched === storeState.lastFetched) {
    return;
  }

  storeState = {
    map: nextMap,
    lastFetched: lastFetched ?? storeState.lastFetched,
  };
  persistStore();
  notifySubscribers();
}

function sanitizeSymbols(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || containsVariable(trimmed)) continue;
    const normalized = trimmed.toUpperCase();
    if (!/^[A-Z0-9.\-]+$/.test(normalized)) continue;
    out.add(normalized);
  }
  return Array.from(out);
}

export function useTickerMetadata(symbols: string[]) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  loadFromStorage();

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const metadata = snapshot.map;

  const sanitizedSymbols = useMemo(() => sanitizeSymbols(symbols), [symbols]);
  const missingSymbols = useMemo(() => {
    return sanitizedSymbols.filter((symbol) => !metadata.has(symbol));
  }, [sanitizedSymbols, metadata]);

  useEffect(() => {
    if (missingSymbols.length === 0) return;

    let cancelled = false;

    const fetchMetadata = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchTickerMetadata(missingSymbols);
        if (cancelled) return;
        updateStore(response.assets, response.lastFetched ?? null);
      } catch (err: any) {
        if (cancelled) return;
        const message = err?.response?.data?.error || err?.message || "Failed to load ticker metadata";
        setError(message);
        console.warn("[useTickerMetadata]", message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMetadata();

    return () => {
      cancelled = true;
    };
  }, [missingSymbols]);

  return {
    metadata,
    lastFetched: snapshot.lastFetched,
    loading,
    error,
  };
}

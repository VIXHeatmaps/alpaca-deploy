import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../api/client";
import type { ActiveStrategy, RawActiveStrategy } from "../types/alpaca";

type UseActiveStrategiesResult = {
  strategies: ActiveStrategy[];
  loading: boolean;
  error: string | null;
};

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapActiveStrategy = (raw: RawActiveStrategy): ActiveStrategy => {
  return {
    id: String(raw.id),
    name: raw.name,
    status: raw.status,
    mode: raw.mode,
    investAmount: toNumber(raw.initial_capital),
    currentValue:
      raw.current_capital !== null && raw.current_capital !== undefined
        ? toNumber(raw.current_capital)
        : null,
    totalReturn: undefined,
    totalReturnPct: undefined,
    createdAt: raw.started_at,
    lastRebalance: raw.last_rebalance_at ?? null,
    holdings: Array.isArray(raw.holdings) ? raw.holdings : [],
    flowData: raw.flow_data || undefined,
    pendingOrders: raw.pending_orders || undefined,
  };
};

export const useActiveStrategies = (
  apiKey: string,
  apiSecret: string
): UseActiveStrategiesResult => {
  const [strategies, setStrategies] = useState<ActiveStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setStrategies([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const fetchStrategies = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await axios.get<{ strategies: RawActiveStrategy[] }>(
          `${API_BASE}/api/active-strategies`,
          {
            headers: {
              "APCA-API-KEY-ID": apiKey,
              "APCA-API-SECRET-KEY": apiSecret,
            },
            withCredentials: true,
            timeout: 10000,
          }
        );

        if (!cancelled) {
          const mapped = Array.isArray(response.data?.strategies)
            ? response.data.strategies.map(mapActiveStrategy)
            : [];
          setStrategies(mapped);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("useActiveStrategies fetch error:", err?.message || err);
          setError(
            err?.response?.data?.error ||
              err?.message ||
              "Failed to fetch active strategies"
          );
          setStrategies([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStrategies();
    intervalId = window.setInterval(fetchStrategies, 30000);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [apiKey, apiSecret]);

  return { strategies, loading, error };
};


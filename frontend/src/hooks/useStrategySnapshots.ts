import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../api/client";
import type { ActiveStrategy, StrategySnapshot } from "../types/alpaca";

type SnapshotsMap = Record<string, StrategySnapshot[]>;

type UseStrategySnapshotsResult = {
  snapshotsByStrategy: SnapshotsMap;
  loading: boolean;
};

const mapSnapshot = (strategyId: string, raw: any): StrategySnapshot => ({
  strategyId,
  date: raw.date || raw.snapshot_date,
  timestamp: raw.snapshot_date,
  portfolioValue: Number(raw.equity || 0),
  holdings: Array.isArray(raw.holdings) ? raw.holdings : [],
  totalReturn: Number(raw.total_return || 0),
  totalReturnPct: Number(raw.cumulative_return || 0) * 100,
  rebalanceType: raw.rebalance_type,
});

export const useStrategySnapshots = (
  strategies: ActiveStrategy[],
  apiKey: string,
  apiSecret: string
): UseStrategySnapshotsResult => {
  const [snapshotsByStrategy, setSnapshotsByStrategy] = useState<SnapshotsMap>(
    {}
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiKey || !apiSecret || strategies.length === 0) {
      setSnapshotsByStrategy({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const fetchAllSnapshots = async () => {
      setLoading(true);
      const results: SnapshotsMap = {};

      try {
        for (const strategy of strategies) {
          try {
            const response = await axios.get<{ snapshots: any[] }>(
              `${API_BASE}/api/active-strategies/${strategy.id}/snapshots`,
              {
                headers: {
                  "APCA-API-KEY-ID": apiKey,
                  "APCA-API-SECRET-KEY": apiSecret,
                },
                withCredentials: true,
                timeout: 10000,
              }
            );

            if (Array.isArray(response.data?.snapshots)) {
              results[strategy.id] = response.data.snapshots.map((snapshot) =>
                mapSnapshot(strategy.id, snapshot)
              );
            } else {
              results[strategy.id] = [];
            }
          } catch (err: any) {
            console.error(
              `useStrategySnapshots fetch error for strategy ${strategy.id}:`,
              err?.message || err
            );
            results[strategy.id] = [];
          }
        }

        if (!cancelled) {
          setSnapshotsByStrategy(results);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchAllSnapshots();
    intervalId = window.setInterval(fetchAllSnapshots, 30000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [apiKey, apiSecret, strategies]);

  return { snapshotsByStrategy, loading };
};


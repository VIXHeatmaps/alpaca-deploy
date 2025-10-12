import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../api/client";
import type { AccountPosition } from "../types/alpaca";

type UsePositionsResult = {
  positions: AccountPosition[];
  loading: boolean;
};

export const usePositions = (
  apiKey: string,
  apiSecret: string
): UsePositionsResult => {
  const [positions, setPositions] = useState<AccountPosition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const fetchPositions = async () => {
      setLoading(true);
      try {
        const response = await axios.get<{ positions: any[] }>(
          `${API_BASE}/api/positions`,
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
          if (Array.isArray(response.data?.positions)) {
            setPositions(
              response.data.positions.map((pos) => ({
                symbol: pos.symbol,
                qty: Number(pos.qty),
                avgEntryPrice: Number(pos.avg_entry_price),
                currentPrice: Number(pos.current_price),
                marketValue: Number(pos.market_value),
                costBasis: Number(pos.cost_basis),
                unrealizedPl: Number(pos.unrealized_pl),
                unrealizedPlpc: Number(pos.unrealized_plpc),
                side: pos.side,
              }))
            );
          } else {
            setPositions([]);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("usePositions fetch error:", err?.message || err);
          setPositions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPositions();
    intervalId = window.setInterval(fetchPositions, 30000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [apiKey, apiSecret]);

  return { positions, loading };
};


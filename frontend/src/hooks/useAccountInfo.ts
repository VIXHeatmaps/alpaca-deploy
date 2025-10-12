import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../api/client";
import type { AccountInfo } from "../types/alpaca";

type UseAccountInfoResult = {
  data: AccountInfo | null;
  loading: boolean;
  error: string | null;
};

export const useAccountInfo = (
  apiKey: string,
  apiSecret: string
): UseAccountInfoResult => {
  const [data, setData] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || !apiSecret) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchAccountInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get<AccountInfo>(`${API_BASE}/api/account`, {
          headers: {
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
          },
          withCredentials: true,
          signal: controller.signal,
          timeout: 10000,
        });

        if (!cancelled) {
          setData(response.data);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (axios.isCancel(err)) return;
          console.error("useAccountInfo fetch error:", err?.message || err);
          setError(
            err?.response?.data?.error ||
              err?.message ||
              "Failed to fetch account information"
          );
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchAccountInfo();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiKey, apiSecret]);

  return { data, loading, error };
};


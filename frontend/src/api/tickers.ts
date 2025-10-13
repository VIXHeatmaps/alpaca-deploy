import { apiClient } from "./client";

export interface TickerMetadata {
  symbol: string;
  name: string;
  exchange: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easyToBorrow: boolean;
  fractionable: boolean;
}

export interface TickerMetadataResponse {
  lastFetched: string | null;
  count: number;
  assets: TickerMetadata[];
}

export async function fetchTickerMetadata(symbols: string[]): Promise<TickerMetadataResponse> {
  const params: Record<string, string> = {};
  if (symbols.length > 0) {
    params.symbols = symbols.join(",");
  }

  const response = await apiClient.get<TickerMetadataResponse>("/api/tickers/meta", {
    params,
  });

  return response.data;
}

export type AccountInfo = {
  id: string;
  account_number: string;
  status: string;
  crypto_status?: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
  account_type?: string;
};

export type StrategyHolding = {
  symbol: string;
  qty: number;
  entry_price?: number;
  marketValue?: number;
};

export type RawActiveStrategy = {
  id: number;
  name: string;
  status?: string;
  mode?: "paper" | "live";
  initial_capital: number | string;
  current_capital: number | string | null;
  holdings: StrategyHolding[];
  pending_orders?: any[] | null;
  user_id?: string;
  started_at?: string;
  stopped_at?: string | null;
  last_rebalance_at?: string | null;
  flow_data?: {
    nodes?: any[];
    edges?: any[];
    globals?: any;
  } | null;
};

export type ActiveStrategy = {
  id: string;
  name: string;
  status?: string;
  mode?: "paper" | "live";
  investAmount: number;
  currentValue: number | null;
  totalReturn?: number;
  totalReturnPct?: number;
  createdAt?: string;
  lastRebalance?: string | null;
  holdings: StrategyHolding[];
  flowData?: {
    nodes?: any[];
    edges?: any[];
    globals?: any;
  } | null;
  pendingOrders?: any[] | null;
};

export type StrategySnapshot = {
  strategyId: string;
  date: string;
  timestamp: string;
  portfolioValue: number;
  holdings: Array<{
    symbol: string;
    qty: number;
    price: number;
    value: number;
  }>;
  totalReturn: number;
  totalReturnPct: number;
  rebalanceType?: "initial" | "daily" | "liquidation";
};

export type AccountPosition = {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  side: string;
};

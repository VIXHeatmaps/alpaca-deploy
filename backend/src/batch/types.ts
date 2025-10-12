export type BatchJobStatus = 'queued' | 'running' | 'finished' | 'failed';

export type FlowGlobals = { benchmarkSymbol: string; start: string; end: string; debug: boolean };
export type FlowNode = { id: string; type: 'start' | 'gate' | 'weights' | 'portfolio'; data: any };
export type FlowEdge = { from: string; to: string; label?: 'then' | 'else' };

export type BatchJobResult = {
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

export type BatchJobRecord = {
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

import React, { useState, useMemo, useEffect, useRef } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Copy } from "lucide-react";
import type { IndicatorName } from "../types/indicators";
import { defaultParams, paramsToPeriodString } from "../types/indicators";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { validateStrategy, type ValidationError } from "../utils/validation";
import { VariablesTab } from "./VariablesTab";
import type { BatchJob } from "../types/batchJobs";
import { BatchTestsTab } from "./BatchTestsTab";
import { putJob } from "../storage/batchJobsStore";
import * as strategiesApi from "../api/strategies";
import {
  extractStringsFromElements,
  extractVariablesFromStrings,
  hasUndefinedVariable,
  containsVariable,
  generateAssignments,
  applyVariablesToElements,
} from "../utils/verticalVariables";
import { InvestModal } from "./InvestModal";
import {
  type BatchConfirmData,
  type BatchResultsData,
  BatchConfirmModal,
  BatchResultsModal,
  GateCard,
  TickerCard,
  UndefinedVariablesModal,
  WeightCard,
} from "./builder";
import { useBuilderState } from "../hooks/useBuilderState";
import { useBatchJobs } from "../hooks/useBatchJobs";
import { useVariableLists } from "../hooks/useVariableLists";
import type {
  Element,
  GateElement,
  TickerElement,
  WeightElement,
} from "../types/builder";
import {
  countGatesInTree,
  deepCloneElement,
} from "../utils/builder";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

// ========== MAIN COMPONENT ==========

interface VerticalUI2Props {
  apiKey?: string;
  hideInternalTabs?: boolean;
  apiSecret?: string;
}

export default function VerticalUI2({ apiKey = "", apiSecret = "" }: VerticalUI2Props = {}) {
  const {
    state: {
      strategyTabs,
      activeStrategyTabId,
      elements,
      history,
      historyIndex,
      benchmarkSymbol,
      startDate,
      endDate,
      backtestResults,
      strategyName,
      versioningEnabled,
      version,
      createdAt,
      updatedAt,
    },
    actions: {
      setActiveStrategyTabId,
      setElements,
      setHistory,
      setHistoryIndex,
      setBenchmarkSymbol,
      setStartDate,
      setEndDate,
      setBacktestResults,
      setStrategyName,
      setVersioningEnabled,
      setVersion,
      setCreatedAt,
      setUpdatedAt,
      saveToHistory,
      undo,
      redo,
      addTab,
      closeTab,
      updateTab,
    },
  } = useBuilderState();

  // UI state (not per-tab)
  const [showDropdown, setShowDropdown] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [clipboard, setClipboard] = useState<Element | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const debug = true; // Always include debug data

  // Tab management
  const [activeTab, setActiveTab] = useState<"strategy" | "variables" | "batchtests">("strategy");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [backtestResultsOpen, setBacktestResultsOpen] = useState(true);

  // Batch jobs state
  const { batchJobs, batchLoading, setBatchJobs } = useBatchJobs();

  // Variables state
  const { variableLists, variablesLoading, refreshVariableLists } = useVariableLists();

  // Invest modal state
  const [showInvestModal, setShowInvestModal] = useState(false);

  // Load variables on mount and when switching tabs
  // This ensures we always have the latest variables when checking strategies
  useEffect(() => {
    refreshVariableLists();
  }, [refreshVariableLists, activeTab]);

  // Batch backtest state
  const MAX_ASSIGNMENTS = 10000;
  const [showUndefinedAlert, setShowUndefinedAlert] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<BatchConfirmData | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<{
    detail: Array<{ name: string; count: number; values: string[] }>;
    lines: string[];
    truncated: boolean;
    total: number;
    shown: number;
    assignments: Array<Record<string, string>>;
  } | null>(null);

  // Batch results viewer state
  const [showResultsViewer, setShowResultsViewer] = useState(false);
  const [viewingResults, setViewingResults] = useState<BatchResultsData | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Real-time validation - updates whenever elements change
  const validationErrors = useMemo(() => {
    if (elements.length === 0) return [];
    const validation = validateStrategy(elements as any);
    return validation.errors;
  }, [elements]);

  // Variable detection and validation
  const strategyStrings = useMemo(() => extractStringsFromElements(elements), [elements]);
  const strategyVariables = useMemo(() => extractVariablesFromStrings(strategyStrings), [strategyStrings]);
  const hasVariables = strategyVariables.length > 0;

  // Load defined variables and create lookup set
  const definedVariables = useMemo(() => {
    return new Set(variableLists.map(v => v.name));
  }, [variableLists]);

  // Check for undefined variables
  const undefinedVariables = useMemo(() => {
    return strategyVariables.filter(varName => !definedVariables.has(varName));
  }, [strategyVariables, definedVariables]);

  // Memoize chart data to prevent constant re-renders
  const chartData = useMemo(() => {
    if (!backtestResults?.dates || !backtestResults?.equityCurve) {
      return [];
    }
    return backtestResults.dates.map((date: string, i: number) => ({
      date,
      strategy: backtestResults.equityCurve[i],
      benchmark: backtestResults.benchmark?.equityCurve?.[i],
    }));
  }, [backtestResults?.dates, backtestResults?.equityCurve, backtestResults?.benchmark?.equityCurve]);

  const handleSelectType = (type: "weight" | "gate") => {
    setShowDropdown(false);
    setTickerInput("");

    if (type === "gate") {
      const gateCount = countGatesInTree(elements);
      const gateName = `Gate${gateCount + 1}`;

      const defaultIndicator: IndicatorName = "RSI";
      const defaultP = defaultParams(defaultIndicator);
      const newGate: GateElement = {
        id: `gate-${Date.now()}`,
        type: "gate",
        name: gateName,
        weight: 100,
        conditionMode: "if",
        conditions: [{
          ticker: "",
          indicator: defaultIndicator,
          period: paramsToPeriodString(defaultIndicator, defaultP),
          params: defaultP,
          operator: "gt",
          compareTo: "indicator",
          threshold: "",
          rightTicker: "",
          rightIndicator: defaultIndicator,
          rightPeriod: paramsToPeriodString(defaultIndicator, defaultP),
          rightParams: defaultP,
        }],
        thenChildren: [],
        elseChildren: [],
      };
      saveToHistory([...elements, newGate]);
    } else if (type === "weight") {
      const newWeight: WeightElement = {
        id: `weight-${Date.now()}`,
        type: "weight",
        name: "",
        weight: 100,
        weightMode: "equal",
        children: [],
      };
      saveToHistory([...elements, newWeight]);
    }
  };

  const handleTickerSubmit = () => {
    if (tickerInput.trim()) {
      const newTicker: TickerElement = {
        id: `ticker-${Date.now()}`,
        type: "ticker",
        ticker: tickerInput.trim().toUpperCase(),
        weight: 100,
      };
      saveToHistory([...elements, newTicker]);
      setShowDropdown(false);
      setTickerInput("");
    }
  };

  const updateElement = (id: string, updated: Element) => {
    const newElements = elements.map((el) => (el.id === id ? updated : el));
    saveToHistory(newElements);
  };

  const deleteElement = (id: string) => {
    const newElements = elements.filter((el) => el.id !== id);
    saveToHistory(newElements);
  };

  // Helper to format version for display (drops trailing zeros, but keeps at least patch if non-zero from start)
  const formatVersion = (v: typeof version): string => {
    const { major, minor, patch, fork } = v;
    const forkLower = fork.toLowerCase();
    // Always show full version if we started with a non-zero patch (v0.0.1)
    if (major === 0 && minor === 0 && patch === 1 && !fork) {
      return `v0.0.1`;
    }
    // Standard formatting: drop trailing zeros
    if (patch > 0) return `v${major}.${minor}.${patch}${forkLower}`;
    if (minor > 0) return `v${major}.${minor}${forkLower}`;
    return `v${major}${forkLower}`;
  };

  // Helper function to save strategy to both localStorage and database
  const saveStrategyToDb = async (strategyData: {
    name: string;
    versioningEnabled: boolean;
    version: { major: number; minor: number; patch: number; fork: string };
    createdAt: string;
    updatedAt: string;
    elements: Element[];
  }) => {
    // Validate strategy name
    if (!strategyData.name || strategyData.name.trim() === '') {
      alert('Please enter a strategy name before saving');
      return;
    }

    // Save to localStorage (for draft cache)
    localStorage.setItem('verticalUI2_strategy_v2', JSON.stringify(strategyData));

    // Save to database
    try {
      await strategiesApi.saveStrategy({
        name: strategyData.name,
        versioningEnabled: strategyData.versioningEnabled,
        version: strategyData.version,
        elements: strategyData.elements,
        createdAt: strategyData.createdAt,
      });
      alert(`Strategy "${strategyData.name}" saved successfully!`);
    } catch (error: any) {
      console.error('Failed to save strategy to database:', error);
      alert(`Failed to save strategy to database: ${error.message}`);
    }
  };

  // Version increment handlers
  const handleSaveSimple = async () => {
    const now = new Date().toISOString();
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSavePatch = async () => {
    const now = new Date().toISOString();
    const newVersion = { ...version, patch: version.patch + 1, fork: "" };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSaveMinor = async () => {
    const now = new Date().toISOString();
    const newVersion = { ...version, minor: version.minor + 1, patch: 0, fork: "" };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSaveMajor = async () => {
    const now = new Date().toISOString();
    const newVersion = { major: version.major + 1, minor: 0, patch: 0, fork: "" };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleSaveFork = async () => {
    const now = new Date().toISOString();
    let nextFork = "b";
    if (version.fork) {
      const currentCharCode = version.fork.toLowerCase().charCodeAt(0);
      nextFork = String.fromCharCode(currentCharCode + 1);
    }
    const newVersion = { ...version, fork: nextFork };
    setVersion(newVersion);
    setUpdatedAt(now);
    const strategyData = {
      name: strategyName,
      versioningEnabled,
      version: newVersion,
      createdAt,
      updatedAt: now,
      elements,
    };
    await saveStrategyToDb(strategyData);
  };

  const handleResetVersions = () => {
    const newVersion = { major: 0, minor: 0, patch: 1, fork: "" };
    setVersion(newVersion);
  };

  const exportStrategy = () => {
    const strategyData = {
      version: "2.0",
      name: strategyName,
      versioningEnabled,
      strategyVersion: version,
      createdAt,
      updatedAt,
      timestamp: new Date().toISOString(),
      elements: elements,
    };

    const dataStr = JSON.stringify(strategyData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const versionStr = formatVersion(version);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = strategyName
      ? `${strategyName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${versionStr}-${dateStr}.json`
      : `strategy-${versionStr}-${dateStr}.json`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetStrategy = () => {
    if (elements.length > 0 && !window.confirm('Are you sure you want to clear the entire strategy? This cannot be undone.')) {
      return;
    }
    localStorage.removeItem('verticalUI2_strategy');
    console.log('Cleared saved strategy from localStorage');
    saveToHistory([]);
  };

  const backtestStrategy = async () => {
    console.log('🚀 backtestStrategy called at', new Date().toISOString());

    try {
      // Prevent double-execution
      if (isBacktesting) {
        console.warn('⚠️ Backtest already running, ignoring duplicate call');
        return;
      }

      // Validation is done real-time via useMemo
      // If there are validation errors, button is disabled
      if (validationErrors.length > 0) {
        console.error('Validation failed:', validationErrors);
        return;
      }

      // Check if strategy uses variables
      if (hasVariables) {
        // Check for undefined variables
        const defined = new Map(variableLists.map((v) => [v.name, v]));
        const missing = strategyVariables.filter((v) => !defined.has(v));

        if (missing.length) {
          setShowUndefinedAlert(true);
          return;
        }

        // Generate variable assignment details
        const detail = strategyVariables.map((name) => {
          const entry = defined.get(name);
          return {
            name,
            count: entry?.values.length || 0,
            values: entry?.values || [],
          };
        });

        const total = detail.reduce((acc, d) => acc * Math.max(d.count, 1), 1);

        setBatchConfirm({ total, detail });
        setShowBatchConfirm(true);
        return;
      }

      // Regular single backtest (no variables)
      console.log('Backtesting strategy...');
      setIsBacktesting(true);
      setBacktestResults(null);

      const payload = {
        elements,
        benchmarkSymbol,
        startDate,
        endDate,
        debug,
      };

      console.log('📤 BACKTEST PAYLOAD:', JSON.stringify(payload, null, 2));

      const response = await fetch(`${API_BASE}/api/backtest_strategy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || 'Strategy backtest failed'}`);
        console.error('Backtest error:', data);
        return;
      }

      console.log('Backtest complete:', data);
      setBacktestResults(data);
      setBacktestResultsOpen(true); // Auto-expand results when backtest completes
    } catch (err: any) {
      console.error('Backtest error:', err);
      alert(`Failed to backtest strategy: ${err.message}`);
    } finally {
      setIsBacktesting(false);
    }
  };

  const uploadStrategy = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (!json.elements || !Array.isArray(json.elements)) {
            alert('Invalid JSON format. Expected a "elements" array.');
            return;
          }

          // Load elements into strategy tree
          saveToHistory(json.elements);

          // Restore metadata if available
          if (json.name) {
            setStrategyName(json.name);
          }

          if (json.versioningEnabled !== undefined) {
            setVersioningEnabled(json.versioningEnabled);
          }

          if (json.strategyVersion) {
            const importedVersion = {
              major: json.strategyVersion.major ?? 0,
              minor: json.strategyVersion.minor ?? 0,
              patch: json.strategyVersion.patch ?? 1,
              fork: json.strategyVersion.fork ?? "",
            };
            setVersion(importedVersion);
          }

          if (json.createdAt) {
            setCreatedAt(json.createdAt);
          }

          if (json.updatedAt) {
            setUpdatedAt(json.updatedAt);
          }

          alert(`Strategy "${json.name || 'Untitled'}" imported successfully!`);
        } catch (error) {
          alert('Error parsing JSON file: ' + (error as Error).message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Batch execution function
  const executeBatchBacktest = async () => {
    if (!batchConfirm) return;

    setShowBatchConfirm(false);
    setBatchConfirm(null);

    const { detail, total } = batchConfirm;

    // Generate all variable assignments
    const { assignments, truncated } = generateAssignments(detail, MAX_ASSIGNMENTS);

    console.log(`Generated ${assignments.length} assignments (truncated: ${truncated})`);

    // Create batch job
    const jobId = `batch-${Date.now()}`;
    const jobName = strategyName ? `${strategyName} Batch` : "Batch Backtest";

    const newJob: BatchJob = {
      id: jobId,
      name: jobName,
      kind: "server",
      status: "queued",
      total: assignments.length,
      completed: 0,
      detail: detail.map(d => ({ name: d.name, count: d.count, values: d.values })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      viewUrl: null,
      csvUrl: null,
      completedAt: null,
      truncated: false,
    };

    // Add job to list and persist to IndexedDB
    setBatchJobs(prev => [newJob, ...prev]);
    await putJob(newJob);

    try {
      // Update job status to running
      const runningJob = { ...newJob, status: "running" as const };
      setBatchJobs(prev => prev.map(j =>
        j.id === jobId ? runningJob : j
      ));
      await putJob(runningJob);

      // Debug: Log credentials being sent
      console.log('[BATCH] Sending credentials:', {
        apiKey: apiKey ? `${apiKey.slice(0, 8)}...` : 'MISSING',
        apiSecret: apiSecret ? `${apiSecret.slice(0, 8)}...` : 'MISSING',
        url: `${API_BASE}/api/batch_backtest_strategy`
      });

      // Send batch request to backend
      const response = await fetch(`${API_BASE}/api/batch_backtest_strategy`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        body: JSON.stringify({
          variables: detail.map(d => ({ name: d.name, values: d.values })),
          assignments,
          baseStrategy: {
            elements,
            benchmarkSymbol,
            startDate,
            endDate,
            debug,
          },
          jobId,
          jobName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Batch backtest failed');
      }

      console.log('Batch backtest accepted:', data);

      // Backend accepted the job (202), now poll for completion
      const pollJobStatus = async () => {
        try {
          const statusResponse = await fetch(`${API_BASE}/api/batch_backtest_strategy/${jobId}`, {
            credentials: 'include'
          });
          const statusData = await statusResponse.json();

          if (!statusResponse.ok) {
            throw new Error(statusData.error || 'Failed to get job status');
          }

          // Update job with current status
          const updatedJob = {
            ...(batchJobs.find(j => j.id === jobId) || newJob),
            status: statusData.status,
            completed: statusData.completed || 0,
            viewUrl: statusData.viewUrl || null,
            csvUrl: statusData.csvUrl || null,
            error: statusData.error || null,
            updatedAt: new Date().toISOString(),
            completedAt: statusData.status === 'finished' ? new Date().toISOString() : null,
          };
          setBatchJobs(prev => prev.map(j =>
            j.id === jobId ? updatedJob : j
          ));
          await putJob(updatedJob);

          // If still running, poll again
          if (statusData.status === 'running' || statusData.status === 'queued') {
            setTimeout(pollJobStatus, 2000); // Poll every 2 seconds
          } else if (statusData.status === 'finished') {
            // Switch to Batch Tests tab to show results
            setActiveTab("batchtests");
            alert(`Batch backtest completed! ${statusData.completed || assignments.length} strategies tested.`);
          } else if (statusData.status === 'failed') {
            alert(`Batch backtest failed: ${statusData.error || 'Unknown error'}`);
          }
        } catch (err: any) {
          console.error('Error polling job status:', err);
          // Don't throw - just stop polling
        }
      };

      // Start polling after a short delay
      setTimeout(pollJobStatus, 1000);
    } catch (err: any) {
      console.error('Batch backtest error:', err);

      // Update job with error
      const failedJob = {
        ...(batchJobs.find(j => j.id === jobId) || newJob),
        status: "failed" as const,
        error: err.message || "Batch backtest failed",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      setBatchJobs(prev => prev.map(j =>
        j.id === jobId ? failedJob : j
      ));
      await putJob(failedJob);

      alert(`Batch backtest failed: ${err.message}`);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
    }}>
      {/* Main Tabs */}
      <div style={{
        display: "none", // HIDDEN - tabs moved to App.tsx
        padding: '12px 32px 0 32px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setActiveTab("strategy")}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: activeTab === "strategy" ? '#1677ff' : '#6b7280',
              background: activeTab === "strategy" ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === "strategy" ? '2px solid #1677ff' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            Strategy
          </button>
          <button
            onClick={() => setActiveTab("variables")}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: activeTab === "variables" ? '#1677ff' : '#6b7280',
              background: activeTab === "variables" ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === "variables" ? '2px solid #1677ff' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            Variables
          </button>
          <button
            onClick={() => setActiveTab("batchtests")}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: activeTab === "batchtests" ? '#1677ff' : '#6b7280',
              background: activeTab === "batchtests" ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === "batchtests" ? '2px solid #1677ff' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            Batch Tests
          </button>
        </div>
      </div>

      {/* Strategy Tabs - Editable */}
      {activeTab === "strategy" && (
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '8px 32px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          overflowX: 'auto',
        }}>
          {strategyTabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => {
                if (editingTabId !== tab.id) {
                  setActiveStrategyTabId(tab.id);
                }
              }}
              onDoubleClick={() => {
                if (tab.id === activeStrategyTabId) {
                  setEditingTabId(tab.id);
                }
              }}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                background: tab.id === activeStrategyTabId ? '#ffffff' : 'transparent',
                border: tab.id === activeStrategyTabId ? '1px solid #d1d5db' : '1px solid transparent',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {editingTabId === tab.id ? (
                <input
                  type="text"
                  value={tab.strategyName || ''}
                  onChange={(e) => {
                    const name = e.target.value;
                    updateTab(tab.id, (existing) => ({ ...existing, strategyName: name }));
                  }}
                  onBlur={() => setEditingTabId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingTabId(null);
                    } else if (e.key === 'Escape') {
                      setEditingTabId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  placeholder="Strategy name..."
                  style={{
                    width: 150,
                    padding: '2px 4px',
                    fontSize: 12,
                    border: '1px solid #3b82f6',
                    borderRadius: '2px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tab.strategyName || 'Untitled Strategy'}
                </span>
              )}
              {strategyTabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    fontSize: 14,
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addTab()}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            +
          </button>
        </div>
      )}

      {/* 1. Main Toolbar */}
      <div style={{
        background: "#fff",
        padding: '16px 32px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <button
            onClick={undo}
            disabled={historyIndex === 0}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: historyIndex === 0 ? '#9ca3af' : '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: historyIndex === 0 ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={historyIndex === history.length - 1}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: historyIndex === history.length - 1 ? '#9ca3af' : '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: historyIndex === history.length - 1 ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>

          {/* Versioning Controls */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#666',
            cursor: 'pointer',
            marginLeft: '8px',
          }}>
            <input
              type="checkbox"
              checked={versioningEnabled}
              onChange={(e) => setVersioningEnabled(e.target.checked)}
            />
            Versions
          </label>

          {versioningEnabled ? (
            <>
              {/* Version badge */}
              <div style={{
                padding: '4px 8px',
                background: '#e0e7ff',
                border: '1px solid #c7d2fe',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#4338ca',
              }}>
                {formatVersion(version)}
              </div>

              {/* Save new label */}
              <span style={{ fontSize: '11px', color: '#666', fontWeight: '500' }}>SAVE NEW:</span>

              {/* Save buttons */}
              <button
                onClick={handleSavePatch}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Patch
              </button>
              <button
                onClick={handleSaveMinor}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Minor
              </button>
              <button
                onClick={handleSaveMajor}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Major
              </button>
              <button
                onClick={handleSaveFork}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Fork
              </button>
              <button
                onClick={handleResetVersions}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#dc2626',
                  background: '#fff',
                  border: '1px solid #fca5a5',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Reset Versions
              </button>
            </>
          ) : (
            <>
              {/* Simple save button */}
              <button
                onClick={handleSaveSimple}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#374151',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                Save
              </button>
            </>
          )}

          {/* Invest Button */}
          <button
            onClick={() => setShowInvestModal(true)}
            disabled={!apiKey || !apiSecret}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#fff',
              background: (!apiKey || !apiSecret) ? '#93c5fd' : '#1677ff',
              border: 'none',
              borderRadius: '4px',
              cursor: (!apiKey || !apiSecret) ? 'not-allowed' : 'pointer',
              marginLeft: '12px',
            }}
            onMouseEnter={(e) => {
              if (apiKey && apiSecret) e.currentTarget.style.background = '#1366d6';
            }}
            onMouseLeave={(e) => {
              if (apiKey && apiSecret) e.currentTarget.style.background = '#1677ff';
            }}
            title={!apiKey || !apiSecret ? 'Connect Alpaca account to deploy' : 'Deploy this strategy with real money'}
          >
            💰 Invest
          </button>

          <div style={{ marginLeft: 'auto' }} />
          <button
            onClick={uploadStrategy}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            title="Upload strategy from JSON"
          >
            📤 Upload
          </button>
          <button
            onClick={exportStrategy}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            title="Export strategy as JSON"
          >
            📥 Export
          </button>
          <button
            onClick={resetStrategy}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              color: '#dc2626',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            title="Reset and clear all"
          >
            🗑️ Reset
          </button>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div style={{
          padding: '12px 32px',
          background: '#fef2f2',
          borderBottom: '1px solid #fecaca',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>
            ⚠️ Fix {validationErrors.length} error{validationErrors.length > 1 ? 's' : ''} before running backtest:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {validationErrors.slice(0, 5).map((error, idx) => (
              <div key={idx} style={{ fontSize: '12px', color: '#7f1d1d', paddingLeft: '16px' }}>
                • {error.message}
              </div>
            ))}
            {validationErrors.length > 5 && (
              <div style={{ fontSize: '12px', color: '#7f1d1d', paddingLeft: '16px', fontStyle: 'italic' }}>
                ... and {validationErrors.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}


      {/* 2. Backtest Bar (Always Visible) */}
      {activeTab === "strategy" && (
        <div style={{
          margin: '16px 32px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {backtestResults ? (
            <Collapsible.Root open={backtestResultsOpen} onOpenChange={setBacktestResultsOpen}>
              <Collapsible.Trigger asChild>
              <div style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                background: '#fff',
                border: 'none',
                gap: '12px',
                cursor: 'pointer',
              }}>
                <button
                  onClick={backtestStrategy}
                  disabled={elements.length === 0 || isBacktesting || validationErrors.length > 0}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    color: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#9ca3af' : (hasVariables ? '#7f3dff' : '#059669'),
                    background: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#f9fafb' : '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                  }}
                  onMouseEnter={(e) => {
                    if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                      e.currentTarget.style.background = hasVariables ? '#f3e8ff' : '#d1fae5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                      e.currentTarget.style.background = '#fff';
                    }
                  }}
                  title={
                    validationErrors.length > 0
                      ? `Fix ${validationErrors.length} validation error(s) first`
                      : hasVariables
                        ? "Run batch backtests with all variable combinations"
                        : "Run full historical backtest"
                  }
                >
                  {isBacktesting ? '⏳ Running...' : (hasVariables ? '▶️ Batch Backtest' : '▶️ Backtest')}
                </button>

                {/* Benchmark field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                    Benchmark:
                  </label>
                  <input
                    value={benchmarkSymbol}
                    onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())}
                    placeholder="SPY"
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                {/* Start Date field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                    Start:
                  </label>
                  <input
                    type="date"
                    defaultValue={startDate === "max" ? "" : startDate}
                    onBlur={(e) => setStartDate(e.target.value || "max")}
                    placeholder="Max"
                    style={{
                      width: '140px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                {/* End Date field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                    End:
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      width: '140px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                <span style={{
                  fontSize: '14px',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  transform: backtestResultsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>▼</span>
              </div>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div style={{ padding: '24px' }}>
                {/* Metrics Grid */}
                {backtestResults.metrics && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    marginBottom: '24px',
                  }}>
                    {[
                      { label: 'Total Return', value: backtestResults.metrics.totalReturn, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                      { label: 'CAGR', value: backtestResults.metrics.CAGR, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                      { label: 'Volatility', value: backtestResults.metrics.annualVolatility, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                      { label: 'Sharpe', value: backtestResults.metrics.sharpe, format: (v: number) => v.toFixed(2) },
                      { label: 'Sortino', value: backtestResults.metrics.sortino, format: (v: number) => v.toFixed(2) },
                      { label: 'Max Drawdown', value: backtestResults.metrics.maxDrawdown, format: (v: number) => `${(v * 100).toFixed(2)}%` },
                    ].map(({ label, value, format }) => (
                      <div key={label} style={{
                        padding: '12px',
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                      }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
                        <div style={{ fontSize: '18px', fontWeight: '700' }}>
                          {value !== undefined && value !== null ? format(value) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Equity Curve Chart */}
                {backtestResults.dates && backtestResults.equityCurve && (
                  <div style={{
                    padding: '24px',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    marginBottom: '16px',
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Equity Curve</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                      {backtestResults.dates.length} days |
                      Final Value: ${backtestResults.equityCurve[backtestResults.equityCurve.length - 1]?.toFixed(2) || '1.00'}
                    </div>
                    <ResponsiveContainer width="100%" height={280} debounce={300}>
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(val) => {
                            const d = new Date(val);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(val) => `$${val.toFixed(2)}`}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#fff',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                          formatter={(value: any) => `$${Number(value).toFixed(4)}`}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '12px' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="strategy"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          name="Strategy"
                          isAnimationActive={false}
                        />
                        {backtestResults.benchmark && (
                          <Line
                            type="monotone"
                            dataKey="benchmark"
                            stroke="#9ca3af"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={false}
                            name={benchmarkSymbol}
                            isAnimationActive={false}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Daily Positions Table */}
                {backtestResults.dailyPositions && backtestResults.dailyPositions.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <Collapsible.Root defaultOpen={false}>
                      <Collapsible.Trigger asChild>
                        <button style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          background: '#f9fafb',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '600',
                        }}>
                          <span>Daily Positions ({backtestResults.dailyPositions.length} days)</span>
                          <span style={{ fontSize: '12px' }}>▼</span>
                        </button>
                      </Collapsible.Trigger>
                      <Collapsible.Content>
                        <div style={{
                          marginTop: '8px',
                          maxHeight: '500px',
                          overflow: 'auto',
                          background: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                        }}>
                          {(() => {
                            // Extract all unique tickers from daily positions
                            const allTickers = new Set<string>();
                            backtestResults.dailyPositions.forEach((day: any) => {
                              Object.keys(day).forEach((key) => {
                                if (key !== 'date') allTickers.add(key);
                              });
                            });
                            const tickers = Array.from(allTickers).sort();

                            return (
                              <table style={{
                                fontSize: '11px',
                                borderCollapse: 'collapse',
                                width: 'auto',
                              }}>
                                <thead>
                                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{
                                      padding: '6px 12px',
                                      textAlign: 'left',
                                      fontWeight: '600',
                                      position: 'sticky',
                                      left: 0,
                                      background: '#f9fafb',
                                      zIndex: 1,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      Date
                                    </th>
                                    {tickers.map((ticker) => (
                                      <th key={ticker} style={{
                                        padding: '6px 12px',
                                        textAlign: 'left',
                                        fontWeight: '600',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {ticker}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...backtestResults.dailyPositions].reverse().map((day: any, idx: number) => (
                                    <tr key={idx} style={{
                                      borderBottom: idx < backtestResults.dailyPositions.length - 1 ? '1px solid #f3f4f6' : 'none',
                                    }}>
                                      <td style={{
                                        padding: '4px 12px',
                                        fontFamily: 'monospace',
                                        fontSize: '10px',
                                        position: 'sticky',
                                        left: 0,
                                        background: '#fff',
                                        zIndex: 1,
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {day.date}
                                      </td>
                                      {tickers.map((ticker) => {
                                        const value = day[ticker];
                                        return (
                                          <td key={ticker} style={{
                                            padding: '4px 12px',
                                            textAlign: 'left',
                                            color: value > 0 ? '#059669' : '#6b7280',
                                            fontWeight: value > 0 ? '600' : '400',
                                            whiteSpace: 'nowrap',
                                          }}>
                                            {value !== undefined && value > 0
                                              ? `${(value * 100).toFixed(1)}%`
                                              : '-'}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                        </div>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </div>
                )}

                {/* Debug Info */}
                {backtestResults.debugDays && (
                  <Collapsible.Root defaultOpen>
                    <Collapsible.Trigger asChild>
                      <button style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                      }}>
                        <span>Debug Data ({backtestResults.debugDays.length} days)</span>
                        <span style={{ fontSize: '12px' }}>▼</span>
                      </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content>
                      <div style={{
                        marginTop: '8px',
                        maxHeight: '500px',
                        overflow: 'auto',
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                      }}>
                        {(() => {
                          // Collect all unique tickers and gates
                          const allTickers = new Set<string>();
                          const allGates = new Set<string>();

                          backtestResults.debugDays.forEach((day: any) => {
                            Object.keys(day.allocation || {}).forEach((ticker) => allTickers.add(ticker));
                            Object.keys(day.gateResults || {}).forEach((gate) => allGates.add(gate));
                          });

                          const tickers = Array.from(allTickers).sort();
                          const gates = Array.from(allGates).sort();

                          return (
                            <table style={{
                              fontSize: '11px',
                              borderCollapse: 'collapse',
                            }}>
                              <thead>
                                <tr style={{ background: '#fff', borderBottom: '2px solid #d1d5db' }}>
                                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', position: 'sticky', top: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap' }}>
                                    DATE
                                  </th>
                                  {tickers.map((ticker) => (
                                    <th key={ticker} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', position: 'sticky', top: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap' }}>
                                      {ticker}
                                    </th>
                                  ))}
                                  {gates.map((gate) => (
                                    <th key={gate} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', position: 'sticky', top: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap' }} title={gate}>
                                      {gate.slice(0, 5)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {backtestResults.debugDays.map((day: any, idx: number) => (
                                  <tr key={idx} style={{
                                    borderBottom: '1px solid #e5e7eb',
                                    background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                                  }}>
                                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                      {day.heldDate}
                                    </td>
                                    {tickers.map((ticker) => {
                                      const allocation = day.allocation?.[ticker];
                                      return (
                                        <td key={ticker} style={{ padding: '4px 8px', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                          {allocation ? (allocation * 100).toFixed(1) : '-'}
                                        </td>
                                      );
                                    })}
                                    {gates.map((gate) => {
                                      const result = day.gateResults?.[gate];
                                      return (
                                        <td key={gate} style={{ padding: '4px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                          {result === true ? '✓' : result === false ? '✗' : '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </Collapsible.Content>
                  </Collapsible.Root>
                )}
              </div>
            </Collapsible.Content>
            </Collapsible.Root>
          ) : (
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              background: '#fff',
              border: 'none',
              gap: '12px',
            }}>
              <button
                onClick={backtestStrategy}
                disabled={elements.length === 0 || isBacktesting || validationErrors.length > 0}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  color: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#9ca3af' : (hasVariables ? '#7f3dff' : '#059669'),
                  background: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? '#f9fafb' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: elements.length === 0 || isBacktesting || validationErrors.length > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
                onMouseEnter={(e) => {
                  if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                    e.currentTarget.style.background = hasVariables ? '#f3e8ff' : '#d1fae5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (elements.length > 0 && !isBacktesting && validationErrors.length === 0) {
                    e.currentTarget.style.background = '#fff';
                  }
                }}
                title={
                  validationErrors.length > 0
                    ? `Fix ${validationErrors.length} validation error(s) first`
                    : hasVariables
                      ? "Run batch backtests with all variable combinations"
                      : "Run full historical backtest"
                }
              >
                {isBacktesting ? '⏳ Running...' : (hasVariables ? '▶️ Batch Backtest' : '▶️ Backtest')}
              </button>

              {/* Benchmark field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                  Benchmark:
                </label>
                <input
                  value={benchmarkSymbol}
                  onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())}
                  placeholder="SPY"
                  style={{
                    width: '60px',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* Start Date field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                  Start:
                </label>
                <input
                  type="date"
                  defaultValue={startDate === "max" ? "" : startDate}
                  onBlur={(e) => setStartDate(e.target.value || "max")}
                  placeholder="Max"
                  style={{
                    width: '140px',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* End Date field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>
                  End:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: '140px',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Strategy Builder */}
      {activeTab === "strategy" && (
      <div
        onClick={() => {
          if (showDropdown) {
            setShowDropdown(false);
            setTickerInput("");
          }
        }}
        style={{
          padding: '0 16px 200px 16px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
        {/* Render elements */}
        {elements.length === 0 ? (
          <div style={{ padding: '8px 0px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!showDropdown ? (
                <button
                  onClick={() => setShowDropdown(true)}
                  style={{
                    fontSize: '14px',
                    color: '#3b82f6',
                    background: '#eff6ff',
                    border: '1px dashed #3b82f6',
                    cursor: 'pointer',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontWeight: '500',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#dbeafe'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#eff6ff'}
                >
                  + Add
                </button>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    padding: '8px',
                    background: '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleTickerSubmit();
                      } else if (e.key === 'Escape') {
                        setShowDropdown(false);
                        setTickerInput("");
                      }
                    }}
                    placeholder="Enter ticker..."
                    style={{
                      fontSize: '13px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleSelectType("weight")}
                    style={{
                      fontSize: '13px',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    Weight
                  </button>
                  <button
                    onClick={() => handleSelectType("gate")}
                    style={{
                      fontSize: '13px',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    Gate
                  </button>
                  {clipboard && (
                    <button
                      onClick={() => {
                        const cloned = deepCloneElement(clipboard);
                        saveToHistory([...elements, cloned]);
                        setShowDropdown(false);
                        setTickerInput("");
                      }}
                      style={{
                        fontSize: '13px',
                        padding: '4px 8px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '4px',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Copy size={14} /> Paste
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {elements.map((el, idx) => {
          if (el.type === "gate") {
            return (
              <GateCard
                key={el.id}
                element={el}
                onUpdate={(updated) => updateElement(el.id, updated)}
                onDelete={() => deleteElement(el.id)}
                onCopy={() => setClipboard(el)}
                clipboard={clipboard}
                depth={0}
                allElements={elements}
                validationErrors={validationErrors}
                definedVariables={definedVariables}
              />
            );
          } else if (el.type === "ticker") {
            return (
              <TickerCard
                key={el.id}
                element={el}
                onUpdate={(updated) => updateElement(el.id, updated)}
                onDelete={() => deleteElement(el.id)}
                onCopy={() => setClipboard(el)}
                depth={0}
                validationErrors={validationErrors}
                definedVariables={definedVariables}
              />
            );
          } else if (el.type === "weight") {
            return (
              <WeightCard
                key={el.id}
                element={el}
                onUpdate={(updated) => updateElement(el.id, updated)}
                onDelete={() => deleteElement(el.id)}
                onCopy={() => setClipboard(el)}
                clipboard={clipboard}
                initiallyOpen={idx === 0}
                depth={0}
                allElements={elements}
                validationErrors={validationErrors}
                definedVariables={definedVariables}
              />
            );
          }
          return null;
        })}
        </div>
      </div>
      )}

      {/* Variables Tab - MOVED to Library */}
      {false && (
        <div style={{ padding: '24px 32px' }}>
          <VariablesTab />
        </div>
      )}

      {/* Batch Tests Tab - MOVED to Library */}
      {false && (
        <div style={{ padding: '24px 32px' }}>
          <BatchTestsTab
            jobs={batchJobs}
            loading={batchLoading}
            onViewJob={async (job) => {
              if (!job.viewUrl) {
                alert('View URL not available for this job');
                return;
              }

              setLoadingResults(true);
              try {
                const response = await fetch(`${API_BASE}${job.viewUrl}`, {
                  credentials: 'include'
                });
                const data = await response.json();

                if (!response.ok) {
                  throw new Error(data.error || 'Failed to fetch results');
                }

                setViewingResults({
                  jobId: job.id,
                  name: job.name,
                  summary: data.summary,
                  runs: data.runs,
                });
                setShowResultsViewer(true);
              } catch (err: any) {
                console.error('Error fetching results:', err);
                alert(`Failed to load results: ${err.message}`);
              } finally {
                setLoadingResults(false);
              }
            }}
            onDownloadCsv={(job) => {
              if (job.csvUrl) {
                // Download CSV file
                const link = document.createElement('a');
                link.href = `${API_BASE}${job.csvUrl}`;
                link.download = `${job.name.replace(/[^a-z0-9]/gi, '_')}_results.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } else {
                alert('CSV URL not available for this job');
              }
            }}
            onCancelJob={async (job) => {
              if (job.status !== 'running' && job.status !== 'queued') {
                alert('Can only cancel running or queued jobs');
                return;
              }

              if (!confirm(`Cancel batch job "${job.name}"?`)) {
                return;
              }

              try {
                const response = await fetch(`${API_BASE}/api/batch_backtest_strategy/${job.id}/cancel`, {
                  method: 'POST',
                  credentials: 'include',
                });

                if (!response.ok) {
                  const data = await response.json();
                  throw new Error(data.error || 'Failed to cancel job');
                }

                // Update job status locally
                const cancelledJob = {
                  ...job,
                  status: 'failed' as const,
                  error: 'Cancelled by user',
                  updatedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                };
                setBatchJobs(prev => prev.map(j => j.id === job.id ? cancelledJob : j));
                await putJob(cancelledJob);
              } catch (err: any) {
                console.error('Error cancelling job:', err);
                alert(`Failed to cancel job: ${err.message}`);
              }
            }}
          />
        </div>
      )}

      <UndefinedVariablesModal
        open={showUndefinedAlert}
        variables={undefinedVariables}
        onClose={() => setShowUndefinedAlert(false)}
      />

      <BatchConfirmModal
        open={showBatchConfirm}
        confirm={batchConfirm}
        onCancel={() => {
          setShowBatchConfirm(false);
          setBatchConfirm(null);
        }}
        onConfirm={executeBatchBacktest}
      />

      <BatchResultsModal
        open={showResultsViewer}
        results={viewingResults}
        onClose={() => setShowResultsViewer(false)}
      />

      {/* Invest Modal */}
      {showInvestModal && (
        <InvestModal
          apiKey={apiKey}
          apiSecret={apiSecret}
          strategyName={strategyName}
          elements={elements}
          onClose={() => setShowInvestModal(false)}
          onSuccess={(result) => {
            setShowInvestModal(false);
            alert(
              `Strategy deployed successfully!\n\n` +
              `ID: ${result.strategy.id}\n` +
              `Name: ${result.strategy.name}\n` +
              `Investment: $${result.strategy.initial_capital.toFixed(2)}\n` +
              `Status: ${result.strategy.status}\n\n` +
              `View it in the Dashboard tab.`
            );
          }}
        />
      )}
    </div>
  );
}

import { useState, useMemo, useEffect, useCallback } from "react";
import type { Element, StrategyTab, StrategyVersion } from "../types/builder";

const STORAGE_KEY_TABS = "verticalUI2_strategy_tabs";
const STORAGE_KEY_ACTIVE_TAB = "verticalUI2_active_tab_id";
const STORAGE_KEY_STRATEGY_TO_LOAD = "strategyToLoad";

const createDefaultVersion = (): StrategyVersion => ({
  major: 0,
  minor: 0,
  patch: 1,
  fork: "",
});

const createStrategyTab = (overrides: Partial<StrategyTab> = {}): StrategyTab => {
  const nowIso = new Date().toISOString();
  const elements = overrides.elements ?? [];
  const history = overrides.history ?? [elements];
  const historyIndex = overrides.historyIndex ?? Math.max(0, history.length - 1);

  return {
    id: overrides.id ?? `tab-${Date.now()}`,
    elements,
    history,
    historyIndex,
    benchmarkSymbol: overrides.benchmarkSymbol ?? "SPY",
    startDate: overrides.startDate ?? "max",
    endDate: overrides.endDate ?? nowIso.slice(0, 10),
    backtestResults: overrides.backtestResults ?? null,
    strategyName: overrides.strategyName ?? "",
    versioningEnabled: overrides.versioningEnabled ?? false,
    version: overrides.version ?? createDefaultVersion(),
    createdAt: overrides.createdAt ?? nowIso,
    updatedAt: overrides.updatedAt ?? nowIso,
  };
};

const loadInitialTabs = (): StrategyTab[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TABS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Failed to load strategy tabs:", error);
  }
  return [createStrategyTab({ history: [[]], elements: [] })];
};

const loadInitialActiveTabId = (tabs: StrategyTab[]): string => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB);
    if (saved) {
      return saved;
    }
  } catch (error) {
    console.error("Failed to load active strategy tab id:", error);
  }
  return tabs[0]?.id ?? "";
};

type TabUpdater = Partial<StrategyTab> | ((tab: StrategyTab) => StrategyTab);

const applyUpdater = (tab: StrategyTab, updater: TabUpdater): StrategyTab =>
  typeof updater === "function" ? updater(tab) : { ...tab, ...updater };

export interface BuilderState {
  strategyTabs: StrategyTab[];
  activeStrategyTabId: string;
  currentTab: StrategyTab;
  elements: Element[];
  history: Element[][];
  historyIndex: number;
  benchmarkSymbol: string;
  startDate: string;
  endDate: string;
  backtestResults: any;
  strategyName: string;
  versioningEnabled: boolean;
  version: StrategyVersion;
  createdAt: string;
  updatedAt: string;
  note: string | null;
  description: string | null;
  nameBarExpanded: boolean;
  strategyId: number | undefined;
}

export interface BuilderActions {
  setActiveStrategyTabId: (tabId: string) => void;
  setElements: (value: Element[] | ((prev: Element[]) => Element[])) => void;
  setHistory: (history: Element[][]) => void;
  setHistoryIndex: (index: number) => void;
  setBenchmarkSymbol: (symbol: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setBacktestResults: (results: any) => void;
  setStrategyName: (name: string) => void;
  setVersioningEnabled: (enabled: boolean) => void;
  setVersion: (version: StrategyVersion) => void;
  setCreatedAt: (iso: string) => void;
  setUpdatedAt: (iso: string) => void;
  setNote: (note: string | null) => void;
  setDescription: (description: string | null) => void;
  setNameBarExpanded: (expanded: boolean) => void;
  setStrategyId: (id: number | undefined) => void;
  saveToHistory: (elements: Element[]) => void;
  undo: () => void;
  redo: () => void;
  addTab: (overrides?: Partial<StrategyTab>) => StrategyTab;
  closeTab: (tabId: string) => void;
  updateTab: (tabId: string, updater: TabUpdater) => void;
}

export interface UseBuilderStateResult {
  state: BuilderState;
  actions: BuilderActions;
}

export const useBuilderState = (): UseBuilderStateResult => {
  const initialTabs = useMemo(loadInitialTabs, []);
  const [strategyTabs, setStrategyTabs] = useState<StrategyTab[]>(initialTabs);
  const [activeStrategyTabId, setActiveStrategyTabId] = useState<string>(() =>
    loadInitialActiveTabId(initialTabs)
  );

  const currentTab =
    useMemo(() => strategyTabs.find((tab) => tab.id === activeStrategyTabId), [strategyTabs, activeStrategyTabId]) ??
    strategyTabs[0] ??
    createStrategyTab({ history: [[]], elements: [] });

  const elements = currentTab.elements ?? [];
  const history = currentTab.history ?? [[]];
  const historyIndex = currentTab.historyIndex ?? 0;
  const benchmarkSymbol = currentTab.benchmarkSymbol ?? "SPY";
  const startDate = currentTab.startDate ?? "max";
  const endDate = currentTab.endDate ?? new Date().toISOString().slice(0, 10);
  const backtestResults = currentTab.backtestResults ?? null;
  const strategyName = currentTab.strategyName ?? "";
  const versioningEnabled = currentTab.versioningEnabled ?? false;
  const version = currentTab.version ?? createDefaultVersion();
  const createdAt = currentTab.createdAt ?? new Date().toISOString();
  const updatedAt = currentTab.updatedAt ?? new Date().toISOString();
  const note = currentTab.note ?? null;
  const description = currentTab.description ?? null;
  const nameBarExpanded = currentTab.nameBarExpanded ?? false;
  const strategyId = currentTab.strategyId;

  const updateTab = useCallback(
    (tabId: string, updater: TabUpdater) => {
      setStrategyTabs((prev) => prev.map((tab) => (tab.id === tabId ? applyUpdater(tab, updater) : tab)));
    },
    [setStrategyTabs]
  );

  const setCurrentTab = useCallback(
    (updater: TabUpdater) => {
      if (!activeStrategyTabId) return;
      updateTab(activeStrategyTabId, updater);
    },
    [activeStrategyTabId, updateTab]
  );

  const setElements = useCallback(
    (value: Element[] | ((prev: Element[]) => Element[])) => {
      setCurrentTab((tab) => {
        const nextElements = typeof value === "function" ? value(tab.elements ?? []) : value;
        return { ...tab, elements: nextElements };
      });
    },
    [setCurrentTab]
  );

  const setHistory = useCallback(
    (historyValue: Element[][]) => {
      setCurrentTab((tab) => ({ ...tab, history: historyValue }));
    },
    [setCurrentTab]
  );

  const setHistoryIndex = useCallback(
    (index: number) => {
      setCurrentTab((tab) => ({ ...tab, historyIndex: index }));
    },
    [setCurrentTab]
  );

  const setBenchmarkSymbol = useCallback(
    (symbol: string) => {
      setCurrentTab((tab) => ({ ...tab, benchmarkSymbol: symbol }));
    },
    [setCurrentTab]
  );

  const setStartDate = useCallback(
    (date: string) => {
      setCurrentTab((tab) => ({ ...tab, startDate: date }));
    },
    [setCurrentTab]
  );

  const setEndDate = useCallback(
    (date: string) => {
      setCurrentTab((tab) => ({ ...tab, endDate: date }));
    },
    [setCurrentTab]
  );

  const setBacktestResults = useCallback(
    (results: any) => {
      setCurrentTab((tab) => ({ ...tab, backtestResults: results }));
    },
    [setCurrentTab]
  );

  const setStrategyName = useCallback(
    (name: string) => {
      setCurrentTab((tab) => ({ ...tab, strategyName: name }));
    },
    [setCurrentTab]
  );

  const setVersioningEnabled = useCallback(
    (enabled: boolean) => {
      setCurrentTab((tab) => ({ ...tab, versioningEnabled: enabled }));
    },
    [setCurrentTab]
  );

  const setVersion = useCallback(
    (next: StrategyVersion) => {
      setCurrentTab((tab) => ({ ...tab, version: next }));
    },
    [setCurrentTab]
  );

  const setCreatedAt = useCallback(
    (iso: string) => {
      setCurrentTab((tab) => ({ ...tab, createdAt: iso }));
    },
    [setCurrentTab]
  );

  const setUpdatedAt = useCallback(
    (iso: string) => {
      setCurrentTab((tab) => ({ ...tab, updatedAt: iso }));
    },
    [setCurrentTab]
  );

  const setNote = useCallback(
    (note: string | null) => {
      setCurrentTab((tab) => ({ ...tab, note }));
    },
    [setCurrentTab]
  );

  const setDescription = useCallback(
    (description: string | null) => {
      setCurrentTab((tab) => ({ ...tab, description }));
    },
    [setCurrentTab]
  );

  const setNameBarExpanded = useCallback(
    (expanded: boolean) => {
      setCurrentTab((tab) => ({ ...tab, nameBarExpanded: expanded }));
    },
    [setCurrentTab]
  );

  const setStrategyId = useCallback(
    (id: number | undefined) => {
      setCurrentTab((tab) => ({ ...tab, strategyId: id }));
    },
    [setCurrentTab]
  );

  const saveToHistory = useCallback(
    (nextElements: Element[]) => {
      setCurrentTab((tab) => {
        const newHistory = tab.history.slice(0, tab.historyIndex + 1);
        newHistory.push(nextElements);
        return {
          ...tab,
          elements: nextElements,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        };
      });
    },
    [setCurrentTab]
  );

  const undo = useCallback(() => {
    setCurrentTab((tab) => {
      if (tab.historyIndex <= 0) {
        return tab;
      }
      const newIndex = tab.historyIndex - 1;
      return {
        ...tab,
        historyIndex: newIndex,
        elements: tab.history[newIndex] ?? [],
      };
    });
  }, [setCurrentTab]);

  const redo = useCallback(() => {
    setCurrentTab((tab) => {
      if (tab.historyIndex >= tab.history.length - 1) {
        return tab;
      }
      const newIndex = tab.historyIndex + 1;
      return {
        ...tab,
        historyIndex: newIndex,
        elements: tab.history[newIndex] ?? [],
      };
    });
  }, [setCurrentTab]);

  const addTab = useCallback(
    (overrides: Partial<StrategyTab> = {}): StrategyTab => {
      const newTab = createStrategyTab({
        ...overrides,
        history: overrides.history ?? [overrides.elements ?? []],
        historyIndex: overrides.historyIndex ?? 0,
      });
      setStrategyTabs((prev) => [...prev, newTab]);
      setActiveStrategyTabId(newTab.id);
      return newTab;
    },
    []
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setStrategyTabs((prev) => {
        if (prev.length <= 1) {
          return prev;
        }
        const filtered = prev.filter((tab) => tab.id !== tabId);
        if (tabId === activeStrategyTabId) {
          const nextActive = filtered[0]?.id ?? "";
          setActiveStrategyTabId(nextActive);
        }
        return filtered;
      });
    },
    [activeStrategyTabId]
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(strategyTabs));
    } catch (error) {
      console.error("Failed to save strategy tabs:", error);
    }
  }, [strategyTabs]);

  useEffect(() => {
    try {
      if (activeStrategyTabId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, activeStrategyTabId);
      }
    } catch (error) {
      console.error("Failed to save active tab id:", error);
    }
  }, [activeStrategyTabId]);

  useEffect(() => {
    const strategyToLoadStr = localStorage.getItem(STORAGE_KEY_STRATEGY_TO_LOAD);
    if (!strategyToLoadStr) return;

    try {
      const strategyData = JSON.parse(strategyToLoadStr);
      addTab({
        elements: strategyData.elements || [],
        history: [strategyData.elements || []],
        historyIndex: 0,
        strategyName: strategyData.name || "",
        versioningEnabled: strategyData.versioningEnabled || false,
        version: strategyData.version || createDefaultVersion(),
        createdAt: strategyData.createdAt || new Date().toISOString(),
        updatedAt: strategyData.updatedAt || new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to load strategy from Library:", error);
    } finally {
      localStorage.removeItem(STORAGE_KEY_STRATEGY_TO_LOAD);
    }
  }, [addTab]);

  const state: BuilderState = {
    strategyTabs,
    activeStrategyTabId,
    currentTab,
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
    note,
    description,
    nameBarExpanded,
    strategyId,
  };

  const actions: BuilderActions = {
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
    setNote,
    setDescription,
    setNameBarExpanded,
    setStrategyId,
    saveToHistory,
    undo,
    redo,
    addTab,
    closeTab,
    updateTab,
  };

  return { state, actions };
};

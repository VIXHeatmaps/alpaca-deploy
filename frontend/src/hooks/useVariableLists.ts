import { useCallback, useState, useEffect } from "react";
import * as variablesApi from "../api/variables";

export const useVariableLists = () => {
  const [variableLists, setVariableLists] = useState<variablesApi.VariableList[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(true); // Start as true since we auto-fetch

  const refreshVariableLists = useCallback(async () => {
    try {
      console.log('[useVariableLists] Starting fetch - setting loading=true');
      setVariablesLoading(true);
      const lists = await variablesApi.getAllVariableLists();
      console.log('[useVariableLists] Fetch complete - received', lists.length, 'variables:', lists.map(v => v.name));
      setVariableLists(lists);
    } catch (error) {
      console.error("Failed to load variables:", error);
    } finally {
      console.log('[useVariableLists] Setting loading=false');
      setVariablesLoading(false);
    }
  }, []);

  // Auto-fetch variables on mount
  useEffect(() => {
    refreshVariableLists();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    variableLists,
    variablesLoading,
    refreshVariableLists,
  };
};

import { useCallback, useState, useEffect } from "react";
import * as variablesApi from "../api/variables";

export const useVariableLists = () => {
  const [variableLists, setVariableLists] = useState<variablesApi.VariableList[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(true); // Start as true since we auto-fetch

  const refreshVariableLists = useCallback(async () => {
    try {
      setVariablesLoading(true);
      const lists = await variablesApi.getAllVariableLists();
      setVariableLists(lists);
    } catch (error) {
      console.error("Failed to load variables:", error);
    } finally {
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

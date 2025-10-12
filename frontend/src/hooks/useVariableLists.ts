import { useCallback, useState } from "react";
import * as variablesApi from "../api/variables";

export const useVariableLists = () => {
  const [variableLists, setVariableLists] = useState<variablesApi.VariableList[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(false);

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

  return {
    variableLists,
    variablesLoading,
    refreshVariableLists,
  };
};

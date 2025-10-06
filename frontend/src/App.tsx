/* ==============================
   Alpaca Algo — Production Frontend
   Dashboard + Vertical UI 2 Only
   ============================== */

import { useState } from "react";
import { Dashboard } from "./components/Dashboard";
import VerticalUI2 from "./components/VerticalUI2";
import "./App.css";

function App() {
  const [uiTab, setUiTab] = useState<"dashboard" | "vertical2">("dashboard");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [mask, setMask] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);

  return (
    <div style={{
      fontFamily: "-apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      color: "#111",
      background: "#fff",
      minHeight: "100vh",
      padding: "12px 16px 40px"
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          <button
            className={`tabBtn ${uiTab === "dashboard" ? "active" : ""}`}
            onClick={() => setUiTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`tabBtn ${uiTab === "vertical2" ? "active" : ""}`}
            onClick={() => setUiTab("vertical2")}
          >
            Strategy Builder
          </button>
        </div>

        {/* Tab Content */}
        {uiTab === "dashboard" ? (
          <Dashboard
            apiKey={apiKey}
            apiSecret={apiSecret}
            mask={mask}
            connected={connected}
            onApiKeyChange={setApiKey}
            onApiSecretChange={setApiSecret}
            onMaskToggle={() => setMask(!mask)}
            onViewStrategyFlow={() => setUiTab("vertical2")}
          />
        ) : (
          <VerticalUI2 />
        )}
      </div>
    </div>
  );
}

export default App;

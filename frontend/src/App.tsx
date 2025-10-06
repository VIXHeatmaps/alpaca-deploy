/* ==============================
   Alpaca Algo — Production Frontend
   Dashboard + Vertical UI 2 Only
   ============================== */

import React, { useState } from "react";
import Dashboard from "./components/Dashboard";
import VerticalUI2 from "./components/VerticalUI2";
import "./App.css";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

function App() {
  const [uiTab, setUiTab] = useState<"dashboard" | "vertical2">("dashboard");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  return (
    <div style={{
      fontFamily: "-apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      color: "#111",
      background: "#fff",
      minHeight: "100vh",
      padding: "12px 16px 40px"
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{
          fontSize: 26,
          fontWeight: 700,
          marginBottom: 20,
          color: "#111"
        }}>
          Alpaca Strategy App
        </h1>

        {/* API Keys Input */}
        <div style={{
          marginBottom: 24,
          padding: 16,
          background: "#f5f5f5",
          borderRadius: 8
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "block", color: "#333" }}>
              Alpaca API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="PK..."
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "block", color: "#333" }}>
              Alpaca API Secret
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Secret..."
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 14
              }}
            />
          </div>
        </div>

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
            onLoadFlow={() => {
              // Switch to strategy builder when loading from dashboard
              setUiTab("vertical2");
            }}
          />
        ) : (
          <VerticalUI2 />
        )}
      </div>
    </div>
  );
}

export default App;

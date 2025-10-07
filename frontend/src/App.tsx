/* ==============================
   Alpaca Algo — Production Frontend
   Dashboard + Vertical UI 2 Only
   ============================== */

import { useState, useEffect } from "react";
import { Dashboard } from "./components/Dashboard";
import { BuilderWrapper } from "./components/BuilderWrapper";
import "./App.css";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string | null;
}

function App() {
  const [uiTab, setUiTab] = useState<"dashboard" | "library" | "builder">("dashboard");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [mask, setMask] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    fetch(`${API_BASE}/auth/user`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {
        // Not authenticated
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const errorCode = url.searchParams.get('authError');
      const errorDetail = url.searchParams.get('authErrorDetail');
      if (errorCode) {
        let message = errorDetail || 'Sign-in failed. Please contact support.';
        if (!errorDetail) {
          if (errorCode === 'discord_email_required') {
            message = 'Discord has no verified email on this account. Please verify an email or contact an admin.';
          } else if (errorCode === 'discord_whitelist_denied') {
            message = 'Your Discord account is not on the approved access list.';
          }
        }
        setAuthError(message);
        url.searchParams.delete('authError');
        url.searchParams.delete('authErrorDetail');
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch (err) {
      console.warn('Failed to parse auth error parameters', err);
    }
  }, []);

  const handleLogin = () => {
    window.location.href = `${API_BASE}/auth/discord`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: "-apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: "-apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        background: '#f5f5f5'
      }}>
        <div style={{
          background: 'white',
          padding: '48px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          {authError && (
            <div style={{
              background: '#fdecea',
              color: '#b00020',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '24px',
              border: '1px solid #f8c7c3',
              textAlign: 'left' as const,
              fontSize: '14px'
            }}>
              {authError}
            </div>
          )}
          <h1 style={{ marginBottom: '24px', fontSize: '24px', fontWeight: 600 }}>
            Alpaca Deploy
          </h1>
          <p style={{ marginBottom: '32px', color: '#666' }}>
            Please sign in with Discord to continue
          </p>
          <button
            onClick={handleLogin}
            style={{
              background: '#5865F2',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '0 auto'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
            </svg>
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "-apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      color: "#111",
      background: "#fff",
      minHeight: "100vh",
      padding: "12px 16px 40px"
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header with user info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: '#666' }}>
            Signed in as <strong>{user.username}</strong>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: '#f5f5f5',
              border: '1px solid #ddd',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>

        {/* Main Navigation Tabs */}
        <div style={{
          borderBottom: "1px solid #e5e7eb",
          marginBottom: 32,
          display: "flex",
          justifyContent: "center",
          gap: 16,
        }}>
          <button
            onClick={() => setUiTab("dashboard")}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 500,
              color: uiTab === "dashboard" ? "#1677ff" : "#6b7280",
              borderBottom: uiTab === "dashboard" ? "2px solid #1677ff" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setUiTab("library")}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 500,
              color: uiTab === "library" ? "#1677ff" : "#6b7280",
              borderBottom: uiTab === "library" ? "2px solid #1677ff" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            Library
          </button>
          <button
            onClick={() => setUiTab("builder")}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 500,
              color: uiTab === "builder" ? "#1677ff" : "#6b7280",
              borderBottom: uiTab === "builder" ? "2px solid #1677ff" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            Builder
          </button>
        </div>

        {/* Tab Content */}
        {uiTab === "dashboard" && (
          <Dashboard
            apiKey={apiKey}
            apiSecret={apiSecret}
            mask={mask}
            connected={connected}
            onApiKeyChange={setApiKey}
            onApiSecretChange={setApiSecret}
            onMaskToggle={() => setMask(!mask)}
            onViewStrategyFlow={() => setUiTab("builder")}
          />
        )}

        {(uiTab === "library" || uiTab === "builder") && (
          <BuilderWrapper
            apiKey={apiKey}
            apiSecret={apiSecret}
            view={uiTab}
          />
        )}
      </div>
    </div>
  );
}

export default App;

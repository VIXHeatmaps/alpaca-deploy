/**
 * Strategy View Modal
 *
 * Read-only modal displaying strategy logic with an EDIT button
 * that opens the Builder in a new tab
 */

import React from 'react';
import type { Strategy } from '../api/strategies';

type Props = {
  strategy: Strategy | null;
  onClose: () => void;
};

export function StrategyViewModal({ strategy, onClose }: Props) {
  if (!strategy) return null;

  const handleEdit = () => {
    // Encode strategy data in URL for Builder to load
    const encodedElements = encodeURIComponent(JSON.stringify(strategy.elements));
    const encodedName = encodeURIComponent(strategy.name);
    window.open(`/builder?strategy=${strategy.id}&name=${encodedName}&elements=${encodedElements}`, '_blank');
  };

  const formatElement = (element: any, depth = 0): React.ReactNode => {
    const indent = depth * 20;

    if (!element) return null;

    return (
      <div key={element.id} style={{ marginLeft: indent, marginBottom: 8 }}>
        <div style={{
          padding: "8px 12px",
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, color: "#111827", marginBottom: 4 }}>
            {element.type}
          </div>
          {element.symbol && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Symbol: <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{element.symbol}</span>
            </div>
          )}
          {element.indicator && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Indicator: {element.indicator}
            </div>
          )}
          {element.compareValue !== undefined && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Value: {element.compareValue}
            </div>
          )}
        </div>
        {element.children && element.children.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {element.children.map((child: any) => formatElement(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "90%",
          maxWidth: 800,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
              {strategy.name}
            </h2>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Read-only view • Status: <span style={{
                padding: "2px 6px",
                borderRadius: 3,
                fontSize: 11,
                fontWeight: 600,
                background: strategy.status === 'LIVE' ? "#e8f5ed" : strategy.status === 'LIQUIDATED' ? "#fef3c7" : "#f3f4f6",
                color: strategy.status === 'LIVE' ? "#0f7a3a" : strategy.status === 'LIQUIDATED' ? "#92400e" : "#6b7280",
              }}>
                {strategy.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 24,
              color: "#6b7280",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 24px",
        }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 }}>
              Strategy Logic
            </h3>
            {strategy.elements && strategy.elements.length > 0 ? (
              strategy.elements.map((element) => formatElement(element))
            ) : (
              <div style={{ color: "#9ca3af", fontSize: 14, padding: 20, textAlign: "center" }}>
                No strategy elements defined
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Last updated: {new Date(strategy.updated_at).toLocaleString()}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Close
            </button>
            <button
              onClick={handleEdit}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                border: "none",
                borderRadius: 6,
                background: "#1677ff",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              EDIT in Builder →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

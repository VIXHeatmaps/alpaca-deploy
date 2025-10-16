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
    // Open builder in new tab - builder will load this strategy
    window.open(`/builder?load=${strategy.id}`, '_blank');
  };

  const formatElement = (element: any, depth = 0): React.ReactNode => {
    const indent = depth * 20;
    if (!element) return null;

    // Determine colors based on type
    const bgColor = element.type === 'weight' ? '#eff6ff' : element.type === 'ticker' ? '#f0fdf4' : '#f9fafb';
    const borderColor = element.type === 'weight' ? '#dbeafe' : element.type === 'ticker' ? '#dcfce7' : '#e5e7eb';

    return (
      <div key={element.id} style={{ marginLeft: indent, marginBottom: 8 }}>
        <div style={{
          padding: "12px",
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 6,
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
            {element.type}
          </div>

          {/* Weight element */}
          {element.type === 'weight' && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 4 }}>
                {element.name || 'Unnamed Weight'}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Allocation: <span style={{ fontWeight: 600 }}>{element.weight}%</span>
                {element.weightMode && <span> • Mode: {element.weightMode}</span>}
              </div>
            </>
          )}

          {/* Ticker element */}
          {element.type === 'ticker' && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 4, fontFamily: 'monospace' }}>
                {element.ticker}
              </div>
              {element.weight !== undefined && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Weight: <span style={{ fontWeight: 600 }}>{element.weight}%</span>
                </div>
              )}
            </>
          )}

          {/* Gate element */}
          {element.type === 'gate' && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>
                {element.name || 'Gate'}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Mode: {element.conditionMode} • Conditions: {element.conditions?.length || 0}
              </div>
            </>
          )}

          {/* Sort element */}
          {element.type === 'sort' && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#581c87", marginBottom: 4 }}>
                {element.name || 'Sort'}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {element.indicator} • {element.direction} {element.count}
              </div>
            </>
          )}

          {/* Scale element */}
          {element.type === 'scale' && element.config && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>
                {element.name || 'Scale'}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Range: {element.config.rangeMin} - {element.config.rangeMax}
              </div>
            </>
          )}
        </div>

        {/* Render children */}
        {element.children && element.children.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {element.children.map((child: any) => formatElement(child, depth + 1))}
          </div>
        )}

        {/* Gate branches */}
        {element.type === 'gate' && (
          <>
            {element.thenChildren && element.thenChildren.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#059669", marginBottom: 4, marginLeft: indent + 12 }}>THEN:</div>
                {element.thenChildren.map((child: any) => formatElement(child, depth + 1))}
              </div>
            )}
            {element.elseChildren && element.elseChildren.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginBottom: 4, marginLeft: indent + 12 }}>ELSE:</div>
                {element.elseChildren.map((child: any) => formatElement(child, depth + 1))}
              </div>
            )}
          </>
        )}

        {/* Scale branches */}
        {element.type === 'scale' && (
          <>
            {element.fromChildren && element.fromChildren.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0369a1", marginBottom: 4, marginLeft: indent + 12 }}>FROM:</div>
                {element.fromChildren.map((child: any) => formatElement(child, depth + 1))}
              </div>
            )}
            {element.toChildren && element.toChildren.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0369a1", marginBottom: 4, marginLeft: indent + 12 }}>TO:</div>
                {element.toChildren.map((child: any) => formatElement(child, depth + 1))}
              </div>
            )}
          </>
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

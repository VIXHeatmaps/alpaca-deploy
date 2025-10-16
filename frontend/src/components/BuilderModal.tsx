/**
 * Builder Modal
 *
 * Large modal (90% viewport) containing the full Builder component
 * for editing LIVE strategies directly from the Dashboard
 */

import { useEffect } from 'react';
import { BuilderWrapper } from './BuilderWrapper';
import type { Strategy } from '../api/strategies';

type Props = {
  strategy: Strategy;
  apiKey: string;
  apiSecret: string;
  onClose: () => void;
  onLoadStrategy: (strategy: Strategy) => void;
};

export function BuilderModal({ strategy, apiKey, apiSecret, onClose, onLoadStrategy }: Props) {
  // Load the strategy when modal opens
  useEffect(() => {
    onLoadStrategy(strategy);
  }, [strategy.id]);

  const handleExpandToTab = () => {
    // Strategy is already loaded, just navigate to builder in new tab
    window.open('/builder', '_blank');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '2vh 2vw',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with controls */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f9fafb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Editing: {strategy.name}
            </h2>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                background: '#e8f5ed',
                color: '#0f7a3a',
                border: '1px solid #b7e3c8',
              }}
            >
              LIVE
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleExpandToTab}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 500,
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#374151',
              }}
            >
              Expand to Tab →
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#ef4444',
                border: 'none',
                fontSize: 18,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                padding: '6px 16px',
                borderRadius: 6,
                lineHeight: 1.4,
              }}
              title="Close modal and return to Dashboard"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Builder Content */}
        <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
          <BuilderWrapper
            apiKey={apiKey}
            apiSecret={apiSecret}
            view="builder"
            onLoadStrategy={onLoadStrategy}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Builder Modal
 *
 * Large modal showing the full Builder for a specific strategy
 * Can be expanded to dedicated URL for full-page editing
 */

import { useNavigate } from 'react-router-dom';
import { StrategyEditor } from './StrategyEditor';
import type { Strategy } from '../api/strategies';

type Props = {
  strategy: Strategy;
  apiKey: string;
  apiSecret: string;
  onClose: () => void;
  onLoadStrategy: (strategy: Strategy) => void;
};

export function BuilderModal({ strategy, apiKey, apiSecret, onClose, onLoadStrategy }: Props) {
  const navigate = useNavigate();

  const handleExpandToPage = () => {
    onClose();
    navigate(`/strategies/${encodeURIComponent(strategy.name)}`);
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
          width: '75%',
          height: '75%',
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
              onClick={handleExpandToPage}
              style={{
                padding: '6px 12px',
                fontSize: 16,
                fontWeight: 600,
                background: '#1677ff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#fff',
              }}
              title="Open in full page"
            >
              ⤢
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
              ✕
            </button>
          </div>
        </div>

        {/* Strategy Editor Content */}
        <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
          <StrategyEditor
            apiKey={apiKey}
            apiSecret={apiSecret}
            strategyName={strategy.name}
            onLoadStrategy={onLoadStrategy}
            isModal={true}
          />
        </div>
      </div>
    </div>
  );
}

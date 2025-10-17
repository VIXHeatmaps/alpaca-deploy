/**
 * Strategy Name Bar Component
 *
 * Expandable bar showing:
 * - Collapsed: Name (editable), Note (single-line), ID#
 * - Expanded: Version helper toggle with patch/minor/major/fork buttons, Description textarea
 */

import React, { useState } from 'react';

interface Props {
  strategyId: number | undefined;
  name: string;
  note: string | null;
  description: string | null;
  versioningEnabled: boolean;
  isExpanded: boolean;
  onNameChange: (name: string) => void;
  onNoteChange: (note: string) => void;
  onDescriptionChange: (description: string) => void;
  onVersioningToggle: (enabled: boolean) => void;
  onVersionButtonClick: (type: 'patch' | 'minor' | 'major' | 'fork') => void;
  onExpandedChange: (expanded: boolean) => void;
}

export function StrategyNameBar({
  strategyId,
  name,
  note,
  description,
  versioningEnabled,
  isExpanded,
  onNameChange,
  onNoteChange,
  onDescriptionChange,
  onVersioningToggle,
  onVersionButtonClick,
  onExpandedChange,
}: Props) {
  const [showDescriptionField, setShowDescriptionField] = useState(false);

  const handleVersionButtonClick = (type: 'patch' | 'minor' | 'major' | 'fork') => {
    if (type === 'fork') {
      const forkSuffix = prompt('Enter fork suffix (e.g., alpha, beta):');
      if (forkSuffix) {
        onVersionButtonClick('fork');
        // Parent will handle appending the fork suffix
      }
    } else {
      onVersionButtonClick(type);
    }
  };

  return (
    <div style={{
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      {/* Header - always visible */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <span style={{ fontSize: 16, color: '#6b7280' }}>
          {isExpanded ? '🔽' : '▶'}
        </span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              e.stopPropagation();
              onNameChange(e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Strategy Name"
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: 15,
              fontWeight: 600,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
            }}
          />
          <input
            type="text"
            value={note || ''}
            onChange={(e) => {
              e.stopPropagation();
              onNoteChange(e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Note (optional)"
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: 14,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              color: '#6b7280',
            }}
          />
        </div>
        {strategyId && (
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#9ca3af',
            fontFamily: 'monospace',
          }}>
            ID#{strategyId}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '0 16px 16px 16px' }}>
          {/* Version Helper */}
          <div style={{
            padding: '12px',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            marginBottom: 12,
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}>
              <input
                type="checkbox"
                checked={versioningEnabled}
                onChange={(e) => onVersioningToggle(e.target.checked)}
              />
              ⚙️ Version Helper
            </label>

            {versioningEnabled && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleVersionButtonClick('patch')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#1e40af',
                  }}
                  title="Increment patch version (0.0.X)"
                >
                  patch
                </button>
                <button
                  onClick={() => handleVersionButtonClick('minor')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#15803d',
                  }}
                  title="Increment minor version (0.X.0)"
                >
                  minor
                </button>
                <button
                  onClick={() => handleVersionButtonClick('major')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: '#fef3c7',
                    border: '1px solid #fde047',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#92400e',
                  }}
                  title="Increment major version (X.0.0)"
                >
                  major
                </button>
                <button
                  onClick={() => handleVersionButtonClick('fork')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#991b1b',
                  }}
                  title="Add fork suffix (e.g., -alpha)"
                >
                  fork
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <button
              onClick={() => setShowDescriptionField(!showDescriptionField)}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 500,
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {showDescriptionField ? '🔽' : '▶'} Description
            </button>

            {showDescriptionField && (
              <textarea
                value={description || ''}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Optional long-form notes (markdown supported)"
                rows={8}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  background: '#fff',
                  resize: 'vertical',
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

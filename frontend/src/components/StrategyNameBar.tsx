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
        }}
      >
        <span
          style={{ fontSize: 12, color: '#374151', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => onExpandedChange(!isExpanded)}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Strategy Name"
          style={{
            flex: '0 0 220px',
            padding: '4px 8px',
            fontSize: 13,
            fontWeight: 400,
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            background: '#fff',
            color: '#6b7280',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            color: '#111827',
            cursor: 'pointer',
            userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={versioningEnabled}
              onChange={(e) => onVersioningToggle(e.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>v</span>
          </label>
          {versioningEnabled && (
            <>
              <button
                onClick={() => handleVersionButtonClick('patch')}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#374151',
                }}
                title="Increment patch version (0.0.X)"
              >
                patch
              </button>
              <button
                onClick={() => handleVersionButtonClick('minor')}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#374151',
                }}
                title="Increment minor version (0.X.0)"
              >
                minor
              </button>
              <button
                onClick={() => handleVersionButtonClick('major')}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#374151',
                }}
                title="Increment major version (X.0.0)"
              >
                major
              </button>
              <button
                onClick={() => handleVersionButtonClick('fork')}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#374151',
                }}
                title="Add fork suffix (e.g., -alpha)"
              >
                fork
              </button>
            </>
          )}
        </div>
        <input
          type="text"
          value={note || ''}
          onChange={(e) => onNoteChange(e.target.value)}
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
          {/* Description */}
          <div>
            <textarea
              value={description || ''}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Description (optional, markdown supported)"
              rows={6}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: '#fff',
                resize: 'vertical',
                color: '#374151',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

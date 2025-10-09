import React, { useState } from 'react';

export type InvestModalProps = {
  apiKey: string;
  apiSecret: string;
  strategyName: string;
  elements: any[];
  onClose: () => void;
  onSuccess: (result: any) => void;
};

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://127.0.0.1:4000';

export function InvestModal({
  apiKey,
  apiSecret,
  strategyName,
  elements,
  onClose,
  onSuccess,
}: InvestModalProps) {
  const [amount, setAmount] = useState('1000');
  const [investing, setInvesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvest = async () => {
    const investAmount = parseFloat(amount);
    if (!investAmount || investAmount <= 0) {
      setError('Please enter a valid investment amount');
      return;
    }

    setInvesting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/invest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        body: JSON.stringify({
          name: strategyName,
          amount: investAmount,
          elements,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Investment failed');
      }

      onSuccess(data);
    } catch (err: any) {
      console.error('Investment error:', err);
      setError(err.message || 'Failed to invest');
    } finally {
      setInvesting(false);
    }
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
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '650px',
          width: '90%',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700' }}>
          Deploy Strategy
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
            Strategy: <strong>{strategyName}</strong>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            Investment Amount ($)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            min="1"
            step="1"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{
          marginBottom: '24px',
          padding: '16px',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '6px',
        }}>
          <div style={{ fontSize: '14px', color: '#0c4a6e', lineHeight: '1.5' }}>
            Strategy will trade during the next available trade window. Positions will be visible in the Dashboard after execution.
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '12px',
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c00',
              fontSize: '14px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={investing}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: investing ? 'not-allowed' : 'pointer',
              opacity: investing ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInvest}
            disabled={investing}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#fff',
              background: investing ? '#93c5fd' : '#1677ff',
              border: 'none',
              borderRadius: '4px',
              cursor: investing ? 'not-allowed' : 'pointer',
            }}
          >
            {investing ? 'Deploying...' : 'Deploy Strategy'}
          </button>
        </div>
      </div>
    </div>
  );
}

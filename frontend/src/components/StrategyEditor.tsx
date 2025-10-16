/**
 * Strategy Editor
 *
 * Loads a specific strategy by name from URL params and displays it in the Builder
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BuilderWrapper } from './BuilderWrapper';
import type { Strategy } from '../api/strategies';

type Props = {
  apiKey: string;
  apiSecret: string;
  onLoadStrategy: (strategy: Strategy) => void;
  strategyName?: string; // Optional: if provided, use this instead of URL param
  isModal?: boolean; // Whether this is being rendered in a modal
};

export function StrategyEditor({ apiKey, apiSecret, onLoadStrategy, strategyName: strategyNameProp, isModal = false }: Props) {
  const { strategyName: strategyNameParam } = useParams<{ strategyName: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use prop if provided, otherwise use URL param
  const strategyName = strategyNameProp || strategyNameParam;

  useEffect(() => {
    const loadStrategy = async () => {
      if (!strategyName) {
        setError('No strategy name provided');
        setLoading(false);
        return;
      }

      try {
        const { getAllStrategies } = await import('../api/strategies');
        const strategies = await getAllStrategies();

        // Decode the URL-encoded strategy name
        const decodedName = decodeURIComponent(strategyName);

        // Find the LIVE strategy with this name
        const found = strategies.find(s => s.name === decodedName && s.status === 'LIVE');

        if (found) {
          // Load the strategy into the builder
          localStorage.setItem('strategyToLoad', JSON.stringify({
            name: found.name,
            versioningEnabled: found.versioning_enabled,
            version: {
              major: found.version_major,
              minor: found.version_minor,
              patch: found.version_patch,
              fork: found.version_fork,
            },
            createdAt: found.created_at,
            updatedAt: found.updated_at,
            elements: found.elements,
          }));
          setLoading(false);
        } else {
          setError(`Strategy "${decodedName}" not found. It may not be saved or marked as LIVE.`);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Failed to load strategy:', err);
        setError(`Failed to load strategy: ${err.message}`);
        setLoading(false);
      }
    };

    loadStrategy();
  }, [strategyName]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 14, color: '#666' }}>
        Loading strategy...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#b00020', marginBottom: 12 }}>
          Error Loading Strategy
        </div>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
          {error}
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            background: '#1677ff',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <BuilderWrapper
      apiKey={apiKey}
      apiSecret={apiSecret}
      view="builder"
      onLoadStrategy={onLoadStrategy}
    />
  );
}

import { useEffect, useState } from 'react';
import type { BuildingProfile } from '../archonix';

export function useSupabaseBuildings() {
  const [buildings, setBuildings] = useState<BuildingProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchBuildings() {
      try {
        const response = await fetch('/api/buildings');
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error || `Building request failed (${response.status})`);
        }
        const data = await response.json() as BuildingProfile[];
        if (active) {
          setBuildings(data);
          setError(null);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown database error';
        console.error('Failed to fetch buildings from Neon:', message);
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchBuildings();

    return () => {
      active = false;
    };
  }, []);

  return { buildings, loading, error };
}
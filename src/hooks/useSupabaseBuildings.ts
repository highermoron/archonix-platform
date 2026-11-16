import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BuildingProfile } from '../archonix';

export function useSupabaseBuildings() {
  const [buildings, setBuildings] = useState<BuildingProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase));
  const [error, setError] = useState<string | null>(() =>
    supabase ? null : 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.'
  );

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let requestGeneration = 0;

    async function fetchBuildings(database: NonNullable<typeof supabase>, generation: number) {
      try {
        const { data, error } = await database
          .from('buildings')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (active && generation === requestGeneration) {
          setBuildings((data || []) as BuildingProfile[]);
          setError(null);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown Supabase error';
        console.error('Failed to fetch buildings from Supabase:', message);
        if (active && generation === requestGeneration) setError(message);
      } finally {
        if (active && generation === requestGeneration) setLoading(false);
      }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      requestGeneration += 1;
      if (!session) {
        setBuildings([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const generation = requestGeneration;
      window.setTimeout(() => void fetchBuildings(client, generation), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { buildings, loading, error };
}
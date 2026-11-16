import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export interface SupabaseBuilding {
  id: string;
  building_code: string;
  name: string;
  street_address: string;
  suburb: string;
  state: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'ACT' | 'TAS' | 'NT';
  postcode: string;
  latitude: number;
  longitude: number;
  construction_year: number;
  building_classification: string;
  floors_above_ground: number;
  floors_below_ground: number;
  primary_materials: string[];
  description: string;
  monitoring_status: 'active' | 'attention_required' | 'overdue' | 'archived';
  is_demo_data: boolean;
  created_at: string;
}

interface Database {
  public: {
    Tables: {
      buildings: {
        Row: SupabaseBuilding;
        Insert: Partial<SupabaseBuilding>;
        Update: Partial<SupabaseBuilding>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export function useSupabaseBuildings() {
  const [buildings, setBuildings] = useState<SupabaseBuilding[]>([]);
  const [loading, setLoading] = useState(Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY));
  const [error, setError] = useState<string | null>(() => {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) return null;
    return 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.';
  });

  useEffect(() => {
    let active = true;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) return;

    const supabase = createClient<Database>(url, anonKey);

    const fetchBuildings = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('buildings')
          .select('*')
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        if (active) {
          setBuildings(data);
          setError(null);
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Unknown Supabase error';
        console.error('Failed to fetch buildings from Supabase:', message);
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchBuildings();
    return () => {
      active = false;
    };
  }, []);

  return { buildings, loading, error };
}

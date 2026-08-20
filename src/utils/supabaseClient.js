import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function hasPlaceholder(value, placeholder) {
  return !value || value === placeholder || value.includes('your-project-id') || value.includes('your-anon-public-key');
}

export const isSupabaseConfigured =
  !hasPlaceholder(supabaseUrl, 'YOUR_SUPABASE_URL') &&
  !hasPlaceholder(supabaseAnonKey, 'YOUR_SUPABASE_ANON_KEY');

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function subscribeToTable({ table, filter, onChange }) {
  if (!supabase || !table || typeof onChange !== 'function') {
    return () => {};
  }

  const channelName = `fairplay-${table}-${Date.now()}`;
  const subscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(filter ? { filter } : {}),
      },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info('Supabase is not configured yet. The app will continue using local fallback data.');
}

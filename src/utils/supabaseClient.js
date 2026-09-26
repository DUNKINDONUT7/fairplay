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

// Every live subscription's refresh function. Realtime pushes call them as
// rows change; the live-sync loop below also calls them when the tab regains
// focus and every 30s, so data stays current even for a table that realtime
// is not enabled on, or after the socket silently drops.
const refreshers = new Set();

function debounce(fn, wait) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, wait);
  };
}

export function subscribeToTable({ table, filter, onChange }) {
  if (!supabase || !table || typeof onChange !== 'function') {
    return () => {};
  }

  // A burst of row changes (e.g. a bulk save) becomes one refetch.
  const refresh = debounce(() => onChange(), 300);
  refreshers.add(refresh);

  const channelName = `fairplay-${table}-${Math.random().toString(36).slice(2)}`;
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
      refresh
    )
    .subscribe();

  return () => {
    refreshers.delete(refresh);
    supabase.removeChannel(subscription);
  };
}

const LIVE_SYNC_INTERVAL_MS = 30000;
const MIN_GAP_MS = 5000;
let liveSyncStarted = false;
let lastSyncAt = 0;

function syncNow() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (Date.now() - lastSyncAt < MIN_GAP_MS) return;
  lastSyncAt = Date.now();
  refreshers.forEach((refresh) => refresh());
}

export function startLiveSync() {
  if (liveSyncStarted || typeof window === 'undefined' || !supabase) return;
  liveSyncStarted = true;
  window.addEventListener('focus', syncNow);
  document.addEventListener('visibilitychange', syncNow);
  window.addEventListener('online', syncNow);
  window.setInterval(syncNow, LIVE_SYNC_INTERVAL_MS);
}

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info('Supabase is not configured yet. The app will continue using local fallback data.');
}

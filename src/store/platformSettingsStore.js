import { create } from 'zustand';
import { isSupabaseConfigured, subscribeToTable, supabase } from '../utils/supabaseClient';

const DEFAULTS = {
  maintenanceEnabled: false,
  maintenanceMessage: '',
  maintenanceUntil: null,
  aiEnabled: true,
  updatedAt: null,
  updatedBy: null,
};

function mapRow(row) {
  if (!row) return { ...DEFAULTS };
  return {
    maintenanceEnabled: Boolean(row.maintenance_enabled),
    maintenanceMessage: row.maintenance_message || '',
    maintenanceUntil: row.maintenance_until || null,
    aiEnabled: row.ai_enabled !== false,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

function isMissingTableError(error) {
  const code = String(error?.code || '');
  return code === '42P01' || code === 'PGRST205';
}

let unsubscribeRealtime = null;

const usePlatformSettingsStore = create((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  setupNeeded: false,

  fetchSettings: async () => {
    if (!isSupabaseConfigured || !supabase) {
      set({ loaded: true });
      return;
    }
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      // Before the settings table exists the platform simply runs with the
      // defaults (no maintenance, AI on) rather than breaking.
      set({ ...DEFAULTS, loaded: true, setupNeeded: isMissingTableError(error) });
      return;
    }
    set({ ...mapRow(data), loaded: true, setupNeeded: false });
  },

  startSync: () => {
    const { fetchSettings } = get();
    fetchSettings();
    if (unsubscribeRealtime) return;
    unsubscribeRealtime = subscribeToTable({ table: 'platform_settings', onChange: () => fetchSettings() });
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', fetchSettings);
      window.setInterval(fetchSettings, 60000);
    }
  },

  saveSettings: async (updates, actorId) => {
    if (!supabase) throw new Error('FairPlay is not connected to Supabase.');
    const payload = {
      id: 1,
      ...(updates.maintenanceEnabled !== undefined ? { maintenance_enabled: updates.maintenanceEnabled } : {}),
      ...(updates.maintenanceMessage !== undefined ? { maintenance_message: updates.maintenanceMessage } : {}),
      ...(updates.maintenanceUntil !== undefined ? { maintenance_until: updates.maintenanceUntil } : {}),
      ...(updates.aiEnabled !== undefined ? { ai_enabled: updates.aiEnabled } : {}),
      updated_by: actorId || null,
    };
    const { data, error } = await supabase
      .from('platform_settings')
      .update(payload)
      .eq('id', 1)
      .select()
      .single();
    if (error) {
      if (isMissingTableError(error)) {
        set({ setupNeeded: true });
        throw new Error('Platform settings are not set up in the database yet.');
      }
      throw new Error(error.message || 'Unable to save platform settings.');
    }
    set({ ...mapRow(data), loaded: true, setupNeeded: false });
    return data;
  },
}));

export default usePlatformSettingsStore;

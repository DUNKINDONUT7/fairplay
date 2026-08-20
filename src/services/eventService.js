import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';

export async function fetchEvents(organizerId) {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    let query = supabase.from('events').select('*').order('updated_at', { ascending: false });
    if (organizerId) {
      query = query.eq('organizer_id', organizerId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchEvents error:', error.message);
    throw error;
  }
}

export async function fetchEventById(eventId) {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('fetchEventById error:', error.message);
    throw error;
  }
}

export async function upsertEvent(event) {
  if (!isSupabaseConfigured || !supabase) return event;
  try {
    const { data, error } = await supabase.from('events').upsert(event, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('upsertEvent error:', error.message);
    throw error;
  }
}

export async function fetchEventCategories() {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('event_categories').select('*').order('name');
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchEventCategories error:', error.message);
    throw error;
  }
}

export async function fetchEventLocations() {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('event_locations').select('*').order('name');
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchEventLocations error:', error.message);
    throw error;
  }
}

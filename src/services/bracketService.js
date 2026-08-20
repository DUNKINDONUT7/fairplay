import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';

export async function fetchBrackets(eventId) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    let query = supabase.from('brackets').select('*').order('updated_at', { ascending: false });
    if (eventId) query = query.eq('event_id', eventId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchBrackets error:', error.message);
    throw error;
  }
}

export async function fetchMatches(bracketId) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('matches').select('*').eq('bracket_id', bracketId).order('round_number', { ascending: true }).order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchMatches error:', error.message);
    throw error;
  }
}

export async function upsertMatch(match) {
  if (!isSupabaseConfigured || !supabase) return match;
  try {
    const { data, error } = await supabase.from('matches').upsert(match, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('upsertMatch error:', error.message);
    throw error;
  }
}

export async function fetchMatchParticipants(matchId) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('match_participants').select('*').eq('match_id', matchId);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchMatchParticipants error:', error.message);
    throw error;
  }
}

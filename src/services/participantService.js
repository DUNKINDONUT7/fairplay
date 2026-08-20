import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';

function normalizeTeam(team) {
  return {
    id: team.id,
    eventId: team.event_id,
    name: team.name,
    members: Array.isArray(team.members) ? team.members : team.members || [],
    coachName: team.coach_name || team.coachName || '',
    schoolName: team.school_name || team.schoolName || '',
    division: team.division || '',
    status: team.status || 'active',
    createdAt: team.created_at || team.createdAt || new Date().toISOString(),
    updatedAt: team.updated_at || team.updatedAt || new Date().toISOString(),
  };
}

function normalizeSoloParticipant(participant) {
  return {
    id: participant.id,
    eventId: participant.event_id,
    name: participant.name,
    email: participant.email,
    status: participant.status || 'active',
    category: participant.category || 'solo',
    createdAt: participant.created_at || participant.createdAt || new Date().toISOString(),
    updatedAt: participant.updated_at || participant.updatedAt || new Date().toISOString(),
    metadata: participant.metadata || {},
  };
}

export async function fetchTeams(eventId) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    let query = supabase.from('teams').select('*').order('updated_at', { ascending: false });
    if (eventId) query = query.eq('event_id', eventId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeTeam);
  } catch (error) {
    console.error('fetchTeams error:', error.message);
    throw error;
  }
}

export async function fetchTeamMembers(teamId) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('team_members').select('*').eq('team_id', teamId).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchTeamMembers error:', error.message);
    throw error;
  }
}

export async function upsertTeam(team) {
  if (!isSupabaseConfigured || !supabase) return team;
  try {
    const { data, error } = await supabase.from('teams').upsert(team, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return normalizeTeam(data);
  } catch (error) {
    console.error('upsertTeam error:', error.message);
    throw error;
  }
}

export async function deleteTeam(teamId) {
  if (!isSupabaseConfigured || !supabase) return true;
  try {
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('deleteTeam error:', error.message);
    throw error;
  }
}

export async function fetchSoloParticipants(eventId) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    let query = supabase.from('solo_participants').select('*').order('updated_at', { ascending: false });
    if (eventId) query = query.eq('event_id', eventId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeSoloParticipant);
  } catch (error) {
    console.error('fetchSoloParticipants error:', error.message);
    throw error;
  }
}

export async function upsertSoloParticipant(participant) {
  if (!isSupabaseConfigured || !supabase) return participant;
  try {
    const { data, error } = await supabase.from('solo_participants').upsert(participant, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return normalizeSoloParticipant(data);
  } catch (error) {
    console.error('upsertSoloParticipant error:', error.message);
    throw error;
  }
}

export async function deleteSoloParticipant(participantId) {
  if (!isSupabaseConfigured || !supabase) return true;
  try {
    const { error } = await supabase.from('solo_participants').delete().eq('id', participantId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('deleteSoloParticipant error:', error.message);
    throw error;
  }
}

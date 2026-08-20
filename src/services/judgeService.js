import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';

export async function fetchJudges() {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('judges').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchJudges error:', error.message);
    throw error;
  }
}

export async function fetchJudgeAssignments() {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('judge_assignments').select('*').order('assigned_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchJudgeAssignments error:', error.message);
    throw error;
  }
}

export async function fetchJudgeStatusLogs() {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('judge_status_logs').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchJudgeStatusLogs error:', error.message);
    throw error;
  }
}

export async function upsertJudge(judge) {
  if (!isSupabaseConfigured || !supabase) return judge;
  try {
    const { data, error } = await supabase.from('judges').upsert(judge, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('upsertJudge error:', error.message);
    throw error;
  }
}

export async function assignJudge(assignment) {
  if (!isSupabaseConfigured || !supabase) return assignment;
  try {
    const payload = {
      id: `${assignment.judge_id}_${assignment.event_id}`,
      ...assignment,
    };
    const { data, error } = await supabase.from('judge_assignments').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('assignJudge error:', error.message);
    throw error;
  }


export async function logJudgeStatus(statusLog) {
  if (!isSupabaseConfigured || !supabase) return statusLog;
  try {
    const { data, error } = await supabase.from('judge_status_logs').insert(statusLog).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('logJudgeStatus error:', error.message);
    throw error;
  }
}

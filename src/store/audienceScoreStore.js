import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, subscribeToTable, supabase } from '../utils/supabaseClient';

const AUDIENCE_METADATA_KEY = 'audienceScores';

function submissionKey(eventId, contestantId, voterKey) {
  return `${eventId}_${contestantId}_${voterKey}`;
}

function isAudienceScoreTableMissing(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return (
    code === 'pgrst205' ||
    message.includes('schema cache') ||
    message.includes('audience_scores') && (
      message.includes('could not find the table') ||
      message.includes('does not exist') ||
      message.includes('not found')
    )
  );
}

function normalizeAudienceSubmission(row = {}) {
  const eventId = row.eventId || row.event_id;
  const contestantId = row.contestantId || row.contestant_id;
  const voterKey = row.voterKey || row.voter_key || '';

  return {
    id: String(row.id || submissionKey(eventId, contestantId, voterKey)),
    eventId,
    contestantId,
    contestantName: row.contestantName || row.contestant_name || '',
    voterKey,
    score: Number(row.score || 0),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

function normalizeAudienceList(rows = []) {
  const incoming = {};
  (Array.isArray(rows) ? rows : []).map(normalizeAudienceSubmission).forEach((submission) => {
    incoming[submission.id] = submission;
  });
  return incoming;
}

async function fetchMetadataAudienceScores(eventId) {
  if (!eventId || !supabase) return [];

  const { data, error } = await supabase
    .from('events')
    .select('metadata')
    .eq('id', eventId)
    .single();

  if (error) throw error;

  const metadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return Array.isArray(metadata[AUDIENCE_METADATA_KEY]) ? metadata[AUDIENCE_METADATA_KEY] : [];
}

async function saveMetadataAudienceScore(eventId, submission) {
  if (!eventId || !supabase) return submission;

  const { data, error: fetchError } = await supabase
    .from('events')
    .select('metadata')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;

  const metadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const existingRows = Array.isArray(metadata[AUDIENCE_METADATA_KEY]) ? metadata[AUDIENCE_METADATA_KEY] : [];
  const existing = existingRows.map(normalizeAudienceSubmission);

  if (existing.some((row) => row.id === submission.id || (
    String(row.eventId) === String(submission.eventId) &&
    String(row.contestantId) === String(submission.contestantId) &&
    String(row.voterKey) === String(submission.voterKey)
  ))) {
    throw new Error('This device/session already submitted an audience score for this participant.');
  }

  const nextMetadata = {
    ...metadata,
    [AUDIENCE_METADATA_KEY]: [
      ...existingRows,
      {
        id: submission.id,
        eventId: submission.eventId,
        contestantId: submission.contestantId,
        contestantName: submission.contestantName,
        voterKey: submission.voterKey,
        score: submission.score,
        createdAt: submission.createdAt,
      },
    ],
  };

  const { error: updateError } = await supabase
    .from('events')
    .update({ metadata: nextMetadata })
    .eq('id', eventId);

  if (updateError) throw updateError;
  return submission;
}

const useAudienceScoreStore = create(
  persist(
    (set, get) => ({
      submissions: {},
      loading: false,
      error: null,

      fetchAudienceScores: async (eventId, options = {}) => {
        const { silent = false } = options;
        if (!silent) set({ loading: true, error: null });

        if (!isSupabaseConfigured || !supabase) {
          if (!silent) set({ loading: false });
          return eventId ? get().getSubmissionsForEvent(eventId) : Object.values(get().submissions);
        }

        try {
          let query = supabase.from('audience_scores').select('*').order('created_at', { ascending: false });
          if (eventId) query = query.eq('event_id', eventId);

          const { data, error } = await query;
          if (error) throw error;

          const incoming = normalizeAudienceList(data || []);

          set((state) => ({
            submissions: { ...state.submissions, ...incoming },
            loading: false,
            error: null,
          }));

          return eventId ? get().getSubmissionsForEvent(eventId) : Object.values(get().submissions);
        } catch (error) {
          if (eventId && isAudienceScoreTableMissing(error)) {
            try {
              const fallbackRows = await fetchMetadataAudienceScores(eventId);
              const incoming = normalizeAudienceList(fallbackRows);

              set((state) => ({
                submissions: { ...state.submissions, ...incoming },
                loading: false,
                error: null,
              }));

              return get().getSubmissionsForEvent(eventId);
            } catch (fallbackError) {
              set({ loading: false, error: fallbackError?.message || 'Unable to load audience scores.' });
              return get().getSubmissionsForEvent(eventId);
            }
          }

          set({ loading: false, error: silent ? null : error?.message || 'Unable to load audience scores.' });
          return eventId ? get().getSubmissionsForEvent(eventId) : Object.values(get().submissions);
        }
      },

      subscribeToAudienceScores: (eventId) => {
        if (!eventId || !isSupabaseConfigured || !supabase) {
          return () => {};
        }

        let active = true;
        let refreshTimer = null;
        const refresh = () => {
          if (!active) return;
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => {
            get().fetchAudienceScores(eventId, { silent: true });
          }, 150);
        };

        const unsubscribeAudienceScores = subscribeToTable({
          table: 'audience_scores',
          filter: `event_id=eq.${eventId}`,
          onChange: refresh,
        });

        const unsubscribeEvents = subscribeToTable({
          table: 'events',
          filter: `id=eq.${eventId}`,
          onChange: refresh,
        });

        const pollId = window.setInterval(() => {
          get().fetchAudienceScores(eventId, { silent: true });
        }, 3000);

        get().fetchAudienceScores(eventId, { silent: true });

        return () => {
          active = false;
          window.clearTimeout(refreshTimer);
          window.clearInterval(pollId);
          unsubscribeAudienceScores();
          unsubscribeEvents();
        };
      },

      submitAudienceScore: async ({ eventId, contestantId, contestantName, voterKey, score }) => {
        const normalizedScore = Number(score);
        if (!eventId || !contestantId || !voterKey || !Number.isFinite(normalizedScore) || normalizedScore < 1 || normalizedScore > 10) {
          throw new Error('Please select a participant and enter a valid score from 1 to 10.');
        }

        const id = submissionKey(eventId, contestantId, voterKey);
        if (get().submissions[id]) {
          throw new Error('This device/session already submitted an audience score for this participant.');
        }

        const nextSubmission = normalizeAudienceSubmission({
          id,
          eventId,
          contestantId,
          contestantName,
          voterKey,
          score: normalizedScore,
          createdAt: new Date().toISOString(),
        });

        set((state) => ({
          submissions: {
            ...state.submissions,
            [id]: nextSubmission,
          },
        }));

        if (!isSupabaseConfigured || !supabase) {
          return nextSubmission;
        }

        const payload = {
          id,
          event_id: eventId,
          contestant_id: String(contestantId),
          contestant_name: contestantName || '',
          voter_key: voterKey,
          score: normalizedScore,
          created_at: nextSubmission.createdAt,
        };

        const { data, error } = await supabase
          .from('audience_scores')
          .insert([payload])
          .select()
          .single();

        if (error) {
          if (isAudienceScoreTableMissing(error)) {
            const saved = await saveMetadataAudienceScore(eventId, nextSubmission);
            set((state) => ({ submissions: { ...state.submissions, [saved.id]: saved } }));
            return saved;
          }

          set((state) => {
            const { [id]: _removed, ...submissions } = state.submissions;
            return { submissions };
          });

          if (String(error.message || '').toLowerCase().includes('duplicate')) {
            throw new Error('This device/session already submitted an audience score for this participant.');
          }
          throw error;
        }

        const saved = normalizeAudienceSubmission(data || nextSubmission);
        set((state) => ({ submissions: { ...state.submissions, [saved.id]: saved } }));
        return saved;
      },

      getSubmissionsForEvent: (eventId) =>
        Object.values(get().submissions).filter((submission) => String(submission.eventId) === String(eventId)),

      getAudienceSummary: (eventId) => {
        const rows = get().getSubmissionsForEvent(eventId);
        const byContestant = {};

        rows.forEach((row) => {
          const key = String(row.contestantId);
          if (!byContestant[key]) {
            byContestant[key] = {
              contestantId: row.contestantId,
              contestantName: row.contestantName || `Participant ${row.contestantId}`,
              total: 0,
              count: 0,
              averageScore: 0,
            };
          }
          byContestant[key].total += Number(row.score || 0);
          byContestant[key].count += 1;
        });

        Object.values(byContestant).forEach((entry) => {
          entry.averageScore = entry.count > 0 ? Math.round((entry.total / entry.count) * 100) / 100 : 0;
        });

        return {
          totalSubmissions: rows.length,
          byContestant,
          rows,
        };
      },
    }),
    {
      name: 'fairplay_audience_scores',
      partialize: (state) => ({ submissions: state.submissions }),
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return { ...currentState, ...(persistedState || {}), submissions: currentState.submissions };
        }
        return { ...currentState, ...(persistedState || {}) };
      },
    }
  )
);

export default useAudienceScoreStore;

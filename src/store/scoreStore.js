import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import useEventStore from './eventStore';
import useNotificationStore from './notificationStore';
import useAudienceScoreStore from './audienceScoreStore';

function scoreKey(eventId, judgeId, contestantId) {
  return `${eventId}_${judgeId}_${contestantId}`;
}

function normalizeScore(score) {
  const eventId = score.eventId || score.event_id;
  const contestantId = score.contestantId || score.contestant_id;
  // Reconstruct judgeId from composite id key (format: eventId_judgeId_contestantId)
  // This handles cases where judge_id column is bigint and couldn't store email
  let judgeId = score.judgeId || score.judge_id;
  if (!judgeId && score.id && String(score.id).includes('_')) {
    const parts = String(score.id).split('_');
    // id = eventId_judgeId_contestantId — judgeId is the middle part(s)
    if (parts.length >= 3) {
      judgeId = parts.slice(1, -1).join('_');
    }
  }

  return {
    id: String(score.id || scoreKey(eventId, judgeId, contestantId)),
    eventId,
    judgeId,
    contestantId,
    criteriaScores: score.criteriaScores || score.criteria_scores || {},
    comments: score.comments || score.criteria_comments || {},
    remarks: score.remarks || '',
    contestantName: score.contestantName || score.contestant_name || `Contestant ${contestantId}`,
    eventTitle: score.eventTitle || score.event_title || 'Untitled Event',
    judgeName: score.judgeName || score.judge_name || 'Judge',
    timestamp: score.timestamp || score.updated_at || score.created_at || new Date().toISOString(),
    locked: Boolean(score.locked),
    lockedAt: score.lockedAt || score.locked_at || null,
  };
}

function findScoreEvent(eventId) {
  return useEventStore.getState().getEventById(eventId) ||
    useEventStore.getState().events.find((event) => String(event.id) === String(eventId)) ||
    null;
}

const useScoreStore = create(
  persist(
    (set, get) => ({
      scores: {},
      leaderboard: {},
      loading: false,
      error: null,

      fetchScores: async (eventId) => {
        set({ loading: true, error: null });

        if (!isSupabaseConfigured) {
          set({ loading: false });
          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        }

        try {
          let query = supabase.from('scores').select('*').order('updated_at', { ascending: false });
          if (eventId) {
            query = query.eq('event_id', eventId);
          }

          const { data, error } = await query;
          if (error) throw error;

          // Merge Supabase results into local store — never wipe local-only scores.
          // Supabase wins on conflicts (same key), but scores that only exist locally are kept.
          if (data && data.length > 0) {
            const incoming = {};
            data.map(normalizeScore).forEach((score) => {
              incoming[scoreKey(score.eventId, score.judgeId, score.contestantId)] = score;
            });
            set((state) => ({ scores: { ...state.scores, ...incoming }, loading: false, error: null }));
          } else {
            set({ loading: false, error: null });
          }

          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        } catch (error) {
          console.error('Error fetching scores:', error.message);
          // Keep local scores intact on fetch failure
          set({ loading: false, error: error.message });
          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        }
      },

      submitScore: async (eventId, judgeId, contestantId, criteriaScores, metadata = {}) => {
        const key = scoreKey(eventId, judgeId, contestantId);
        const nextScore = normalizeScore({
          id: key,
          eventId,
          judgeId,
          contestantId,
          criteriaScores,
          comments: metadata.comments || {},
          remarks: metadata.remarks || '',
          contestantName: metadata.contestantName,
          eventTitle: metadata.eventTitle,
          judgeName: metadata.judgeName,
          timestamp: new Date().toISOString(),
          locked: false,
        });

        set((state) => ({
          scores: {
            ...state.scores,
            [key]: nextScore,
          },
        }));

        if (!isSupabaseConfigured) {
          await useNotificationStore.getState().notifyScoreSubmitted(nextScore, findScoreEvent(eventId), 'submitted');
          return nextScore;
        }

        try {
          const payload = {
            id: nextScore.id,
            event_id: nextScore.eventId,
            // judge_id omitted — column is bigint in DB, use judge_name + id key instead
            contestant_id: String(nextScore.contestantId),
            contestant_name: nextScore.contestantName,
            event_title: nextScore.eventTitle,
            judge_name: nextScore.judgeName,
            criteria_scores: nextScore.criteriaScores,
            remarks: nextScore.remarks || '',
            // locked intentionally omitted — resubmitting must never reset an
            // existing lock, and the DB trigger rejects the write outright if
            // the row is already locked anyway.
            updated_at: nextScore.timestamp,
          };

          const { data, error } = await supabase
            .from('scores')
            .upsert([payload])
            .select()
            .single();
          if (error) throw error;

          const normalized = normalizeScore(data || nextScore);
          set((state) => ({ scores: { ...state.scores, [key]: normalized } }));
          await useNotificationStore.getState().notifyScoreSubmitted(normalized, findScoreEvent(eventId), 'submitted');
          return normalized;
        } catch (error) {
          console.error('Error submitting score:', error.message);
          set({ error: error.message });
          await useNotificationStore.getState().notifyScoreSubmitted(nextScore, findScoreEvent(eventId), 'submitted');
          return nextScore;
        }
      },

      updateScore: async (eventId, judgeId, contestantId, criteriaScores, metadata = {}) => {
        const key = scoreKey(eventId, judgeId, contestantId);
        const existing = get().scores[key];
        if (existing?.locked) return false;

        const nextScore = normalizeScore({
          ...existing,
          eventId,
          judgeId,
          contestantId,
          criteriaScores,
          comments: metadata.comments || existing?.comments || {},
          remarks: metadata.remarks || existing?.remarks || '',
          contestantName: metadata.contestantName || existing?.contestantName,
          eventTitle: metadata.eventTitle || existing?.eventTitle,
          judgeName: metadata.judgeName || existing?.judgeName,
          timestamp: new Date().toISOString(),
          locked: existing?.locked || false,
          lockedAt: existing?.lockedAt || null,
        });

        set((state) => ({
          scores: {
            ...state.scores,
            [key]: nextScore,
          },
        }));

        if (!isSupabaseConfigured) {
          await useNotificationStore.getState().notifyScoreSubmitted(nextScore, findScoreEvent(eventId), 'updated');
          return true;
        }

        try {
          const payload = {
            id: nextScore.id,
            event_id: nextScore.eventId,
            // judge_id omitted — column is bigint in DB, use judge_name + id key instead
            contestant_id: String(nextScore.contestantId),
            contestant_name: nextScore.contestantName,
            event_title: nextScore.eventTitle,
            judge_name: nextScore.judgeName,
            criteria_scores: nextScore.criteriaScores,
            remarks: nextScore.remarks || '',
            locked: nextScore.locked || false,
            updated_at: nextScore.timestamp,
          };

          const { error } = await supabase.from('scores').upsert([payload]);
          if (error) throw error;
          await useNotificationStore.getState().notifyScoreSubmitted(nextScore, findScoreEvent(eventId), 'updated');
        } catch (error) {
          console.error('Error updating score:', error.message);
          set({ error: error.message });
        }

        return true;
      },

      lockScore: async (eventId, judgeId, contestantId) => {
        const key = scoreKey(eventId, judgeId, contestantId);
        const nextScore = {
          ...get().scores[key],
          locked: true,
          lockedAt: new Date().toISOString(),
        };

        set((state) => ({
          scores: {
            ...state.scores,
            [key]: nextScore,
          },
        }));

        if (!isSupabaseConfigured) {
          return nextScore;
        }

        try {
          const { error } = await supabase
            .from('scores')
            .update({ locked: true, locked_at: nextScore.lockedAt })
            .eq('id', nextScore.id);
          if (error) throw error;
        } catch (error) {
          console.error('Error locking score:', error.message);
          set({ error: error.message });
        }

        return nextScore;
      },

      getScoresForEvent: (eventId) => {
        const allScores = get().scores;
        return Object.values(allScores).filter((score) => String(score.eventId) === String(eventId));
      },

      getLiveFeed: (eventId, criteria = []) => {
        return get()
          .getScoresForEvent(eventId)
          .map((entry) => {
            const { totalScore } = get().calculateWeightedTotal(criteria, entry.criteriaScores || {});
            return {
              ...entry,
              totalScore,
            };
          })
          .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
      },

      getScoresByJudge: (eventId, judgeId) => {
        const allScores = get().scores;
        return Object.values(allScores).filter(
          (score) => String(score.eventId) === String(eventId) && String(score.judgeId) === String(judgeId)
        );
      },

      calculateWeightedTotal: (criteria, scores) => {
        const totalWeight = criteria.reduce((sum, criterion) => sum + (criterion.weight || 0), 0) || 100;
        const breakdown = criteria.map((criterion) => {
          const score = Number(scores[criterion.id] ?? scores[criterion.name] ?? 0);
          const weighted = (score * (criterion.weight || 0)) / totalWeight;
          return { id: criterion.id, name: criterion.name, score, weight: criterion.weight, weighted };
        });
        const totalScore =
          Math.round(breakdown.reduce((sum, item) => sum + item.weighted, 0) * 100) / 100;
        return { totalScore, breakdown };
      },

      calculateLeaderboard: (eventId, criteria) => {
        const eventScores = get().getScoresForEvent(eventId);
        const event = findScoreEvent(eventId);
        const audienceSummary = useAudienceScoreStore.getState().getAudienceSummary(eventId);
        const audienceEnabled = Boolean(event?.audienceImpactEnabled ?? event?.audienceImpact);
        const audienceWeight = audienceEnabled ? Math.min(Math.max(Number(event?.audienceImpactWeight || 10), 0), 100) : 0;
        const judgeWeight = audienceEnabled ? 100 - audienceWeight : 100;
        const contestantScores = {};

        eventScores.forEach((score) => {
          if (!contestantScores[score.contestantId]) {
            contestantScores[score.contestantId] = {
              total: 0,
              count: 0,
              scores: [],
              contestantName: score.contestantName || `Contestant ${score.contestantId}`,
            };
          }
          const result = get().calculateWeightedTotal(criteria, score.criteriaScores);
          contestantScores[score.contestantId].total += result.totalScore;
          contestantScores[score.contestantId].count += 1;
          contestantScores[score.contestantId].scores.push(result);
        });

        Object.entries(audienceSummary.byContestant || {}).forEach(([id, audience]) => {
          if (!contestantScores[id]) {
            contestantScores[id] = {
              total: 0,
              count: 0,
              scores: [],
              contestantName: audience.contestantName || `Contestant ${id}`,
            };
          }
        });

        return Object.entries(contestantScores)
          .map(([id, data]) => {
            const judgeAverage = data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0;
            const audience = audienceSummary.byContestant?.[id] || null;
            const audienceAverage = audience?.averageScore || 0;
            const finalScore = audienceEnabled
              ? Math.round(((judgeAverage * judgeWeight) + (audienceAverage * audienceWeight)) * 100) / 10000
              : judgeAverage;

            return {
            contestantId: id,
            contestantName: data.contestantName,
            averageScore: finalScore,
            judgeAverage,
            audienceAverage,
            audienceSubmissions: audience?.count || 0,
            audienceWeight,
            judgeWeight,
            totalScores: data.count,
          };
          })
          .sort((left, right) => right.averageScore - left.averageScore)
          .map((item, index) => ({ ...item, rank: index + 1 }));
      },

      finalizeEventScores: async (eventId) => {
        const scoresForEvent = get().getScoresForEvent(eventId);
        for (const score of scoresForEvent) {
          await get().lockScore(score.eventId, score.judgeId, score.contestantId);
        }
        return scoresForEvent.length;
      },

      getScoreByKey: (eventId, judgeId, contestantId) => {
        const key = scoreKey(eventId, judgeId, contestantId);
        return get().scores[key] || null;
      },
    }),
    {
      name: 'fairplay_scores',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            scores: currentState.scores,
            leaderboard: currentState.leaderboard,
          };
        }

        return {
          ...currentState,
          ...(persistedState || {}),
        };
      },
    }
  )
);

export default useScoreStore;

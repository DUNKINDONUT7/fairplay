import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, subscribeToTable, supabase } from '../utils/supabaseClient';
import { bindDataCacheReset } from '../utils/dataCache';
import useEventStore from './eventStore';
import useNotificationStore from './notificationStore';
import useAudienceScoreStore from './audienceScoreStore';
import { getCurrentRoundKey, isCurrentRoundScore } from '../utils/rounds';

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
    // Which round of a multi-round contest this score was given in.
    roundName: score.roundName || score.round_name || '',
  };
}

// The event roster is the authority on a contestant's name. Score rows carry
// a copy, but older rows were saved without one and fall back to
// "Contestant <id>".
function resolveContestantName(event, contestantId, fallback) {
  const contestant = (event?.contestants || []).find((entry) => String(entry.id) === String(contestantId));
  return contestant?.name || fallback || `Contestant ${contestantId}`;
}

function findScoreEvent(eventId) {
  return useEventStore.getState().getEventById(eventId) ||
    useEventStore.getState().events.find((event) => String(event.id) === String(eventId)) ||
    null;
}

let scoresRealtimeBound = false;
let scoresRealtimeEventId = null;

function ensureScoresRealtime(eventId) {
  if (!isSupabaseConfigured || !supabase || scoresRealtimeBound) {
    scoresRealtimeEventId = eventId;
    return;
  }

  scoresRealtimeEventId = eventId;
  scoresRealtimeBound = true;

  subscribeToTable({
    table: 'scores',
    onChange: () => {
      const state = useScoreStore.getState();
      if (typeof state.fetchScores === 'function') {
        state.fetchScores(scoresRealtimeEventId, { silent: true });
      }
    },
  });
}

const useScoreStore = create(
  persist(
    (set, get) => ({
      scores: {},
      leaderboard: {},
      loading: false,
      error: null,

      fetchScores: async (eventId, options = {}) => {
        const { silent = false } = options;
        if (!silent && Object.keys(get().scores).length === 0) {
          set({ loading: true, error: null });
        }

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
          ensureScoresRealtime(eventId);

          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        } catch (error) {
          console.error('Error fetching scores:', error.message);
          // Keep local scores intact on fetch failure
          if (!silent) {
            set({ loading: false, error: error.message });
          }
          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        }
      },

      submitScore: async (eventId, judgeId, contestantId, criteriaScores, metadata = {}) => {
        const key = scoreKey(eventId, judgeId, contestantId);
        const roundName = getCurrentRoundKey(findScoreEvent(eventId));
        const nextScore = normalizeScore({
          roundName,
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
            round_name: nextScore.roundName || null,
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
        const stored = get().scores[key];
        if (stored?.locked) return false;
        // A score left over from an earlier round is replaced, not edited:
        // its remarks and comments don't carry into the new round.
        const scoreEvent = findScoreEvent(eventId);
        const existing = stored && isCurrentRoundScore(stored, scoreEvent) ? stored : null;

        const nextScore = normalizeScore({
          ...existing,
          id: stored?.id,
          roundName: getCurrentRoundKey(scoreEvent),
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
            round_name: nextScore.roundName || null,
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

      // The current round's scores — what judges are working on and what the
      // leaderboard ranks. For a single-round event that is simply all of them.
      getScoresForEvent: (eventId) => {
        const event = findScoreEvent(eventId);
        return get().getAllScoresForEvent(eventId).filter((score) => isCurrentRoundScore(score, event));
      },

      // Every score row for the event, whichever round it is from.
      getAllScoresForEvent: (eventId) => {
        const allScores = get().scores;
        return Object.values(allScores).filter((score) => String(score.eventId) === String(eventId));
      },

      getLiveFeed: (eventId, criteria = []) => {
        const event = findScoreEvent(eventId);
        return get()
          .getScoresForEvent(eventId)
          .map((entry) => {
            const { totalScore } = get().calculateWeightedTotal(criteria, entry.criteriaScores || {});
            return {
              ...entry,
              contestantName: resolveContestantName(event, entry.contestantId, entry.contestantName),
              totalScore,
            };
          })
          .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
      },

      getScoresByJudge: (eventId, judgeId) => {
        return get().getScoresForEvent(eventId).filter((score) => String(score.judgeId) === String(judgeId));
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
              contestantName: resolveContestantName(event, score.contestantId, score.contestantName),
            };
          }
          const result = get().calculateWeightedTotal(criteria, score.criteriaScores);
          contestantScores[score.contestantId].total += result.totalScore;
          contestantScores[score.contestantId].count += 1;
          contestantScores[score.contestantId].scores.push(result);
        });

        const cutEarlier = new Set(
          (Array.isArray(event?.roundResults) ? event.roundResults : [])
            .flatMap((round) => (round.standings || []).filter((row) => !row.advanced).map((row) => String(row.contestantId)))
        );
        Object.entries(audienceSummary.byContestant || {}).forEach(([id, audience]) => {
          if (cutEarlier.has(String(id))) return;
          if (!contestantScores[id]) {
            contestantScores[id] = {
              total: 0,
              count: 0,
              scores: [],
              contestantName: resolveContestantName(event, id, audience.contestantName),
            };
          }
        });

        const rubricWeight = (criteria || []).reduce((sum, criterion) => sum + (criterion.weight || 0), 0) || 100;
        const rubricMax = (criteria || []).reduce((sum, criterion) => {
          const numbers = String(criterion.scoringRange || '1-10').match(/d+(.d+)?/g) || [];
          return sum + ((Number(numbers[numbers.length - 1]) || 10) * (criterion.weight || 0)) / rubricWeight;
        }, 0) || 10;
        const audienceScale = rubricMax / 10;

        const ranked = Object.entries(contestantScores)
          .map(([id, data]) => {
            const judgeAverage = data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0;
            const audience = audienceSummary.byContestant?.[id] || null;
            const audienceAverage = audience?.averageScore || 0;
            // Audience votes are always 1-10. On a longer scale (say 100
            // points) they are stretched to that scale first, or their share
            // of the final score would be ten times too small. On the default
            // 10-point scale this changes nothing.
            const finalScore = audienceEnabled
              ? Math.round(((judgeAverage * judgeWeight) + (audienceAverage * audienceScale * audienceWeight)) * 100) / 10000
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

        // Multi-round contests: whoever was cut in an earlier round still has a
        // place in the final order — below everyone who went further, in the
        // order they finished the round they went out in.
        const placed = new Set(ranked.map((item) => String(item.contestantId)));
        const roundResults = Array.isArray(event?.roundResults) ? event.roundResults : [];
        [...roundResults].reverse().forEach((round) => {
          (round.standings || [])
            .filter((row) => !row.advanced && !placed.has(String(row.contestantId)))
            .sort((left, right) => right.score - left.score)
            .forEach((row) => {
              placed.add(String(row.contestantId));
              ranked.push({
                contestantId: String(row.contestantId),
                contestantName: resolveContestantName(event, row.contestantId, row.name),
                averageScore: row.score,
                judgeAverage: row.score,
                audienceAverage: 0,
                audienceSubmissions: 0,
                audienceWeight,
                judgeWeight,
                totalScores: row.submissions || 0,
                eliminatedIn: round.name,
                rank: ranked.length + 1,
              });
            });
        });

        return ranked;
      },

      finalizeEventScores: async (eventId) => {
        const scoresForEvent = get().getAllScoresForEvent(eventId);
        if (scoresForEvent.length === 0) return 0;

        const lockedAt = new Date().toISOString();
        const ids = scoresForEvent.map((score) => score.id);

        set((state) => {
          const nextScores = { ...state.scores };
          scoresForEvent.forEach((score) => {
            const key = scoreKey(score.eventId, score.judgeId, score.contestantId);
            nextScores[key] = { ...nextScores[key], locked: true, lockedAt };
          });
          return { scores: nextScores };
        });

        if (isSupabaseConfigured) {
          try {
            // One batched update instead of N sequential lockScore() calls —
            // finalizing an event can mean hundreds of scores, and awaiting
            // them one at a time serializes what should be a single round trip.
            const { error } = await supabase
              .from('scores')
              .update({ locked: true, locked_at: lockedAt })
              .in('id', ids);
            if (error) throw error;
          } catch (error) {
            console.error('Error finalizing event scores:', error.message);
            set({ error: error.message });
          }
        }

        return scoresForEvent.length;
      },

      getScoreByKey: (eventId, judgeId, contestantId) => {
        const key = scoreKey(eventId, judgeId, contestantId);
        const score = get().scores[key] || null;
        // A score from an earlier round is not "this judge's score" any more:
        // the judge starts the new round with a blank sheet.
        return score && isCurrentRoundScore(score, findScoreEvent(eventId)) ? score : null;
      },
    }),
    {
      name: 'fairplay_scores',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            loading: false,
            error: null,
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

bindDataCacheReset(useScoreStore, ['scores', 'leaderboard']);

export default useScoreStore;

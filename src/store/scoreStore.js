import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, subscribeToTable, supabase } from '../utils/supabaseClient';
import { bindDataCacheReset } from '../utils/dataCache';
import useEventStore from './eventStore';
import useNotificationStore from './notificationStore';
import useAudienceScoreStore from './audienceScoreStore';
import { getCurrentRoundKey, isCurrentRoundScore } from '../utils/rounds';
import { computeEventResults, roundHalfAway, sheetTotal } from '../utils/scoreComputation';
import { rpcOrThrow } from '../utils/rpc';

function scoreKey(eventId, judgeId, contestantId) {
  return `${eventId}_${judgeId}_${contestantId}`;
}

function normalizeScore(score) {
  const eventId = score.eventId || score.event_id;
  const contestantId = score.contestantId || score.contestant_id;
  // Reconstruct judgeId from composite id key (format: eventId_judgeId_contestantId)
  // for rows saved before judge_id was always filled in.
  let judgeId = score.judgeId || score.judge_id;
  if (!judgeId && score.id && String(score.id).includes('_')) {
    const parts = String(score.id).split('__')[0].split('_');
    if (parts.length >= 3) {
      judgeId = parts.slice(1, -1).join('_');
    }
  }

  return {
    id: String(score.id || scoreKey(eventId, judgeId, contestantId)),
    eventId,
    judgeId,
    // The judging seat (see scoreComputation.js); older rows have none and
    // count as one seat per judge.
    seatId: score.seatId || score.seat_id || judgeId || null,
    staffId: score.staffId || score.staff_id || null,
    voided: Boolean(score.voided),
    voidedReason: score.voidedReason || score.voided_reason || '',
    rubricVersion: score.rubricVersion ?? score.rubric_version ?? null,
    contestantId,
    criteriaScores: score.criteriaScores || score.criteria_scores || {},
    comments: score.comments || score.criteria_comments || {},
    remarks: score.remarks || '',
    contestantName: score.contestantName || score.contestant_name || `Contestant ${contestantId}`,
    eventTitle: score.eventTitle || score.event_title || 'Untitled Event',
    judgeName: score.judgeName || score.judge_name || 'Judge',
    totalScore: Number(score.totalScore ?? score.total_score ?? 0),
    timestamp: score.timestamp || score.updated_at || score.created_at || new Date().toISOString(),
    submittedAt: score.submittedAt || score.submitted_at || null,
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
      // Keyed by the database row id (one row per judge, contestant and round).
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

          // The database is the record: every write goes through it, so what
          // it returns replaces what was cached for that event (or for all).
          const incoming = {};
          (data || []).map(normalizeScore).forEach((score) => {
            incoming[score.id] = score;
          });
          set((state) => {
            const kept = eventId
              ? Object.fromEntries(Object.entries(state.scores).filter(([, score]) => String(score.eventId) !== String(eventId)))
              : {};
            return { scores: { ...kept, ...incoming }, loading: false, error: null };
          });
          ensureScoresRealtime(eventId);

          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        } catch (error) {
          console.error('Error fetching scores:', error.message);
          if (!silent) {
            set({ loading: false, error: error.message });
          }
          return eventId ? get().getScoresForEvent(eventId) : Object.values(get().scores);
        }
      },

      // A judge's sheet for one contestant. Saved by the database function
      // submit_judge_score, which checks that the signed-in account is an
      // active judge of this event and that scoring is open. Throws when the
      // database refuses, so a screen never reports a save that didn't happen.
      // (`judgeId` is ignored: the database uses the signed-in account.)
      submitScore: async (eventId, _judgeId, contestantId, criteriaScores, metadata = {}) => {
        const event = findScoreEvent(eventId);
        const data = await rpcOrThrow('submit_judge_score', {
          p_event_id: Number(eventId),
          p_contestant_id: String(contestantId),
          p_criteria_scores: criteriaScores,
          p_comments: metadata.comments || {},
          p_remarks: metadata.remarks || '',
          p_round_name: metadata.roundName ?? getCurrentRoundKey(event) ?? null,
        });

        const saved = normalizeScore(data);
        set((state) => ({ scores: { ...state.scores, [saved.id]: saved } }));
        useNotificationStore.getState().notifyScoreSubmitted(saved, event, 'submitted').catch(() => {});
        return saved;
      },

      updateScore: async (eventId, judgeId, contestantId, criteriaScores, metadata = {}) => {
        await get().submitScore(eventId, judgeId, contestantId, criteriaScores, metadata);
        return true;
      },

      // The signed-in judge marks their sheet(s) final.
      lockScore: async (eventId, _judgeId, contestantId = null) => {
        const count = await rpcOrThrow('lock_my_judge_scores', {
          p_event_id: Number(eventId),
          p_contestant_id: contestantId == null ? null : String(contestantId),
        });
        await get().fetchScores(eventId, { silent: true });
        return count;
      },

      // Organizer correction of a saved sheet, with a reason (logged).
      correctScore: async (scoreId, criteriaScores, reason) => {
        const data = await rpcOrThrow('correct_judge_score', {
          p_score_id: String(scoreId),
          p_criteria_scores: criteriaScores,
          p_reason: reason,
        });
        const saved = normalizeScore(data);
        set((state) => ({ scores: { ...state.scores, [saved.id]: saved } }));
        return saved;
      },

      // Organizer: take a sheet out of the results, with a reason (logged).
      voidScore: async (scoreId, reason) => {
        const data = await rpcOrThrow('void_judge_score', { p_score_id: String(scoreId), p_reason: reason });
        const saved = normalizeScore(data);
        set((state) => ({ scores: { ...state.scores, [saved.id]: saved } }));
        return saved;
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

      // One sheet's weighted total — the same formula the results use
      // (scoreComputation.js step 1), rounded only for display.
      calculateWeightedTotal: (criteria, scores) => {
        const list = criteria || [];
        const totalWeight = list.reduce((sum, criterion) => sum + (Number(criterion.weight) > 0 ? Number(criterion.weight) : 0), 0);
        const breakdown = list.map((criterion) => {
          const score = Number(scores?.[criterion.id] ?? scores?.[criterion.name] ?? 0);
          const weight = Number(criterion.weight) > 0 ? Number(criterion.weight) : 0;
          const weighted = totalWeight > 0 ? (score * weight) / totalWeight : score / Math.max(list.length, 1);
          return { id: criterion.id, name: criterion.name, score, weight: criterion.weight, weighted };
        });
        const raw = sheetTotal(list, scores || {});
        return { totalScore: raw === null ? 0 : roundHalfAway(raw), breakdown };
      },

      // Ranked results of a judged event. See src/utils/scoreComputation.js
      // for the formula. `options.expectedSeats` (number of judging seats)
      // lets a contestant missing a sheet be flagged; without it the most
      // sheets any contestant has is used.
      calculateLeaderboard: (eventId, criteria, options = {}) => {
        const eventScores = get().getScoresForEvent(eventId);
        const event = findScoreEvent(eventId);
        const audienceSummary = useAudienceScoreStore.getState().getAudienceSummary(eventId);
        const audienceEnabled = Boolean(event?.audienceImpactEnabled ?? event?.audienceImpact);

        // Contestants cut in an earlier round are placed below, from the round
        // they went out in — not ranked again on audience votes alone.
        const cutEarlier = new Set(
          (Array.isArray(event?.roundResults) ? event.roundResults : [])
            .flatMap((round) => (round.standings || []).filter((row) => !row.advanced).map((row) => String(row.contestantId)))
        );
        const audienceByContestant = Object.fromEntries(
          Object.entries(audienceSummary.byContestant || {}).filter(([id]) => !cutEarlier.has(String(id)))
        );

        const names = {};
        (event?.contestants || []).forEach((contestant) => { names[String(contestant.id)] = contestant.name; });
        eventScores.forEach((score) => {
          const id = String(score.contestantId);
          if (!names[id]) names[id] = resolveContestantName(event, id, score.contestantName);
        });
        Object.entries(audienceByContestant).forEach(([id, audience]) => {
          if (!names[id]) names[id] = resolveContestantName(event, id, audience.contestantName);
        });

        const results = computeEventResults({
          criteria: criteria || [],
          scores: eventScores,
          audience: { enabled: audienceEnabled, weight: event?.audienceImpactWeight ?? 10, byContestant: audienceByContestant },
          expectedSeats: options.expectedSeats,
          tieBreaker: event?.tieBreaker,
          names,
        });
        const ranked = results.rows;

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
                finalScore: row.score,
                judgeAverage: row.score,
                audienceAverage: 0,
                audienceSubmissions: 0,
                audienceWeight: results.audienceWeight,
                judgeWeight: results.judgeWeight,
                totalScores: row.submissions || 0,
                missingSheets: 0,
                eliminatedIn: round.name,
                rank: ranked.length + 1,
              });
            });
        });

        return ranked;
      },

      // Organizer: lock every sheet of the event (database function; only
      // the event's organizer may do this). Throws when refused.
      finalizeEventScores: async (eventId) => {
        const count = await rpcOrThrow('finalize_event_scores', { p_event_id: Number(eventId) });
        await get().fetchScores(eventId, { silent: true });
        return Number(count || 0);
      },

      getScoreByKey: (eventId, judgeId, contestantId) => {
        const event = findScoreEvent(eventId);
        // A score from an earlier round is not "this judge's score" any more:
        // the judge starts the new round with a blank sheet.
        return Object.values(get().scores).find((score) =>
          String(score.eventId) === String(eventId) &&
          String(score.judgeId) === String(judgeId) &&
          String(score.contestantId) === String(contestantId) &&
          isCurrentRoundScore(score, event)
        ) || null;
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

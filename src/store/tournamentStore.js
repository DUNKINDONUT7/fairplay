import { create } from 'zustand';
import { isEventOver, isScoringOpen, isBracketPublic } from '../utils/bracketRules';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, subscribeToTable, supabase } from '../utils/supabaseClient';
import { bindDataCacheReset } from '../utils/dataCache';
import { isStaleError, rpcOrThrow } from '../utils/rpc';
import {
  buildRounds,
  calculateChampion,
  generateBracketFor,
  laterResultDependsOn,
  normalizeEntrants,
  repairSingleEliminationProgress,
  resetBracketMatch,
  updateBracketMatch,
} from '../utils/bracketEngine';
import useCertificateStore from './certificateStore';
import useEventStore from './eventStore';
import useNotificationStore from './notificationStore';

// Every non-bye match has a saved result — the only time a champion may be
// shown (the database enforces the same rule, see 03_tournament_controls.sql).
function allMatchesPlayed(matches = []) {
  const playable = matches.filter((match) => match.status !== 'bye');
  return playable.length > 0 && playable.every((match) => match.status === 'completed');
}

function hasChampionValue(champion) {
  return Boolean(champion) && typeof champion === 'object' ? Object.keys(champion).length > 0 : Boolean(champion);
}

function normalizeTournament(tournament) {
  const bracketType = tournament.bracketType || tournament.bracket_type || 'single';
  const totalRounds = Number(tournament.totalRounds || tournament.total_rounds || 0);
  let matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  // Brackets saved before the bye fix may carry a team pushed through an
  // unplayed match; re-derive the later rounds so they self-heal on load.
  if (bracketType === 'single' && matches.length > 0 && totalRounds > 1) {
    matches = repairSingleEliminationProgress(matches, totalRounds);
  }
  const standings = Array.isArray(tournament.standings) ? tournament.standings : [];
  // The champion is always re-derived from the matches and only exists once
  // every match is played, so a stale or premature record never shows.
  const derived = allMatchesPlayed(matches) ? calculateChampion({ bracketType, matches, standings, totalRounds }) : null;
  const storedChampion = hasChampionValue(tournament.champion) ? tournament.champion : null;
  const champion = derived || (allMatchesPlayed(matches) ? storedChampion : null);
  const storedLiveStatus = tournament.liveStatus || tournament.live_status || 'waiting';
  const liveStatus = !champion && storedLiveStatus === 'completed' ? 'live' : storedLiveStatus;

  return {
    id: tournament.id || Date.now(),
    title: tournament.title || tournament.name || 'Tournament',
    name: tournament.name || tournament.title || 'Tournament',
    eventId: tournament.eventId || tournament.event_id || null,
    subEventId: tournament.subEventId || tournament.sub_event_id || null,
    subEventName: tournament.subEventName || tournament.sub_event_name || '',
    status: tournament.status || 'draft',
    bracketType,
    teams: Array.isArray(tournament.teams) ? normalizeEntrants(tournament.teams) : [],
    matches,
    rounds: Array.isArray(tournament.rounds) ? tournament.rounds : [],
    standings,
    historyLog: Array.isArray(tournament.historyLog || tournament.history_log) ? (tournament.historyLog || tournament.history_log) : [],
    entrantSnapshot: Array.isArray(tournament.entrantSnapshot || tournament.entrant_snapshot) ? (tournament.entrantSnapshot || tournament.entrant_snapshot) : [],
    currentRound: Number(tournament.currentRound || tournament.current_round || 0),
    totalRounds,
    totalSlots: Number(tournament.totalSlots || tournament.total_slots || 0),
    byes: Number(tournament.byes || 0),
    liveStatus,
    champion,
    streamTitle: tournament.streamTitle || tournament.stream_title || '',
    streamMessage: tournament.streamMessage || tournament.stream_message || '',
    isLocked: Boolean(tournament.isLocked ?? tournament.is_locked),
    isFinalized: Boolean(tournament.isFinalized ?? tournament.is_finalized),
    finalizedAt: tournament.finalizedAt || tournament.finalized_at || null,
    isPublished: Boolean(tournament.isPublished ?? tournament.is_published),
    publishedAt: tournament.publishedAt || tournament.published_at || null,
    lastSyncedAt: tournament.lastSyncedAt || tournament.last_synced_at || null,
    // Optimistic-concurrency counter: every write sends the revision it was
    // based on, and the database refuses it if someone saved in between.
    revision: Number(tournament.revision ?? 0),
    drawCount: Number(tournament.drawCount ?? tournament.draw_count ?? 0),
    createdAt: tournament.createdAt || tournament.created_at || new Date().toISOString(),
  };
}

// What the database functions accept (apply_tournament_payload).
function buildTournamentPayload(tournament) {
  return {
    id: tournament.id,
    name: tournament.name || tournament.title || 'Tournament',
    title: tournament.title || tournament.name || 'Tournament',
    status: tournament.status,
    bracket_type: tournament.bracketType,
    teams: tournament.teams,
    matches: tournament.matches,
    rounds: tournament.rounds,
    standings: tournament.standings || [],
    current_round: tournament.currentRound,
    total_rounds: tournament.totalRounds,
    total_slots: tournament.totalSlots,
    byes: tournament.byes,
    live_status: tournament.liveStatus,
    champion: tournament.champion || {},
    stream_title: tournament.streamTitle,
    stream_message: tournament.streamMessage,
    entrant_snapshot: tournament.entrantSnapshot || [],
    sub_event_id: tournament.subEventId || null,
  };
}

function buildChampionshipReportSnapshot(tournament, match, champion) {
  if (!tournament || !match || !champion) return null;

  return {
    id: `tournament-result-${tournament.id}`,
    category: 'tournament-result',
    title: `${tournament.title || tournament.name || 'Tournament'} Finals Report`,
    tournamentId: tournament.id,
    tournamentTitle: tournament.title || tournament.name || 'Tournament',
    bracketType: tournament.bracketType || 'single',
    status: 'completed',
    savedAt: new Date().toISOString(),
    champion: {
      id: champion.id || null,
      name: champion.name || 'Champion',
      seed: champion.seed || null,
    },
    finalMatch: {
      id: match.id,
      round: match.round,
      team1: match.team1 ? { id: match.team1.id || null, name: match.team1.name || 'TBD' } : null,
      team2: match.team2 ? { id: match.team2.id || null, name: match.team2.name || 'TBD' } : null,
      winner: match.winner ? { id: match.winner.id || null, name: match.winner.name || 'TBD' } : null,
      score1: Number(match.score1 || 0),
      score2: Number(match.score2 || 0),
      completedDate: match.completedDate || null,
    },
  };
}

const FINALIZED_MESSAGE = 'This bracket has been finalized. Its scores and results can no longer be changed.';

// Scores can be entered until the bracket is finalized or its event is over.
function assertBracketEditable(tournament) {
  if (tournament.isFinalized) {
    throw new Error(FINALIZED_MESSAGE);
  }
  if (isEventOver(useEventStore.getState().getEventById(tournament.eventId))) {
    throw new Error('This event is completed, so its bracket can no longer be changed.');
  }
}

// Entering scores also needs the event approved and scoring opened. An event
// that isn't loaded can't be judged either way, so it is left to the caller
// (the database checks it again regardless).
function assertScoringOpen(tournament) {
  assertBracketEditable(tournament);
  const event = useEventStore.getState().getEventById(tournament.eventId);
  if (!event || isScoringOpen(event)) return;
  throw new Error(isBracketPublic(event)
    ? 'Scoring is not open yet. The organizer needs to open scoring for this bracket first.'
    : 'Scores can only be entered once the event is approved.');
}

function sameResult(left, right) {
  return Number(left?.score1 || 0) === Number(right?.score1 || 0)
    && Number(left?.score2 || 0) === Number(right?.score2 || 0)
    && String(left?.winner?.id ?? '') === String(right?.winner?.id ?? '');
}

let tournamentsRealtimeBound = false;
let tournamentsRealtimeFilter;

function ensureTournamentsRealtime(eventId) {
  tournamentsRealtimeFilter = eventId;
  if (!isSupabaseConfigured || !supabase || tournamentsRealtimeBound) return;

  tournamentsRealtimeBound = true;

  subscribeToTable({
    table: 'tournaments',
    onChange: () => {
      const state = useTournamentStore.getState();
      if (typeof state.fetchTournaments === 'function') {
        state.fetchTournaments(tournamentsRealtimeFilter, { silent: true });
      }
    },
  });
}

const useTournamentStore = create(
  persist(
    (set, get) => {
      // Puts the database's copy of one tournament into the store.
      const applyServerRow = (row) => {
        if (!row) return null;
        const normalized = normalizeTournament(row);
        // Unsaved score drafts typed on this device survive a refresh of the
        // same bracket (they are never written to the database).
        const drafts = get().drafts?.[normalized.id] || {};
        set((state) => ({
          tournaments: state.tournaments.some((entry) => String(entry.id) === String(normalized.id))
            ? state.tournaments.map((entry) => (String(entry.id) === String(normalized.id) ? normalized : entry))
            : [normalized, ...state.tournaments],
          drafts: { ...state.drafts, [normalized.id]: drafts },
        }));
        return normalized;
      };

      const refetchOne = async (tournamentId) => {
        const { data, error } = await supabase.from('tournaments').select('*').eq('id', tournamentId).maybeSingle();
        if (error) throw new Error(error.message);
        return applyServerRow(data);
      };

      // Draw-level save (entrants, pairings, format, stream text) — organizer.
      const saveDraw = async (tournament, updates, reason = null) => {
        const next = normalizeTournament({ ...tournament, ...updates, id: tournament.id });
        if (!isSupabaseConfigured) {
          set((state) => ({ tournaments: state.tournaments.map((entry) => (String(entry.id) === String(next.id) ? next : entry)) }));
          return next;
        }
        const row = await rpcOrThrow('tournament_save_draw', {
          p_tournament_id: Number(tournament.id),
          p_payload: buildTournamentPayload(next),
          p_expected_revision: tournament.revision,
          p_reason: reason,
        });
        return applyServerRow(row);
      };

      return {
        tournaments: [],
        // { [tournamentId]: { [matchId]: { score1, score2 } } } — local only.
        drafts: {},
        loading: false,
        error: null,

        fetchTournaments: async (eventId, options = {}) => {
          const { silent = false } = options;
          if (!silent && get().tournaments.length === 0) {
            set({ loading: true, error: null });
          }

          if (!isSupabaseConfigured) {
            const tournaments = eventId
              ? get().tournaments.filter((tournament) => String(tournament.eventId) === String(eventId))
              : get().tournaments;
            set({ loading: false });
            return tournaments;
          }

          ensureTournamentsRealtime(eventId);

          try {
            let query = supabase.from('tournaments').select('*').order('created_at', { ascending: false });
            if (eventId) {
              query = query.eq('event_id', eventId);
            }
            const { data, error } = await query;
            if (error) throw error;

            const tournaments = (data || []).map((entry) => normalizeTournament(entry));
            set({
              tournaments: eventId
                ? [...tournaments, ...get().tournaments.filter((entry) => String(entry.eventId) !== String(eventId))]
                : tournaments,
              loading: false,
              error: null,
            });
            return tournaments;
          } catch (error) {
            console.error('Error fetching tournaments:', error.message);
            set({ loading: false, error: error.message });
            return eventId
              ? get().tournaments.filter((entry) => String(entry.eventId) === String(eventId))
              : get().tournaments;
          }
        },

        // Organizer only (database: tournament_create).
        createTournament: async (data) => {
          const tournament = normalizeTournament({
            ...data,
            id: data.id || Date.now(),
            status: data.status || 'draft',
            liveStatus: data.liveStatus || 'waiting',
            streamTitle: data.streamTitle || `${data.title || 'Tournament'} Live Bracket`,
            streamMessage: data.streamMessage || 'Bracket is ready for live updates.',
            teams: normalizeEntrants(data.teams || []),
            matches: [],
            rounds: [],
            standings: [],
            entrantSnapshot: normalizeEntrants(data.teams || []),
            champion: null,
          });

          if (!isSupabaseConfigured) {
            set((state) => ({ tournaments: [tournament, ...state.tournaments] }));
            return tournament;
          }

          const row = await rpcOrThrow('tournament_create', {
            p_event_id: Number(tournament.eventId),
            p_payload: buildTournamentPayload(tournament),
          });
          return applyServerRow(row);
        },

        // Organizer, draw-level fields only. Results go through
        // saveMatchResult (scorer) or correctMatchResult (organizer).
        updateTournament: async (id, updates, options = {}) => {
          const current = get().getTournamentById(id);
          if (!current) return null;
          if (current.isFinalized) throw new Error(FINALIZED_MESSAGE);
          return saveDraw(current, updates, options.reason || null);
        },

        deleteTournament: async (id) => {
          if (get().getTournamentById(id)?.isFinalized) {
            throw new Error(FINALIZED_MESSAGE);
          }
          if (isSupabaseConfigured) {
            await rpcOrThrow('tournament_delete', { p_tournament_id: Number(id) });
          }
          set((state) => ({
            tournaments: state.tournaments.filter((entry) => String(entry.id) !== String(id)),
          }));
          return true;
        },

        replaceEntrants: async (tournamentId, entrants = [], options = {}) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          const normalizedEntrants = normalizeEntrants(entrants);
          return saveDraw(tournament, { teams: normalizedEntrants, entrantSnapshot: normalizedEntrants }, options.reason || null);
        },

        addTeam: async (tournamentId, team) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          const teams = normalizeEntrants([...tournament.teams, team]);
          return saveDraw(tournament, { teams, entrantSnapshot: teams });
        },

        removeTeam: async (tournamentId, teamId) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          const teams = tournament.teams.filter((team) => String(team.id) !== String(teamId));
          return saveDraw(tournament, { teams, entrantSnapshot: teams });
        },

        // Builds (or rebuilds) the draw. After the official pairing — the
        // event is approved — or once any result exists, a rebuild is an
        // exceptional redraw: it needs `options.reason` and is logged.
        generateBracket: async (tournamentId, options = {}) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          assertBracketEditable(tournament);

          const entrants = normalizeEntrants(options.entrants || tournament.teams || []);
          if (entrants.length < 2) {
            throw new Error('At least two entrants are required to generate a bracket.');
          }

          if (tournament.bracketType === 'double') {
            throw new Error('Double elimination is not available for official use yet. Please use another format.');
          }

          const existingHasResults = (tournament.matches || []).some((match) =>
            ['completed', 'in-progress'].includes(match.status)
          );
          if (existingHasResults && !options.force) {
            throw new Error('Bracket already has results. Confirm regeneration before overwriting.');
          }

          const generated = generateBracketFor(tournament.bracketType, entrants);

          set((state) => ({ drafts: { ...state.drafts, [tournament.id]: {} } }));
          return saveDraw(tournament, {
            teams: generated.teams,
            entrantSnapshot: generated.teams,
            matches: generated.matches,
            rounds: generated.rounds,
            standings: generated.standings,
            totalRounds: generated.totalRounds,
            totalSlots: generated.totalSlots,
            byes: generated.byes,
            currentRound: generated.currentRound,
            champion: null,
            status: 'active',
            liveStatus: 'live',
            streamMessage: tournament.bracketType === 'round-robin'
              ? 'Round robin bracket generated and standings are ready.'
              : tournament.bracketType === 'group-knockout'
                ? 'Groups drawn. The knockout fills in once every group match is played.'
                : tournament.bracketType === 'league-playoff'
                  ? 'League games are set. The playoffs fill in once every league game is played.'
                  : 'Bracket generated and BYE slots were auto-advanced.',
          }, options.reason || null);
        },

        // Typing a score only changes this device's draft. Nothing reaches
        // the database (or the public bracket) until the result is saved.
        updateMatchDraft: async (tournamentId, matchId, field, value) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          assertScoringOpen(tournament);
          set((state) => ({
            drafts: {
              ...state.drafts,
              [tournamentId]: {
                ...(state.drafts[tournamentId] || {}),
                [matchId]: { ...(state.drafts[tournamentId]?.[matchId] || {}), [field]: Number(value || 0) },
              },
            },
          }));
          return get().getTournamentById(tournamentId);
        },

        getMatchDraft: (tournamentId, matchId) => get().drafts?.[tournamentId]?.[matchId] || null,

        // Scorer only (database: tournament_record_result). Saves the draft
        // scores of one match as its result and moves the winner on. If the
        // bracket changed underneath (another scorer saved), it reloads and
        // tries once more. Retrying after a lost connection never creates a
        // second result: the database accepts the same result once.
        saveMatchResult: async (tournamentId, matchId, scores = null) => {
          const attempt = async (tournament) => {
            assertScoringOpen(tournament);
            const match = (tournament.matches || []).find((entry) => entry.id === matchId);
            if (!match) throw new Error('Match not found in this bracket.');
            const draft = scores || get().getMatchDraft(tournamentId, matchId) || {};
            const updates = {
              score1: Number(draft.score1 ?? match.score1 ?? 0),
              score2: Number(draft.score2 ?? match.score2 ?? 0),
            };
            if (match.status === 'completed' && Number(match.score1) === updates.score1 && Number(match.score2) === updates.score2) {
              return tournament; // already saved (e.g. a retry after a dropped connection)
            }
            const next = updateBracketMatch(tournament, matchId, updates, { finalize: true });
            const rounds = buildRounds(next.matches, next.totalRounds || 0, next.bracketType);
            const champion = allMatchesPlayed(next.matches) ? calculateChampion(next) : null;
            const payload = buildTournamentPayload(normalizeTournament({
              ...next,
              rounds,
              champion,
              currentRound: next.matches.find((entry) => entry.id === matchId)?.round || next.currentRound,
              liveStatus: champion ? 'completed' : 'live',
              streamMessage: champion
                ? `${champion.name} won the final. Results become official once the organizer finalizes them.`
                : `${match.team1?.name || 'TBD'} vs ${match.team2?.name || 'TBD'} result saved.`,
            }));

            if (!isSupabaseConfigured) {
              return applyServerRow({ ...payload, revision: tournament.revision + 1 });
            }
            const row = await rpcOrThrow('tournament_record_result', {
              p_tournament_id: Number(tournamentId),
              p_match_id: String(matchId),
              p_payload: payload,
              p_expected_revision: tournament.revision,
            });
            return applyServerRow(row);
          };

          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          let saved;
          try {
            saved = await attempt(tournament);
          } catch (error) {
            if (!isStaleError(error)) throw error;
            const fresh = await refetchOne(tournamentId);
            saved = await attempt(fresh);
          }
          set((state) => {
            const drafts = { ...(state.drafts[tournamentId] || {}) };
            delete drafts[matchId];
            return { drafts: { ...state.drafts, [tournamentId]: drafts } };
          });
          return saved;
        },

        // Organizer only (database: tournament_correct_result). Changes the
        // saved score of a match, with a written reason that is logged.
        correctMatchResult: async (tournamentId, matchId, { score1, score2 }, reason) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          assertBracketEditable(tournament);
          const match = (tournament.matches || []).find((entry) => entry.id === matchId);
          if (!match || match.status !== 'completed') throw new Error('Only a match with a saved result can be corrected.');

          const next = updateBracketMatch(tournament, matchId, { score1: Number(score1), score2: Number(score2) }, { finalize: true });
          const corrected = next.matches.find((entry) => entry.id === matchId);
          if (sameResult(match, corrected)) throw new Error('Nothing changed in this result.');
          if (String(match.winner?.id ?? '') !== String(corrected.winner?.id ?? '')) {
            const blocking = laterResultDependsOn(tournament, matchId);
            if (blocking) {
              throw new Error(`${blocking.team1?.name || 'TBD'} vs ${blocking.team2?.name || 'TBD'} already has a result that depends on this winner. Correct or undo that match first.`);
            }
          }
          const champion = allMatchesPlayed(next.matches) ? calculateChampion(next) : null;
          const payload = buildTournamentPayload(normalizeTournament({
            ...next,
            rounds: buildRounds(next.matches, next.totalRounds || 0, next.bracketType),
            champion,
            liveStatus: champion ? 'completed' : 'live',
            streamMessage: 'A saved result was corrected by the organizer.',
          }));
          const row = await rpcOrThrow('tournament_correct_result', {
            p_tournament_id: Number(tournamentId),
            p_match_id: String(matchId),
            p_payload: payload,
            p_expected_revision: tournament.revision,
            p_reason: reason,
            p_kind: 'correction',
          });
          return applyServerRow(row);
        },

        // Organizer only: takes a saved result off a match (logged undo).
        undoMatchResult: async (tournamentId, matchId, reason) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          assertBracketEditable(tournament);
          const next = resetBracketMatch(tournament, matchId);
          const payload = buildTournamentPayload(normalizeTournament({
            ...next,
            champion: null,
            liveStatus: 'live',
            streamMessage: 'A saved result was undone by the organizer.',
          }));
          const row = await rpcOrThrow('tournament_correct_result', {
            p_tournament_id: Number(tournamentId),
            p_match_id: String(matchId),
            p_payload: payload,
            p_expected_revision: tournament.revision,
            p_reason: reason,
            p_kind: 'undo',
          });
          return applyServerRow(row);
        },

        // The most recently saved result, which an undo would take off.
        getLastSavedMatch: (tournamentId) => {
          const tournament = get().getTournamentById(tournamentId);
          return [...(tournament?.matches || [])]
            .filter((match) => match.status === 'completed')
            .sort((left, right) => new Date(right.completedDate || 0) - new Date(left.completedDate || 0))[0] || null;
        },

        undoLastResult: async (tournamentId, reason) => {
          const last = get().getLastSavedMatch(tournamentId);
          if (!last) throw new Error('No saved result to undo.');
          return get().undoMatchResult(tournamentId, last.id, reason);
        },

        publishTournament: async (tournamentId, isPublished = true) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          // isPublished controls audience visibility only — liveStatus tracks
          // actual match progress and is not touched here.
          const row = isSupabaseConfigured
            ? await rpcOrThrow('tournament_set_visibility', {
              p_tournament_id: Number(tournamentId),
              p_is_published: isPublished,
              p_stream_title: null,
              p_stream_message: isPublished ? 'Public bracket view is now live.' : 'Public bracket view was unpublished.',
            })
            : { ...tournament, isPublished };
          const updated = applyServerRow(row);

          if (isPublished && updated) {
            const event = useEventStore.getState().getEventById(updated.eventId);
            await useNotificationStore.getState().notifyBracketPublished(updated, event);
          }

          return updated;
        },

        // Permanently freezes a finished bracket (database: tournament_finalize,
        // organizer only, every match played). The champion's certificate and
        // the finals report are made here, when the result is official.
        finalizeTournament: async (tournamentId) => {
          const tournament = get().getTournamentById(tournamentId);
          if (!tournament) return null;
          if (tournament.isFinalized) return tournament;

          if (!allMatchesPlayed(tournament.matches || [])) {
            throw new Error('Every match must have a saved result before the scores can be finalized.');
          }

          const row = isSupabaseConfigured
            ? await rpcOrThrow('tournament_finalize', { p_tournament_id: Number(tournamentId) })
            : { ...tournament, isFinalized: true, isLocked: true, finalizedAt: new Date().toISOString() };
          const finalized = applyServerRow(row);

          const champion = finalized?.champion;
          const finalMatch = [...(finalized?.matches || [])]
            .filter((match) => match.status === 'completed')
            .sort((left, right) => Number(right.round) - Number(left.round))[0];
          try {
            if (champion && finalized.eventId) {
              const eventStore = useEventStore.getState();
              const certificateStore = useCertificateStore.getState();
              const event = eventStore.getEventById(finalized.eventId) || {
                id: finalized.eventId,
                title: finalized.title || finalized.name || 'Tournament',
              };
              const reportSnapshot = buildChampionshipReportSnapshot(finalized, finalMatch, champion);
              if (reportSnapshot && event?.id) {
                await eventStore.addGeneratedReport(event.id, reportSnapshot).catch((reportError) => {
                  console.warn('Championship report was not saved:', reportError?.message || reportError);
                });
              }

              const recipientId = String(champion?.id || champion || '').trim();
              const existingCert = certificateStore.certificates.find(
                (certificate) => String(certificate.eventId) === String(event.id) && String(certificate.recipientId) === recipientId
              );
              if (!existingCert && event.enableCertificates !== false && recipientId) {
                await certificateStore.generateCertificatesForEvent({
                  event,
                  recipients: [{ id: recipientId, name: champion?.name || 'Champion', placement: 1, score: null }],
                  category: 'champion',
                });
              }
            }
          } catch (certificateError) {
            console.error('Error generating champion certificate:', certificateError?.message || certificateError);
          }

          return finalized;
        },

        getTournamentById: (id) => get().tournaments.find((tournament) => String(tournament.id) === String(id)) || null,
        getTournamentByEvent: (eventId) =>
          get().tournaments.find((tournament) => String(tournament.eventId) === String(eventId)) || null,
      };
    },
    {
      name: 'fairplay_tournaments',
      partialize: (state) => ({ tournaments: state.tournaments, drafts: state.drafts }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState || {}),
        tournaments: (persistedState?.tournaments || currentState.tournaments || []).map((entry) => normalizeTournament(entry)),
        drafts: persistedState?.drafts || {},
        loading: false,
        error: null,
      }),
    }
  )
);

bindDataCacheReset(useTournamentStore, ['tournaments']);

export default useTournamentStore;

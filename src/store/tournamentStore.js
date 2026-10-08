import { create } from 'zustand';
import { hasEventStarted, isBracketPublic, isEventOver, isScoringOpen } from '../utils/bracketRules';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, subscribeToTable, supabase } from '../utils/supabaseClient';
import { bindDataCacheReset } from '../utils/dataCache';
import {
  buildRounds,
  calculateChampion,
  createHistoryEntry,
  generateBracketFor,
  normalizeEntrants,
  updateBracketMatch,
} from '../utils/bracketEngine';
import useCertificateStore from './certificateStore';
import useEventStore from './eventStore';
import useNotificationStore from './notificationStore';

function normalizeTournament(tournament) {
  const bracketType = tournament.bracketType || tournament.bracket_type || 'single';
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  const standings = Array.isArray(tournament.standings) ? tournament.standings : [];
  const storedChampion = tournament.champion || null;
  // Round-robin tournaments saved before the "champion only once every
  // match is played" fix can still have a premature champion sitting in
  // the database. Re-derive it from the actual matches on every load so a
  // stale record self-heals without needing a manual data fix.
  const champion = bracketType === 'round-robin'
    ? calculateChampion({ bracketType, matches, standings })
    : storedChampion;
  const storedLiveStatus = tournament.liveStatus || tournament.live_status || 'waiting';
  const liveStatus = bracketType === 'round-robin' && !champion && storedLiveStatus === 'completed'
    ? 'live'
    : storedLiveStatus;

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
    totalRounds: Number(tournament.totalRounds || tournament.total_rounds || 0),
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
    createdAt: tournament.createdAt || tournament.created_at || new Date().toISOString(),
  };
}

function buildTournamentPayload(tournament) {
  return {
    id: tournament.id,
    name: tournament.name || tournament.title || 'Tournament',
    title: tournament.title || tournament.name || 'Tournament',
    event_id: tournament.eventId,
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
    champion: tournament.champion,
    stream_title: tournament.streamTitle,
    stream_message: tournament.streamMessage,
    is_locked: tournament.isLocked,
    is_published: tournament.isPublished,
    published_at: tournament.publishedAt,
    history_log: tournament.historyLog || [],
    entrant_snapshot: tournament.entrantSnapshot || [],
    last_synced_at: new Date().toISOString(),
    created_at: tournament.createdAt,
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
// What may still change on a finalized bracket: who can see it, nothing else.
const FINALIZED_EDITABLE_FIELDS = ['isPublished', 'publishedAt', 'streamTitle', 'streamMessage'];

// Scores can be entered until the bracket is finalized or its event is over.
// (The old manual lock switch is gone; is_locked is only set by finalizing.)
function assertBracketEditable(tournament) {
  if (tournament.isFinalized) {
    throw new Error(FINALIZED_MESSAGE);
  }
  if (isEventOver(useEventStore.getState().getEventById(tournament.eventId))) {
    throw new Error('This event is completed, so its bracket can no longer be changed.');
  }
}

// Entering scores also needs the event approved and scoring opened. An event
// that isn't loaded can't be judged either way, so it is left to the caller.
function assertScoringOpen(tournament) {
  assertBracketEditable(tournament);
  const event = useEventStore.getState().getEventById(tournament.eventId);
  if (!event || isScoringOpen(event)) return;
  throw new Error(isBracketPublic(event)
    ? 'Scoring is not open yet. The organizer needs to open scoring for this bracket first.'
    : 'Scores can only be entered once the event is approved.');
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
    (set, get) => ({
      tournaments: [],
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
          set({
            tournaments: eventId
              ? get().tournaments.filter((entry) => String(entry.eventId) !== String(eventId))
              : [],
            loading: false,
            error: error.message,
          });
          return [];
        }
      },

      createTournament: async (data) => {
        const tournament = normalizeTournament({
          ...data,
          status: data.status || 'draft',
          liveStatus: data.liveStatus || 'waiting',
          streamTitle: data.streamTitle || `${data.title || 'Tournament'} Live Bracket`,
          streamMessage: data.streamMessage || 'Bracket is ready for live updates.',
          isLocked: false,
          isPublished: false,
          teams: normalizeEntrants(data.teams || []),
          matches: [],
          rounds: [],
          standings: [],
          historyLog: [],
          entrantSnapshot: normalizeEntrants(data.teams || []),
          champion: null,
          currentRound: 0,
          totalRounds: 0,
          totalSlots: 0,
          byes: 0,
        });

        set((state) => ({ tournaments: [tournament, ...state.tournaments] }));

        if (!isSupabaseConfigured) {
          return tournament;
        }

        try {
          const { data: inserted, error } = await supabase
            .from('tournaments')
            .upsert([buildTournamentPayload(tournament)])
            .select()
            .single();
          if (error) throw error;

          const normalized = normalizeTournament(inserted || tournament);
          set((state) => ({
            tournaments: state.tournaments.map((entry) =>
              String(entry.id) === String(tournament.id) ? normalized : entry
            ),
          }));
          return normalized;
        } catch (error) {
          console.error('Error creating tournament:', error.message);
          set((state) => ({
            tournaments: state.tournaments.filter((entry) => String(entry.id) !== String(tournament.id)),
            error: error.message,
          }));
          return null;
        }
      },

      updateTournament: async (id, updates) => {
        const current = get().getTournamentById(id);
        if (!current) return null;

        // A finalized bracket's results are permanent (the database enforces
        // this too). Only its public visibility can still change, and that is
        // written as those columns alone so nothing else is even sent.
        if (current.isFinalized) {
          const blocked = Object.keys(updates).filter((key) => !FINALIZED_EDITABLE_FIELDS.includes(key));
          if (blocked.length > 0) {
            throw new Error(FINALIZED_MESSAGE);
          }
          const visibleTournament = normalizeTournament({ ...current, ...updates, id });
          set((state) => ({
            tournaments: state.tournaments.map((entry) => (String(entry.id) === String(id) ? visibleTournament : entry)),
          }));
          if (isSupabaseConfigured) {
            const { error } = await supabase
              .from('tournaments')
              .update({
                is_published: visibleTournament.isPublished,
                published_at: visibleTournament.publishedAt,
                stream_title: visibleTournament.streamTitle,
                stream_message: visibleTournament.streamMessage,
              })
              .eq('id', id);
            if (error) {
              console.error('Error updating tournament:', error.message);
              set({ error: error.message });
            }
          }
          return visibleTournament;
        }

        const updatedTournament = normalizeTournament({ ...current, ...updates, id });
        set((state) => ({
          tournaments: state.tournaments.map((entry) =>
            String(entry.id) === String(id) ? updatedTournament : entry
          ),
        }));

        if (!isSupabaseConfigured) {
          return updatedTournament;
        }

        try {
          const { error } = await supabase.from('tournaments').upsert([buildTournamentPayload(updatedTournament)]);
          if (error) throw error;
        } catch (error) {
          console.error('Error updating tournament:', error.message);
          set({ error: error.message });
        }

        return updatedTournament;
      },

      deleteTournament: async (id) => {
        if (get().getTournamentById(id)?.isFinalized) {
          throw new Error(FINALIZED_MESSAGE);
        }
        set((state) => ({
          tournaments: state.tournaments.filter((entry) => String(entry.id) !== String(id)),
        }));

        if (!isSupabaseConfigured) {
          return true;
        }

        try {
          const { error } = await supabase.from('tournaments').delete().eq('id', id);
          if (error) throw error;
        } catch (error) {
          console.error('Error deleting tournament:', error.message);
          set({ error: error.message });
        }

        return true;
      },

      replaceEntrants: async (tournamentId, entrants = []) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        const normalizedEntrants = normalizeEntrants(entrants);
        return get().updateTournament(tournamentId, {
          teams: normalizedEntrants,
          entrantSnapshot: normalizedEntrants,
        });
      },

      addTeam: async (tournamentId, team) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        const teams = normalizeEntrants([...tournament.teams, team]);
        return get().updateTournament(tournamentId, { teams, entrantSnapshot: teams });
      },

      removeTeam: async (tournamentId, teamId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        const teams = tournament.teams.filter((team) => String(team.id) !== String(teamId));
        return get().updateTournament(tournamentId, { teams, entrantSnapshot: teams });
      },

      generateBracket: async (tournamentId, options = {}) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        assertBracketEditable(tournament);
        // The first build is always allowed; it is rebuilding an existing
        // bracket that stops once the event is under way.
        if ((tournament.matches || []).length > 0 && hasEventStarted(useEventStore.getState().getEventById(tournament.eventId))) {
          throw new Error('The event has started, so the bracket can no longer be rebuilt.');
        }

        const entrants = normalizeEntrants(options.entrants || tournament.teams || []);
        if (entrants.length < 2) {
          throw new Error('At least two entrants are required to generate a bracket.');
        }

        if (tournament.bracketType === 'double') {
          throw new Error('Double elimination is still being built. Please use single elimination or round robin for now.');
        }

        const existingHasResults = (tournament.matches || []).some((match) =>
          ['completed', 'in-progress', 'bye'].includes(match.status)
        );
        if (existingHasResults && !options.force) {
          throw new Error('Bracket already has results. Confirm regeneration before overwriting.');
        }

        const generated = generateBracketFor(tournament.bracketType, entrants);

        return get().updateTournament(tournamentId, {
          teams: generated.teams,
          entrantSnapshot: generated.teams,
          matches: generated.matches,
          rounds: generated.rounds,
          standings: generated.standings,
          totalRounds: generated.totalRounds,
          totalSlots: generated.totalSlots,
          byes: generated.byes,
          currentRound: generated.currentRound,
          champion: generated.champion,
          status: 'active',
          liveStatus: 'live',
          historyLog: [],
          streamMessage: tournament.bracketType === 'round-robin'
            ? 'Round robin bracket generated and standings are ready.'
            : tournament.bracketType === 'group-knockout'
              ? 'Groups drawn. The knockout fills in once every group match is played.'
              : 'Bracket generated and BYE slots were auto-advanced.',
        });
      },

      updateMatchDraft: async (tournamentId, matchId, field, value) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        assertScoringOpen(tournament);

        const updates = {
          [field]: Number(value || 0),
          status: 'in-progress',
        };

        const nextTournament = updateBracketMatch(tournament, matchId, updates, { finalize: false });

        return get().updateTournament(tournamentId, nextTournament);
      },

      saveMatchResult: async (tournamentId, matchId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        assertScoringOpen(tournament);

        const historyEntry = createHistoryEntry(tournament, `Saved ${matchId}`);
        const nextTournament = updateBracketMatch(tournament, matchId, {}, { finalize: true });

        const rounds = buildRounds(nextTournament.matches, nextTournament.totalRounds || 0, nextTournament.bracketType);
        const champion = calculateChampion(nextTournament);

        const updatedTournament = await get().updateTournament(tournamentId, {
          ...nextTournament,
          rounds,
          champion,
          currentRound: nextTournament.matches.find((match) => match.id === matchId)?.round || nextTournament.currentRound,
          liveStatus: champion ? 'completed' : 'live',
          streamMessage: champion
            ? `${champion.name} has been declared champion.`
            : `Match ${matchId} was updated.`,
          historyLog: [...(tournament.historyLog || []), historyEntry].slice(-20),
        });

        const savedMatch = updatedTournament?.matches?.find((match) => match.id === matchId) || null;
        const isChampionshipMatch =
          Boolean(savedMatch?.winner) &&
          Number(savedMatch?.round || 0) === Number(updatedTournament?.totalRounds || 0);

        try {
          if (isChampionshipMatch && champion && tournament.eventId) {
            const eventStore = useEventStore.getState();
            const certificateStore = useCertificateStore.getState();
            const event = eventStore.getEventById(tournament.eventId) || {
              id: tournament.eventId,
              title: tournament.title || tournament.name || 'Tournament',
            };

            const reportSnapshot = buildChampionshipReportSnapshot(updatedTournament, savedMatch, champion);
            if (reportSnapshot && event?.id) {
              // Scorers aren't the event's owner, so this goes through a
              // database function rather than re-saving the event.
              await eventStore.addGeneratedReport(event.id, reportSnapshot).catch((reportError) => {
                console.warn('Championship report was not saved:', reportError?.message || reportError);
              });
            }

            const recipientId = String(champion?.id || champion || '').trim();
            const recipientName = champion?.name || String(champion || 'Champion');
            let existingCert = certificateStore.certificates.find(
              (certificate) =>
                String(certificate.eventId) === String(event.id) &&
                String(certificate.recipientId) === recipientId
            );

            if (!existingCert && isSupabaseConfigured && recipientId) {
              const { data: fetchedCert, error: fetchError } = await supabase
                .from('certificates')
                .select('*')
                .eq('event_id', event.id)
                .eq('recipient_id', recipientId)
                .maybeSingle();
              if (!fetchError && fetchedCert) {
                existingCert = fetchedCert;
              }
            }

            if (!existingCert && event.enableCertificates !== false) {
              await certificateStore.generateCertificatesForEvent({
                event,
                recipients: [{
                  id: recipientId,
                  name: recipientName,
                  placement: 1,
                  score: null,
                }],
                category: 'champion',
              });
            }
          }
        } catch (certificateError) {
          console.error('Error generating champion certificate:', certificateError?.message || certificateError);
        }

        return updatedTournament;
      },

      undoLastResult: async (tournamentId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;

        const historyLog = [...(tournament.historyLog || [])];
        const previousState = historyLog.pop();
        if (!previousState) {
          throw new Error('No match history available to undo.');
        }

        return get().updateTournament(tournamentId, {
          matches: previousState.matches,
          standings: previousState.standings,
          champion: previousState.champion,
          currentRound: previousState.currentRound,
          rounds: buildRounds(previousState.matches, tournament.totalRounds || 0, tournament.bracketType),
          historyLog,
          liveStatus: previousState.champion ? 'completed' : 'live',
          streamMessage: 'Last saved result was undone.',
        });
      },

      publishTournament: async (tournamentId, isPublished = true) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        // isPublished controls audience visibility only — liveStatus tracks
        // actual match progress (waiting/live/completed) and must not be
        // touched here, or "Live Status" gets stuck showing "published"
        // forever instead of the bracket's real progress.
        const updated = await get().updateTournament(tournamentId, {
          isPublished,
          publishedAt: isPublished ? new Date().toISOString() : null,
          streamMessage: isPublished ? 'Public bracket view is now live.' : 'Public bracket view was unpublished.',
        });

        if (isPublished && updated) {
          const event = useEventStore.getState().getEventById(updated.eventId);
          await useNotificationStore.getState().notifyBracketPublished(updated, event);
        }

        return updated;
      },

      lockTournament: async (tournamentId, isLocked = true) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        return get().updateTournament(tournamentId, {
          isLocked,
          streamMessage: isLocked ? 'Bracket was locked by the organizer.' : 'Bracket was unlocked for editing.',
        });
      },

      // Permanently freezes a finished bracket. Unlike lockTournament this
      // cannot be reversed, by anyone — the database refuses any later change
      // to the results. Only applied locally once the database has accepted
      // it, so the screen never claims a finalization that didn't happen.
      finalizeTournament: async (tournamentId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        if (tournament.isFinalized) return tournament;

        const playable = (tournament.matches || []).filter((match) => match.status !== 'bye');
        if (playable.length === 0 || playable.some((match) => match.status !== 'completed')) {
          throw new Error('Every match must have a saved result before the scores can be finalized.');
        }

        const finalizedAt = new Date().toISOString();
        if (isSupabaseConfigured) {
          const { error } = await supabase
            .from('tournaments')
            .update({ is_finalized: true, is_locked: true, finalized_at: finalizedAt, stream_message: 'Results are final.' })
            .eq('id', tournamentId);
          if (error) {
            const missingColumn = /is_finalized|finalized_at|column/i.test(error.message || '');
            throw new Error(missingColumn
              ? 'Finalizing is not set up in the database yet. Run supabase/finalized-results-lock.sql first.'
              : error.message);
          }
        }

        const finalized = normalizeTournament({ ...tournament, isFinalized: true, isLocked: true, finalizedAt, streamMessage: 'Results are final.' });
        set((state) => ({
          tournaments: state.tournaments.map((entry) => (String(entry.id) === String(tournamentId) ? finalized : entry)),
        }));
        return finalized;
      },

      getTournamentById: (id) => get().tournaments.find((tournament) => String(tournament.id) === String(id)) || null,
      getTournamentByEvent: (eventId) =>
        get().tournaments.find((tournament) => String(tournament.eventId) === String(eventId)) || null,
    }),
    {
      name: 'fairplay_tournaments',
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

bindDataCacheReset(useTournamentStore, ['tournaments']);

export default useTournamentStore;

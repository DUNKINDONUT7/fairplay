import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import {
  buildRounds,
  calculateChampion,
  createHistoryEntry,
  generateRoundRobinBracket,
  generateSingleEliminationBracket,
  normalizeEntrants,
  updateRoundRobinMatch,
  updateSingleEliminationMatch,
} from '../utils/bracketEngine';
import useCertificateStore from './certificateStore';
import useEventStore from './eventStore';

function normalizeTournament(tournament) {
  return {
    id: tournament.id || Date.now(),
    title: tournament.title || tournament.name || 'Tournament',
    name: tournament.name || tournament.title || 'Tournament',
    eventId: tournament.eventId || tournament.event_id || null,
    subEventId: tournament.subEventId || tournament.sub_event_id || null,
    subEventName: tournament.subEventName || tournament.sub_event_name || '',
    status: tournament.status || 'draft',
    bracketType: tournament.bracketType || tournament.bracket_type || 'single',
    teams: Array.isArray(tournament.teams) ? normalizeEntrants(tournament.teams) : [],
    matches: Array.isArray(tournament.matches) ? tournament.matches : [],
    rounds: Array.isArray(tournament.rounds) ? tournament.rounds : [],
    standings: Array.isArray(tournament.standings) ? tournament.standings : [],
    historyLog: Array.isArray(tournament.historyLog || tournament.history_log) ? (tournament.historyLog || tournament.history_log) : [],
    entrantSnapshot: Array.isArray(tournament.entrantSnapshot || tournament.entrant_snapshot) ? (tournament.entrantSnapshot || tournament.entrant_snapshot) : [],
    currentRound: Number(tournament.currentRound || tournament.current_round || 0),
    totalRounds: Number(tournament.totalRounds || tournament.total_rounds || 0),
    totalSlots: Number(tournament.totalSlots || tournament.total_slots || 0),
    byes: Number(tournament.byes || 0),
    liveStatus: tournament.liveStatus || tournament.live_status || 'waiting',
    champion: tournament.champion || null,
    streamTitle: tournament.streamTitle || tournament.stream_title || '',
    streamMessage: tournament.streamMessage || tournament.stream_message || '',
    isLocked: Boolean(tournament.isLocked ?? tournament.is_locked),
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

const useTournamentStore = create(
  persist(
    (set, get) => ({
      tournaments: [],
      loading: false,
      error: null,

      fetchTournaments: async (eventId) => {
        set({ loading: true, error: null });

        if (!isSupabaseConfigured) {
          const tournaments = eventId
            ? get().tournaments.filter((tournament) => String(tournament.eventId) === String(eventId))
            : get().tournaments;
          set({ loading: false });
          return tournaments;
        }

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
        if (tournament.isLocked) {
          throw new Error('This bracket is locked.');
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

        const generated =
          tournament.bracketType === 'round-robin'
            ? generateRoundRobinBracket(entrants)
            : generateSingleEliminationBracket(entrants);

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
            : 'Bracket generated and BYE slots were auto-advanced.',
        });
      },

      updateMatchDraft: async (tournamentId, matchId, field, value) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        if (tournament.isLocked) {
          throw new Error('Bracket is locked and cannot be edited.');
        }

        const updates = {
          [field]: Number(value || 0),
          status: 'in-progress',
        };

        const nextTournament =
          tournament.bracketType === 'round-robin'
            ? updateRoundRobinMatch(tournament, matchId, updates, { finalize: false })
            : updateSingleEliminationMatch(tournament, matchId, updates, { finalize: false });

        return get().updateTournament(tournamentId, nextTournament);
      },

      saveMatchResult: async (tournamentId, matchId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        if (tournament.isLocked) {
          throw new Error('Bracket is locked and cannot be edited.');
        }

        const historyEntry = createHistoryEntry(tournament, `Saved ${matchId}`);
        const nextTournament =
          tournament.bracketType === 'round-robin'
            ? updateRoundRobinMatch(tournament, matchId, {}, { finalize: true })
            : updateSingleEliminationMatch(tournament, matchId, {}, { finalize: true });

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
            if (reportSnapshot && eventStore.updateEvent && event?.id) {
              const existingReports = Array.isArray(event.metadata?.generatedReports)
                ? event.metadata.generatedReports
                : [];
              const nextReports = [
                reportSnapshot,
                ...existingReports.filter((entry) => String(entry.id) !== String(reportSnapshot.id)),
              ];

              await eventStore.updateEvent(event.id, {
                metadata: {
                  ...(event.metadata || {}),
                  generatedReports: nextReports,
                },
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
        return get().updateTournament(tournamentId, {
          isPublished,
          publishedAt: isPublished ? new Date().toISOString() : null,
          streamMessage: isPublished ? 'Public bracket view is now live.' : 'Public bracket view was unpublished.',
        });
      },

      lockTournament: async (tournamentId, isLocked = true) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return null;
        return get().updateTournament(tournamentId, {
          isLocked,
          streamMessage: isLocked ? 'Bracket was locked by the organizer.' : 'Bracket was unlocked for editing.',
        });
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
            tournaments: currentState.tournaments,
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

export default useTournamentStore;

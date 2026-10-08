import { useEffect, useMemo, useRef, useState } from 'react';
import EventPicker from '../../components/common/EventPicker';
import useRememberedEvent from '../../hooks/useRememberedEvent';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import LiveBracket from '../../components/brackets/LiveBracket';
import useTournamentStore from '../../store/tournamentStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useAuthStore from '../../store/authStore';
import useTeamStore from '../../store/teamStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { ensureTournamentAutomation } from '../../services/automationService';
import { isSupabaseConfigured, subscribeToTable } from '../../utils/supabaseClient';
import {
  GROUP_KNOCKOUT_MIN_ENTRANTS,
  calculateBracketPlacements,
  generateGroupKnockoutBracket,
  generateSingleEliminationBracket,
  normalizeEntrants,
} from '../../utils/bracketEngine';
import {
  BRACKET_FORMAT_LABELS,
  describeBracketSchedule,
  hasEventStarted,
  isBracketEvent,
  isBracketPublic,
  isEventOver,
  isScoringOpen,
} from '../../utils/bracketRules';

const TOURNAMENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

function isPointsSystemEvent(event) {
  if (!event) return false;
  const scoringMode = event.performanceScoringMode || '';
  if (scoringMode === 'head-to-head-bracket') return false;
  if (scoringMode === 'points-leaderboard' || scoringMode === 'ranked-leaderboard') return true;
  return event.competitionMode === 'performance' && !TOURNAMENT_TYPES.includes(event.eventType || event.type);
}

function isPerformanceCapableEvent(event) {
  if (!event) return false;
  if (event.competitionMode === 'performance' || event.performanceScoringMode) return true;
  return !TOURNAMENT_TYPES.includes(event.eventType || event.type);
}

function getScoringModeLabel(event) {
  const mode = event?.performanceScoringMode || 'points-leaderboard';
  if (mode === 'ranked-leaderboard') return 'Judge ranking';
  if (mode === 'multi-round') return 'Round elimination';
  if (mode === 'head-to-head-bracket') return 'Head-to-head bracket';
  return 'Points leaderboard';
}

function getChampionRuleLabel(event) {
  const rule = event?.championRule || 'highest-average-score';
  if (rule === 'lowest-rank-total') return 'Lowest rank total wins';
  if (rule === 'final-round-highest-score') return 'Final round highest score wins';
  if (rule === 'bracket-winner') return 'Bracket winner becomes champion';
  return 'Highest average score wins';
}

function getTournamentLabel(tournament, event) {
  if (tournament?.subEventName) return `${event?.title || 'Event'} - ${tournament.subEventName}`;
  if (tournament?.title && tournament.title !== event?.title) return tournament.title;
  return `${event?.title || 'Event'} bracket (${tournament?.bracketType || 'single'})`;
}

const ENTRANT_SOURCE_LABELS = {
  teams: 'From registered teams',
  registrations: 'From approved registrations',
  event: 'From event roster',
  manual: 'Added manually',
};

function getTournamentDedupeKey(tournament) {
  const identity = tournament?.subEventId || tournament?.subEventName || tournament?.name || tournament?.title || tournament?.id;
  return `${tournament?.eventId || 'event'}:${String(identity).trim().toLowerCase()}`;
}

function tournamentQualityScore(tournament) {
  const matches = Array.isArray(tournament?.matches) ? tournament.matches.length : 0;
  const entrants = Array.isArray(tournament?.entrantSnapshot) && tournament.entrantSnapshot.length > 0
    ? tournament.entrantSnapshot.length
    : Array.isArray(tournament?.teams)
      ? tournament.teams.length
      : 0;
  const updated = Date.parse(tournament?.lastSyncedAt || tournament?.createdAt || '') || 0;
  return (matches * 100000) + (entrants * 1000) + updated;
}

function uniqueTournaments(tournaments = []) {
  const byKey = new Map();
  tournaments.forEach((tournament) => {
    const key = getTournamentDedupeKey(tournament);
    const current = byKey.get(key);
    if (!current || tournamentQualityScore(tournament) >= tournamentQualityScore(current)) {
      byKey.set(key, tournament);
    }
  });

  return Array.from(byKey.values()).sort((left, right) =>
    String(left.subEventName || left.title || left.name).localeCompare(String(right.subEventName || right.title || right.name))
  );
}

function buildEntrants({ event, teams, registrations }) {
  const eventId = String(event?.id || '');
  const eventTeams = teams
    .filter((team) => String(team.eventId) === eventId)
    .map((team, index) => ({
      id: team.id,
      name: team.name,
      type: 'team',
      source: 'teams',
      seed: index + 1,
      members: team.members || [],
    }));

  if (eventTeams.length > 0) {
    return normalizeEntrants(eventTeams);
  }

  const approvedRegistrations = registrations
    .filter((registration) =>
      String(registration.eventId) === eventId &&
      ['approved', 'submitted'].includes(registration.status)
    )
    .map((registration, index) => ({
      id: registration.id,
      name: registration.teamName || registration.individualDetails?.name || `Entrant ${index + 1}`,
      type: registration.registrationType || 'participant',
      source: 'registrations',
      seed: index + 1,
    }));

  if (approvedRegistrations.length > 0) {
    return normalizeEntrants(approvedRegistrations);
  }

  const contestants = Array.isArray(event?.contestants)
    ? event.contestants
        .filter((c) => c.name)
        .map((contestant, index) => ({
          id: contestant.id || `${event.id}-c-${index + 1}`,
          name: contestant.name,
          type: contestant.type || 'participant',
          source: 'event',
          seed: index + 1,
        }))
    : [];

  if (contestants.length > 0) {
    return normalizeEntrants(contestants);
  }

  // Nothing to seed a bracket with yet. The entrant list shows its empty
  // state so the organizer adds real teams, registrations, or contestants.
  return [];
}

export default function OrganizerBracket() {
  const { user } = useAuthStore();
  const {
    tournaments: allTournaments,
    fetchTournaments,
    updateMatchDraft,
    saveMatchResult,
    generateBracket,
    undoLastResult,
    replaceEntrants,
    finalizeTournament,
  } = useTournamentStore();
  const { events, fetchEvents, updateEvent, loading } = useEventStore();
  // Brackets are public, so the store holds every organizer's. This page only
  // ever works with the brackets of this organizer's own events.
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const tournaments = useMemo(() => {
    const owned = new Set(events.map((event) => String(event.id)));
    return allTournaments.filter((tournament) => owned.has(String(tournament.eventId)));
  }, [allTournaments, events]);
  const { teams, fetchTeams } = useTeamStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores, calculateLeaderboard, getScoresForEvent } = useScoreStore();
  const { success, error, info, notifyBracketPublished } = useNotificationStore();
  const [searchParams] = useSearchParams();
  const eventIdFromUrl = searchParams.get('eventId') || '';
  const [selectedEvent, setSelectedEvent] = useRememberedEvent(eventIdFromUrl);
  const [bracketType, setBracketType] = useState('single');
  const [tournamentId, setTournamentId] = useState(null);
  const [seedEntrants, setSeedEntrants] = useState([]);
  const [manualEntrantName, setManualEntrantName] = useState('');
  const [pendingRegenerate, setPendingRegenerate] = useState(null);
  const [seedsOpen, setSeedsOpen] = useState(true);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [confirmingOpenScoring, setConfirmingOpenScoring] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [confirmingGenerate, setConfirmingGenerate] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [drag, setDrag] = useState(null); // { from, over } while a row is being dragged
  const rowRefs = useRef([]);

  useEffect(() => {
    if (!user?.id) return undefined;

    setEventsLoaded(false);
    Promise.resolve(fetchEvents(user.id)).finally(() => setEventsLoaded(true));
    fetchTeams();
    fetchRegistrations();
    fetchTournaments();

    // Fallback only — the realtime subscription below already refreshes on
    // every tournament change; this just covers a silently-dropped socket.
    const intervalId = window.setInterval(() => {
      fetchTournaments();
    }, 30000);

    const unsubscribe = isSupabaseConfigured
      ? subscribeToTable({
          table: 'tournaments',
          onChange: () => fetchTournaments(),
        })
      : () => {};

    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [fetchEvents, fetchTeams, fetchRegistrations, fetchTournaments, user?.id]);

  const eligibleEvents = useMemo(() => {
    // Only events that are actually decided by a bracket. Judged contests
    // have their own pages; listing them here just adds noise. The event the
    // page was opened for stays listed either way.
    const withBracket = new Set(tournaments.map((tournament) => String(tournament.eventId || '')));
    return events.filter((event) => (
      isBracketEvent(event) || withBracket.has(String(event.id)) || String(event.id) === String(selectedEvent)
    ));
  }, [events, selectedEvent, tournaments]);

  useEffect(() => {
    if (!selectedEvent || !eventsLoaded) return;
    const remembered = events.find((event) => String(event.id) === String(selectedEvent));
    // Not one of this organizer's events (an old link, or left over from another account).
    if (!remembered) {
      const firstBracketEvent = events.find((event) => isBracketEvent(event));
      setSelectedEvent(firstBracketEvent ? String(firstBracketEvent.id) : '');
      return;
    }
    if (eventIdFromUrl) return;
    const hasBracketHere = tournaments.some((tournament) => String(tournament.eventId) === String(selectedEvent));
    if (remembered && !isBracketEvent(remembered) && !hasBracketHere) {
      const firstBracketEvent = events.find((event) => isBracketEvent(event));
      setSelectedEvent(firstBracketEvent ? String(firstBracketEvent.id) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tournaments, selectedEvent, eventIdFromUrl, eventsLoaded]);

  const selectedEventTournaments = useMemo(
    () => uniqueTournaments(tournaments.filter((tournament) => String(tournament.eventId) === String(selectedEvent))),
    [selectedEvent, tournaments]
  );
  const currentTournament =
    selectedEventTournaments.find((tournament) => String(tournament.id) === String(tournamentId)) ||
    selectedEventTournaments[0] ||
    null;
  const currentEvent =
    eligibleEvents.find((event) => String(event.id) === String(selectedEvent)) ||
    (currentTournament
      ? {
          id: currentTournament.eventId,
          title: currentTournament.title || currentTournament.name || 'Tournament',
          eventType: 'tournament',
          type: 'tournament',
          contestants: currentTournament.entrantSnapshot || currentTournament.teams || [],
        }
      : null);
  const performanceCapable = isPerformanceCapableEvent(currentEvent);
  const performanceMode = isPointsSystemEvent(currentEvent);

  useEffect(() => {
    if (!selectedEvent || !performanceMode) return;
    fetchScores(selectedEvent);
  }, [fetchScores, performanceMode, selectedEvent]);

  useEffect(() => {
    if (selectedEvent || tournaments.length === 0) return;
    const firstTournament = uniqueTournaments(tournaments).find((tournament) => tournament.eventId);
    if (!firstTournament) return;
    setSelectedEvent(String(firstTournament.eventId));
    setTournamentId(firstTournament.id);
    setBracketType(firstTournament.bracketType || 'single');
  }, [selectedEvent, tournaments]);

  useEffect(() => {
    if (!selectedEvent) {
      setTournamentId(null);
      return;
    }

    if (selectedEventTournaments.length === 0) return;
    const selectedTournamentStillVisible = selectedEventTournaments.some(
      (tournament) => String(tournament.id) === String(tournamentId)
    );
    if (!selectedTournamentStillVisible) {
      const firstTournament = selectedEventTournaments[0];
      setTournamentId(firstTournament.id);
      setBracketType(firstTournament.bracketType || 'single');
    }
  }, [selectedEvent, selectedEventTournaments, tournamentId]);

  // The seed list is only re-read from saved data when that data actually
  // changes. The page refetches in the background every few seconds, and
  // re-reading on every refetch would throw away a shuffle the organizer
  // hasn't rebuilt the bracket with yet.
  const idsOf = (list) => (Array.isArray(list) ? list.map((entry) => String(entry?.id)).join(',') : '');
  const seedSourceKey = [
    currentTournament?.id || '',
    currentTournament?.bracketType || '',
    idsOf(currentTournament?.entrantSnapshot),
    idsOf(currentTournament?.teams),
    currentEvent?.id || '',
    idsOf(currentEvent?.contestants),
    idsOf(teams.filter((team) => String(team.eventId) === String(currentEvent?.id))),
    idsOf(registrations.filter((registration) => String(registration.eventId) === String(currentEvent?.id))),
  ].join('|');

  useEffect(() => {
    if (currentTournament?.entrantSnapshot?.length > 0) {
      setSeedEntrants(normalizeEntrants(currentTournament.entrantSnapshot));
      setBracketType(currentTournament.bracketType || 'single');
      setTournamentId(currentTournament.id);
      return;
    }

    if (currentTournament?.teams?.length > 0) {
      setSeedEntrants(normalizeEntrants(currentTournament.teams));
      setBracketType(currentTournament.bracketType || 'single');
      setTournamentId(currentTournament.id);
      return;
    }

    if (!currentEvent) {
      setSeedEntrants([]);
      return;
    }

    const nextEntrants = buildEntrants({
      event: currentEvent,
      teams,
      registrations,
    });

    setSeedEntrants(nextEntrants);
    setBracketType(currentEvent.bracketType || currentEvent.tournamentFormat || 'single');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedSourceKey]);

  const seedSummary = useMemo(
    () =>
      seedEntrants.map((entrant, index) => ({
        ...entrant,
        seed: index + 1,
      })),
    [seedEntrants]
  );

  // Group Stage + Knockout needs enough entrants for two groups.
  const canGenerate = seedSummary.length >= (bracketType === 'group-knockout' ? 4 : 2);
  const performanceScores = useMemo(
    () => (currentEvent ? getScoresForEvent(currentEvent.id) : []),
    [currentEvent, getScoresForEvent, scores]
  );
  const performanceLeaderboard = useMemo(
    () => (currentEvent ? calculateLeaderboard(currentEvent.id, currentEvent.criteria || []) : []),
    [calculateLeaderboard, currentEvent, scores]
  );

  const liveScoringSummary = {
    matches: currentTournament?.matches?.length || 0,
    entrants: seedSummary.length,
    submissions: performanceScores.length,
    leader: performanceLeaderboard[0]?.contestantName || 'TBD',
  };

  const moveEntrant = (index, direction) => {
    setSeedEntrants((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeEntrants(next.map((entrant, position) => ({ ...entrant, seed: position + 1 })));
    });
  };

  // Drop a row onto another position.
  const reorderEntrant = (from, to) => {
    setSeedEntrants((current) => {
      if (from === to || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return normalizeEntrants(next.map((entrant, position) => ({ ...entrant, seed: position + 1 })));
    });
  };

  // Pointer events rather than HTML drag-and-drop, so it works by touch on a
  // phone as well as with a mouse. The grip also takes the arrow keys.
  const rowIndexAt = (clientY) => {
    let found = null;
    rowRefs.current.forEach((node, index) => {
      if (!node) return;
      const box = node.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) found = index;
    });
    return found;
  };
  const gripProps = (index) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ from: index, over: index });
    },
    onPointerMove: (event) => {
      if (!drag) return;
      const over = rowIndexAt(event.clientY);
      if (over !== null && over !== drag.over) setDrag({ ...drag, over });
    },
    onPointerUp: () => {
      if (!drag) return;
      reorderEntrant(drag.from, drag.over);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (event) => {
      if (event.key === 'ArrowUp') { event.preventDefault(); moveEntrant(index, -1); }
      if (event.key === 'ArrowDown') { event.preventDefault(); moveEntrant(index, 1); }
    },
  });

  const randomizeSeeds = () => {
    setSeedEntrants((current) => {
      const next = [...current];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      }
      return normalizeEntrants(next.map((entrant, position) => ({ ...entrant, seed: position + 1 })));
    });
    info('Order shuffled.');
  };

  const resetSeeds = () => {
    if (!currentEvent) return;
    setSeedEntrants(buildEntrants({ event: currentEvent, teams, registrations }));
    info('Order reset from the latest event data.');
  };

  const addManualEntrant = () => {
    const name = manualEntrantName.trim();
    if (!name) {
      error('Enter a team or participant name first.');
      return;
    }

    setSeedEntrants((current) =>
      normalizeEntrants([
        ...current,
        {
          id: `manual-${Date.now()}`,
          name,
          type: 'manual',
          source: 'manual',
          seed: current.length + 1,
        },
      ])
    );
    setManualEntrantName('');
    success('Manual entrant added.');
  };

  const removeEntrant = (entrantId) => {
    setSeedEntrants((current) =>
      normalizeEntrants(
        current
          .filter((entrant) => String(entrant.id) !== String(entrantId))
          .map((entrant, index) => ({ ...entrant, seed: index + 1 }))
      )
    );
  };

  const handleGenerate = async (force = false) => {
    if (!selectedEvent || !currentEvent) {
      error('Select an event first.');
      return;
    }

    if (bracketType === 'double') {
      error('Double elimination is still being built. Use single elimination or round robin for now.');
      return;
    }

    if (!canGenerate) {
      error('At least two entrants are required to generate a bracket.');
      return;
    }

    const existingTournament = currentTournament || (await ensureTournamentAutomation(
      {
        ...currentEvent,
        bracketType,
      },
      seedSummary
    ));

    if (!existingTournament) {
      error('Unable to prepare a tournament record.');
      return;
    }

    // A bye is filled in by the bracket itself, not a recorded result, so it
    // doesn't count as something the organizer would lose.
    const tournamentHasResults = (existingTournament.matches || []).some((match) =>
      ['completed', 'in-progress'].includes(match.status)
    );

    if (tournamentHasResults && !force) {
      setPendingRegenerate(existingTournament);
      return;
    }

    await commitGenerate(existingTournament);
  };

  // Every (re)build of the bracket goes through one confirmation first.
  const requestGenerate = () => {
    if (!selectedEvent || !currentEvent) {
      error('Select an event first.');
      return;
    }
    if (!canGenerate) {
      error(`At least ${minimumEntrants} entrants are required for this format.`);
      return;
    }
    setConfirmingGenerate(true);
  };

  const commitGenerate = async (existingTournament) => {
    try {
      await replaceEntrants(existingTournament.id, seedSummary);
      const generated = await generateBracket(existingTournament.id, {
        entrants: seedSummary,
        force: true,
      });

      if (!generated) {
        error('The bracket could not be built.');
        return;
      }

      setTournamentId(existingTournament.id);
      await fetchTournaments(currentEvent.id);
      success(isBracketPublic(currentEvent)
        ? 'Bracket built. Participants and the public can see it now.'
        : 'Bracket built. It becomes visible to the public once the event is approved.');
      if (isBracketPublic(currentEvent)) {
        notifyBracketPublished(generated, currentEvent).catch(() => {});
      }
    } catch (generateError) {
      error(String(generateError?.message || 'The bracket could not be built.'));
    }
  };

  const handleSaveMatch = async (match) => {
    if (!currentTournament) return;
    try {
      await saveMatchResult(currentTournament.id, match.id);
      success(`Saved ${match.team1?.name || 'TBD'} vs ${match.team2?.name || 'TBD'}.`);
    } catch (saveError) {
      error(String(saveError?.message || 'Unable to save match result.'));
    }
  };

  const handleScoreFieldChange = async (matchId, field, value) => {
    if (!currentTournament) return;
    try {
      await updateMatchDraft(currentTournament.id, matchId, field, value);
    } catch (draftError) {
      error(String(draftError?.message || 'Unable to update score draft.'));
    }
  };

  const handleAutoAdvanceMatch = async (match) => {
    if (!currentTournament || !match) return;

    try {
      await saveMatchResult(currentTournament.id, match.id);
      info(`${match.team1?.name || 'Entrant 1'} vs ${match.team2?.name || 'Entrant 2'} auto-advanced to the next round.`);
    } catch (saveError) {
      error(String(saveError?.message || 'Unable to auto-advance this match.'));
    }
  };

  const handlePickWinner = async (match, winnerKey) => {
    if (!currentTournament || !match) return;
    const winnerName = winnerKey === 'score1' ? match.team1?.name : match.team2?.name;
    try {
      await updateMatchDraft(currentTournament.id, match.id, 'score1', winnerKey === 'score1' ? 1 : 0);
      await updateMatchDraft(currentTournament.id, match.id, 'score2', winnerKey === 'score2' ? 1 : 0);
      await saveMatchResult(currentTournament.id, match.id);
      success(`${winnerName || 'Winner'} advances.`);
    } catch (saveError) {
      error(String(saveError?.message || 'Unable to save this result.'));
    }
  };

  const playableMatches = (currentTournament?.matches || []).filter((match) => match.status !== 'bye');
  const completedMatches = playableMatches.filter((match) => match.status === 'completed').length;
  const hasBracket = Boolean(currentTournament) && (currentTournament.matches || []).length > 0;
  const isFinalized = Boolean(currentTournament?.isFinalized);
  const eventStarted = hasEventStarted(currentEvent);
  const eventOver = isEventOver(currentEvent);
  const bracketPublic = isBracketPublic(currentEvent);
  // Seeds can be reshuffled and the bracket rebuilt right up until scoring opens.
  const seedsLocked = isFinalized || (eventStarted && hasBracket);
  // Scores stay closed until the event is approved and scoring is opened here.
  const scoringOpen = isScoringOpen(currentEvent);
  const scoresEditable = hasBracket && !isFinalized && scoringOpen;
  const bracketStage = isFinalized ? 'final' : eventOver ? 'over' : scoringOpen ? 'live' : bracketPublic ? 'ready' : 'seeding';
  const canUndo = scoresEditable && (currentTournament.historyLog || []).length > 0;

  // Whether the list on screen differs from the order the bracket was built from.
  const builtOrder = normalizeEntrants(currentTournament?.entrantSnapshot || []).map((entrant) => String(entrant.id)).join('|');
  const seedsDirty = hasBracket && !seedsLocked && builtOrder !== seedSummary.map((entrant) => String(entrant.id)).join('|');

  // First-round pairings the current order would produce, so the organizer
  // sees who plays whom before building anything.
  const previewMatchups = useMemo(() => {
    if (bracketType !== 'single' || seedSummary.length < 2) return [];
    return generateSingleEliminationBracket(seedSummary).matches
      .filter((match) => Number(match.round) === 1)
      .map((match) => ({ id: match.id, team1: match.team1, team2: match.team2 }));
  }, [bracketType, seedSummary]);

  // The groups the current order would be drawn into.
  const previewGroups = useMemo(() => {
    if (bracketType !== 'group-knockout' || seedSummary.length < GROUP_KNOCKOUT_MIN_ENTRANTS) return [];
    const groups = new Map();
    generateGroupKnockoutBracket(seedSummary).matches
      .filter((match) => match.stage === 'group')
      .forEach((match) => {
        if (!groups.has(match.group)) groups.set(match.group, new Map());
        [match.team1, match.team2].forEach((team) => groups.get(match.group).set(String(team.id), team));
      });
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, members]) => ({ label, teams: Array.from(members.values()).sort((left, right) => left.seed - right.seed) }));
  }, [bracketType, seedSummary]);
  const minimumEntrants = bracketType === 'group-knockout' ? GROUP_KNOCKOUT_MIN_ENTRANTS : 2;
  const canFinalize = hasBracket && !isFinalized && playableMatches.length > 0 && completedMatches === playableMatches.length;
  const championName = currentTournament?.champion?.name || '';
  const schedule = describeBracketSchedule(currentEvent, currentTournament);
  const formatLabel = BRACKET_FORMAT_LABELS[currentTournament?.bracketType || bracketType] || 'Single elimination';

  // Once a bracket exists the seeds are settled, so the list starts folded
  // away and the bracket itself gets the space.
  useEffect(() => {
    setSeedsOpen(!hasBracket);
  }, [currentTournament?.id, hasBracket]);

  const runBracketAction = async (key, action, doneMessage) => {
    setBusyAction(key);
    try {
      await action();
      if (doneMessage) success(doneMessage);
    } catch (actionError) {
      error(String(actionError?.message || 'That action could not be completed.'));
    } finally {
      setBusyAction('');
    }
  };

  const handleUndo = () => {
    setConfirmingUndo(false);
    runBracketAction('undo', () => undoLastResult(currentTournament.id), 'Last result undone.');
  };

  const handleFinalize = () => {
    setConfirmingFinalize(false);
    runBracketAction('finalize', async () => {
      const finalized = await finalizeTournament(currentTournament.id);
      // When this was the event's last open bracket, the event itself is done.
      const eventBrackets = useTournamentStore.getState().tournaments.filter(
        (tournament) => String(tournament.eventId) === String(finalized.eventId)
      );
      if (eventBrackets.every((tournament) => tournament.isFinalized) && events.some((event) => String(event.id) === String(finalized.eventId))) {
        await updateEvent(finalized.eventId, { status: 'completed', scoringActive: false });
      }
    }, 'Scores finalized. This bracket can no longer be changed.');
  };

  // Opening scoring starts the event: scores can be entered, the public
  // bracket turns live, and the matchup order is locked from then on.
  // An event closed before its bracket was finalized has no champion, so the
  // same action reopens it instead of leaving it stuck read-only.
  const canOpenScoring = hasBracket && !isFinalized && !scoringOpen && bracketPublic && !seedsDirty;
  const openScoringHint = !bracketPublic
    ? 'The event needs to be approved before scoring can open'
    : seedsDirty
      ? 'Rebuild the bracket with the new order (or reset it) before opening scoring'
      : eventOver
        ? 'Reopen the event so the remaining games can be scored'
        : 'Start entering scores and show the bracket as live to the public';

  const handleOpenScoring = () => {
    setConfirmingOpenScoring(false);
    runBracketAction(
      'open',
      () => updateEvent(currentEvent.id, { scoringActive: true, status: 'active' }),
      eventOver ? 'Scoring is open again. You can finish the remaining games.' : 'Scoring is open. The bracket is now live for the public.'
    );
  };

  const guideStep = !selectedEvent ? 1 : !hasBracket ? 2 : isFinalized ? 6 : canFinalize ? 5 : scoringOpen ? 4 : 3;

  const seedsCollapsible = !performanceMode && hasBracket;
  const seedsEditable = performanceMode || !seedsLocked;
  const seedPanel = (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => seedsCollapsible && setSeedsOpen((open) => !open)}
          aria-expanded={seedsOpen}
          disabled={!seedsCollapsible}
          style={{ display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: seedsCollapsible ? 'pointer' : 'default', minWidth: 0 }}
        >
          {seedsCollapsible && (
            <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#eff6ff', color: '#1d4ed8', flexShrink: 0 }}>
              <i className={seedsOpen ? 'bi bi-chevron-down' : 'bi bi-chevron-right'} />
            </span>
          )}
          <span>
            <span style={{ display: 'block', color: '#0f172a', fontSize: 16, fontWeight: 800, marginBottom: 2 }}>
              {performanceMode ? 'Contestant Pool' : 'Matchup Order'}
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', borderRadius: 999, padding: '2px 9px' }}>{seedSummary.length}</span>
            </span>
            <span style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
              {performanceMode
                ? 'Contestants come from approved registrations and event contestants.'
                : isFinalized
                  ? 'The order the bracket was built from. It is final.'
                  : seedsLocked
                    ? 'The order the bracket was built from. It was locked when scoring opened.'
                    : hasBracket
                      ? 'Drag a team to change who plays whom, then rebuild the bracket. Open until you open scoring.'
                      : 'This order decides who plays whom in the first round. Drag a team to move it, or shuffle them all.'}
            </span>
          </span>
        </button>
        {/* Always shown, so it is clear where shuffling happens — it is just
            switched off once the order can no longer change. */}
        {!performanceMode && seedsOpen && !seedsEditable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {isFinalized ? 'Scores are finalized' : eventOver ? 'Event is completed' : 'Scoring is open'}
            </span>
            <button
              disabled
              title={isFinalized ? 'The scores are finalized, so the order can no longer change' : 'Shuffling is only available before scoring opens'}
              style={{ ...secondaryButtonStyle, opacity: 0.5, cursor: 'not-allowed' }}
            >
              <i className="bi bi-shuffle" /> Shuffle
            </button>
          </div>
        )}
        {!performanceMode && seedsOpen && seedsEditable && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={randomizeSeeds} disabled={seedSummary.length < 2} style={{ ...secondaryButtonStyle, opacity: seedSummary.length < 2 ? 0.5 : 1 }}>
              <i className="bi bi-shuffle" /> Shuffle
            </button>
            <button onClick={resetSeeds} style={{ ...secondaryButtonStyle, background: '#ffffff', borderColor: '#e2e8f0', color: '#475569' }}>
              <i className="bi bi-arrow-counterclockwise" /> Reset
            </button>
          </div>
        )}
      </div>

      {seedsOpen && (
        <>
          {seedSummary.length === 0 ? (
            <div style={{ ...emptyStateStyle, marginTop: 16 }}>
              {loading ? 'Loading entrants...' : 'No entrants yet. Add teams or registrations to the event, or add one manually below.'}
            </div>
          ) : !seedsEditable ? (
            // Read-only once the event is under way: a compact grid, not a long list.
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, marginTop: 16 }}>
              {seedSummary.map((entrant, index) => (
                <div key={entrant.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 0 }}>
                  <span style={{ ...seedBadgeStyle, width: 26, height: 26, fontSize: 12 }}>{index + 1}</span>
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, overflowWrap: 'anywhere' }}>{entrant.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {seedSummary.map((entrant, index) => {
                const dragging = drag?.from === index;
                const dropTarget = drag && drag.over === index && drag.from !== index;
                return (
                  <div
                    key={entrant.id}
                    ref={(node) => { rowRefs.current[index] = node; }}
                    style={{
                      ...entrantRowStyle,
                      opacity: dragging ? 0.45 : 1,
                      background: dropTarget ? '#eff6ff' : entrantRowStyle.background,
                      borderColor: dropTarget ? '#60a5fa' : '#e2e8f0',
                      boxShadow: dropTarget ? `inset 0 ${drag.over < drag.from ? 3 : -3}px 0 #2563eb` : 'none',
                    }}
                  >
                    {!performanceMode && (
                      <button
                        type="button"
                        {...gripProps(index)}
                        aria-label={`Move ${entrant.name}. Drag, or use the up and down arrow keys.`}
                        title="Drag to move"
                        style={{ width: 28, height: 36, border: 'none', background: 'transparent', color: '#94a3b8', cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', fontSize: 18, flexShrink: 0, padding: 0 }}
                      >
                        <i className="bi bi-grip-vertical" />
                      </button>
                    )}
                    <span style={seedBadgeStyle}>{index + 1}</span>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{entrant.name}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>
                        <span style={{ textTransform: 'capitalize' }}>{entrant.type}</span> · {ENTRANT_SOURCE_LABELS[entrant.source] || entrant.source}
                      </div>
                    </div>
                    <button onClick={() => removeEntrant(entrant.id)} aria-label={`Remove ${entrant.name}`} title="Remove" style={{ ...iconButtonStyle, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', flexShrink: 0 }}>
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {seedsEditable && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <input
                value={manualEntrantName}
                onChange={(event) => setManualEntrantName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') addManualEntrant(); }}
                placeholder="Add a team or participant by name"
                aria-label="Name to add"
                style={{ ...controlStyle, flex: 1, minWidth: 220 }}
              />
              <button onClick={addManualEntrant} style={secondaryButtonStyle}>
                <i className="bi bi-plus-lg" /> Add
              </button>
            </div>
          )}

          {!performanceMode && seedsEditable && previewGroups.length > 0 && (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: '#f8fbff', border: '1px solid #dbeafe' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Groups with this order
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                Everyone plays everyone in their group. The top two of each group go through to the knockout.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {previewGroups.map((group) => (
                  <div key={group.label} style={{ padding: '10px 12px', borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>Group {group.label}</div>
                    {group.teams.map((team) => (
                      <div key={team.id} style={{ fontSize: 13, color: '#0f172a', padding: '2px 0', overflowWrap: 'anywhere' }}>{team.name}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!performanceMode && seedsEditable && previewMatchups.length > 0 && (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: '#f8fbff', border: '1px solid #dbeafe' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Who plays whom in the first round
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {previewMatchups.map((match, index) => (
                  <div key={match.id} style={{ padding: '9px 12px', borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a' }}>
                    <span style={{ color: '#94a3b8', fontWeight: 700, marginRight: 8 }}>Game {index + 1}</span>
                    {match.team1 && match.team2
                      ? <><strong>{match.team1.name}</strong> <span style={{ color: '#94a3b8' }}>vs</span> <strong>{match.team2.name}</strong></>
                      : <><strong>{(match.team1 || match.team2)?.name}</strong> <span style={{ color: '#64748b' }}>— no game, goes straight to the next round</span></>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!performanceMode && seedsEditable && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16, padding: '12px 14px', borderRadius: 12, background: seedsDirty || hasResults ? '#fffbeb' : '#f8fafc', border: `1px solid ${seedsDirty || hasResults ? '#fde68a' : '#e2e8f0'}` }}>
              <span style={{ fontSize: 13, color: seedsDirty || hasResults ? '#92400e' : '#475569', lineHeight: 1.5 }}>
                {hasResults
                  ? <><i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />Rebuilding clears the match scores already recorded.</>
                  : seedsDirty
                    ? <><i className="bi bi-info-circle" style={{ marginRight: 6 }} />You changed the order. Rebuild the bracket to apply it.</>
                    : hasBracket
                      ? 'The bracket matches this order. You can reshuffle and rebuild until you open scoring.'
                      : 'Happy with the matchups? Build the bracket. You can still change it until you open scoring.'}
              </span>
              <button
                onClick={requestGenerate}
                disabled={!canGenerate}
                style={{ ...(seedsDirty || !hasBracket ? primaryButtonStyle : secondaryButtonStyle), opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}
              >
                <i className={hasBracket ? 'bi bi-arrow-repeat' : 'bi bi-diagram-3'} style={{ marginRight: 8 }} />
                {hasBracket ? 'Rebuild Bracket' : 'Build Bracket'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <DashboardLayout
      title={performanceMode ? 'Points Leaderboard Management' : 'Tournament Bracket Management'}
      subtitle={performanceMode ? 'Track judge scores and rank contestants by total points' : 'Set who plays whom, build the bracket, and record match results'}
    >
      <ConfirmDialog
        open={Boolean(pendingRegenerate)}
        title="This bracket already has results"
        message="Regenerating will reset all recorded match scores and progress for this bracket. This cannot be undone. Continue?"
        confirmLabel="Regenerate Anyway"
        onCancel={() => setPendingRegenerate(null)}
        onConfirm={() => {
          const target = pendingRegenerate;
          setPendingRegenerate(null);
          commitGenerate(target);
        }}
      />
      <ConfirmDialog
        open={confirmingGenerate}
        danger={false}
        title={hasBracket ? 'Rebuild the bracket with this order?' : 'Build the bracket with this order?'}
        message={`${previewMatchups.length > 0
          ? `First round: ${previewMatchups.map((match) => (match.team1 && match.team2 ? `${match.team1.name} vs ${match.team2.name}` : `${(match.team1 || match.team2)?.name} gets a bye`)).join(' · ')}. `
          : ''}You can still reshuffle and rebuild it any time before you open scoring.`}
        confirmLabel={hasBracket ? 'Rebuild Bracket' : 'Build Bracket'}
        onCancel={() => setConfirmingGenerate(false)}
        onConfirm={() => { setConfirmingGenerate(false); handleGenerate(false); }}
      />
      <ConfirmDialog
        open={confirmingFinalize}
        title="Finalize the scores for good?"
        message={`This permanently freezes every match score and the champion of "${currentTournament ? getTournamentLabel(currentTournament, currentEvent) : ''}". After this nobody can edit, undo, rebuild or delete it — not you, not an admin. This cannot be undone.`}
        confirmLabel="Finalize Scores"
        requireText="FINALIZE"
        onCancel={() => setConfirmingFinalize(false)}
        onConfirm={handleFinalize}
      />
      <ConfirmDialog
        open={confirmingOpenScoring}
        danger={false}
        title={eventOver ? 'Reopen scoring for this event?' : 'Open scoring for this event?'}
        message={eventOver
          ? 'The event was closed before this bracket was finished. Reopening sets the event back to in progress so you can enter the remaining scores and finalize a champion.'
          : 'You can start entering match scores, and the public will see the bracket as live. The matchups are locked from here: you will no longer be able to shuffle the teams or rebuild the bracket.'}
        confirmLabel={eventOver ? 'Reopen Scoring' : 'Open Scoring'}
        onCancel={() => setConfirmingOpenScoring(false)}
        onConfirm={handleOpenScoring}
      />
      <ConfirmDialog
        open={confirmingUndo}
        title="Undo the last result?"
        message="The most recently saved match score will be removed and that match reopened. Any team it advanced goes back a round."
        confirmLabel="Undo Result"
        onCancel={() => setConfirmingUndo(false)}
        onConfirm={handleUndo}
      />
      <div style={{ display: 'grid', gap: 20 }}>
        {!performanceMode && (
          <GuideBanner
            step={guideStep}
            steps={[
              'Pick the event you want a bracket for',
              'Shuffle or drag the teams into order, then build the bracket',
              'Open scoring once the event is approved and games are about to start',
              'Enter match scores as games finish',
              'Finalize the scores once every game is done',
            ]}
          />
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <LabeledControl label="Event">
            <EventPicker
              events={eligibleEvents}
              value={selectedEvent}
              onChange={(nextEventId) => {
                const firstTournament = uniqueTournaments(tournaments).find((tournament) => String(tournament.eventId) === String(nextEventId));
                setSelectedEvent(nextEventId);
                setTournamentId(firstTournament?.id || null);
                setBracketType(firstTournament?.bracketType || 'single');
              }}
            />
          </LabeledControl>
          {!performanceMode && selectedEventTournaments.length > 1 && (
            <LabeledControl label="Bracket (this event has more than one)">
              <select
                value={currentTournament?.id || ''}
                onChange={(event) => {
                  const nextTournament = selectedEventTournaments.find((tournament) => String(tournament.id) === String(event.target.value));
                  setTournamentId(nextTournament?.id || null);
                  setBracketType(nextTournament?.bracketType || 'single');
                }}
                style={{ ...controlStyle, width: 280 }}
              >
                {selectedEventTournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {getTournamentLabel(tournament, currentEvent)}
                  </option>
                ))}
              </select>
            </LabeledControl>
          )}
          {!performanceMode ? (
            <>
              {!hasBracket && (
                <button
                  onClick={requestGenerate}
                  disabled={!canGenerate || seedsLocked}
                  title={seedsLocked ? 'Scoring is already open' : canGenerate ? undefined : 'Add at least two entrants first'}
                  style={{ ...primaryButtonStyle, opacity: canGenerate && !seedsLocked ? 1 : 0.5, cursor: canGenerate && !seedsLocked ? 'pointer' : 'not-allowed' }}
                >
                  <i className="bi bi-diagram-3" style={{ marginRight: 8 }} />
                  Build Bracket
                </button>
              )}
            </>
          ) : performanceCapable ? null : (
            <div style={modeBadgeStyle}>
              <i className="bi bi-bar-chart-line" />
              {getScoringModeLabel(currentEvent)}
            </div>
          )}
        </div>

        {performanceMode ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <div style={liveScoreCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
                <div>
                  <p style={{ margin: 0, color: '#dbeafe', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em' }}>Live Scoring</p>
                  <h3 style={{ margin: '8px 0 0', color: '#ffffff', fontSize: 20, fontWeight: 800 }}>Current event momentum</h3>
                </div>
                <span style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(59,130,246,0.18)', color: '#bfdbfe', fontWeight: 700, fontSize: 12 }}>Live</span>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {[
                  ['Entrants', liveScoringSummary.entrants],
                  ['Matches', liveScoringSummary.matches],
                  ['Submissions', liveScoringSummary.submissions],
                  ['Leading', liveScoringSummary.leader],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.08)' }}>
                    <span style={{ color: '#c7d2fe', fontSize: 13 }}>{label}</span>
                    <span style={{ color: '#eff6ff', fontSize: 18, fontWeight: 800 }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, padding: '16px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#93c5fd' }}>This square panel highlights the event's live scoring state and keeps the current contest visible while you manage brackets.</p>
              </div>
            </div>
          </div>
        ) : null}

        {performanceMode ? (
          <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ color: '#0f172a', fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Points System</h3>
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No bracket will be generated for this event. Rankings come from submitted judge scores.</p>
              </div>
              <button onClick={() => fetchScores(currentEvent?.id)} style={secondaryButtonStyle}>
                <i className="bi bi-arrow-clockwise" /> Refresh scores
              </button>
            </div>

            <div style={statGridStyle}>
              <ScoreStat label="Scoring mode" value={getScoringModeLabel(currentEvent)} />
              <ScoreStat label="Champion rule" value={getChampionRuleLabel(currentEvent)} />
              <ScoreStat label="Point scale" value={`${currentEvent?.pointScale || 100}-point scale`} />
              <ScoreStat label="Submitted scores" value={performanceScores.length} />
            </div>
          </div>
        ) : null}

        {performanceMode && seedPanel}

        {!performanceMode && currentTournament ? (
          <BracketStatusBar
            title={getTournamentLabel(currentTournament, currentEvent)}
            hasBracket={hasBracket}
            stage={bracketStage}
            isPublic={bracketPublic}
            eventStatus={currentEvent?.status || 'draft'}
            formatLabel={formatLabel}
            schedule={schedule}
            finalizedAt={currentTournament.finalizedAt}
            teams={seedSummary.length}
            completed={completedMatches}
            total={playableMatches.length}
            champion={championName}
            canUndo={canUndo}
            canFinalize={canFinalize}
            scoringOpen={scoringOpen}
            canOpenScoring={canOpenScoring}
            openScoringHint={openScoringHint}
            onOpenScoring={() => setConfirmingOpenScoring(true)}
            busyAction={busyAction}
            onUndo={() => setConfirmingUndo(true)}
            onFinalize={() => setConfirmingFinalize(true)}
          />
        ) : null}

        {performanceMode ? (
          <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ color: '#0f172a', fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Live Points Leaderboard</h3>
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Highest average score is ranked first.</p>
              </div>
              <div style={{ color: '#2563eb', fontSize: 13, fontWeight: 800 }}>
                {performanceLeaderboard.length} ranked
              </div>
            </div>

            {performanceLeaderboard.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#0f172a' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12 }}>
                      {['Rank', 'Contestant', 'Average score', 'Submissions', 'Status'].map((header) => (
                        <th key={header} style={{ padding: '12px 10px', borderBottom: '1px solid #dbeafe' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {performanceLeaderboard.map((row) => (
                      <tr key={row.contestantId}>
                        <td style={{ padding: '14px 10px', borderBottom: '1px solid #eff6ff', fontWeight: 900, color: row.rank === 1 ? '#2563eb' : '#475569' }}>
                          #{row.rank}
                        </td>
                        <td style={{ padding: '14px 10px', borderBottom: '1px solid #eff6ff', fontWeight: 800 }}>
                          {row.contestantName}
                        </td>
                        <td style={{ padding: '14px 10px', borderBottom: '1px solid #eff6ff', color: '#2563eb', fontWeight: 900 }}>
                          {row.averageScore}
                        </td>
                        <td style={{ padding: '14px 10px', borderBottom: '1px solid #eff6ff' }}>
                          {row.totalScores}
                        </td>
                        <td style={{ padding: '14px 10px', borderBottom: '1px solid #eff6ff' }}>
                          <span style={row.rank === 1 ? leaderBadgeStyle : statusBadgeStyle}>
                            {row.rank === 1 ? 'Leading' : 'Scored'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyPanelStyle}>
                No scores submitted yet. Once judges score contestants, this page will show the points ranking automatically.
              </div>
            )}
          </div>
        ) : hasBracket ? (
          <LiveBracket
            tournament={currentTournament}
            editable={scoresEditable}
            onScoreChange={handleScoreFieldChange}
            onSaveMatch={handleSaveMatch}
            onAutoAdvanceMatch={handleAutoAdvanceMatch}
            onPickWinner={handlePickWinner}
          />
        ) : (
          <div style={{ ...emptyPanelStyle, textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ fontSize: 30, color: '#93c5fd', marginBottom: 8 }}><i className="bi bi-diagram-3" /></div>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>No bracket yet</div>
            <div style={{ fontSize: 13 }}>
              {!selectedEvent
                ? 'Pick an event above to get started.'
                : canGenerate
                  ? 'Check the matchup order below, then click "Build Bracket".'
                  : 'Add at least two entrants below, then generate the bracket.'}
            </div>
          </div>
        )}

        {!performanceMode && hasBracket && <BracketStandings rows={calculateBracketPlacements(currentTournament)} roundRobin={currentTournament.bracketType === 'round-robin'} />}

        {!performanceMode && seedPanel}

      </div>
    </DashboardLayout>
  );
}

function GuideBanner({ step, steps }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, padding: '16px 20px', boxShadow: '0 12px 32px rgba(37, 99, 235, 0.07)' }}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        How this page works
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {steps.map((text, index) => {
          const stepNumber = index + 1;
          const isDone = stepNumber < step;
          const isActive = stepNumber === step;
          return (
            <div
              key={text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px 8px 8px',
                borderRadius: 999,
                background: isActive ? '#eff6ff' : isDone ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${isActive ? '#93c5fd' : isDone ? '#bbf7d0' : '#e2e8f0'}`,
                flex: '1 1 220px',
                minWidth: 220,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                  background: isActive ? '#2563eb' : isDone ? '#22c55e' : '#cbd5e1',
                  color: '#ffffff',
                }}
              >
                {isDone ? <i className="bi bi-check-lg" /> : stepNumber}
              </span>
              <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? '#1d4ed8' : isDone ? '#15803d' : '#64748b' }}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusChip({ icon, label, tone }) {
  const tones = {
    green: { color: '#047857', background: '#ecfdf5', border: '#a7f3d0' },
    amber: { color: '#b45309', background: '#fffbeb', border: '#fde68a' },
    slate: { color: '#334155', background: '#f1f5f9', border: '#cbd5e1' },
    blue: { color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' },
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', color: tones.color, background: tones.background, border: `1px solid ${tones.border}` }}>
      <i className={`bi ${icon}`} />
      {label}
    </span>
  );
}

const EVENT_STATUS_LABELS = {
  draft: 'a draft',
  pending: 'awaiting approval',
  rejected: 'not approved',
  upcoming: 'upcoming',
  approved: 'approved',
  published: 'published',
  active: 'in progress',
  completed: 'completed',
};

const STAGE_CHIPS = {
  seeding: { icon: 'bi-hourglass-split', label: 'Scoring closed · waiting for approval', tone: 'amber' },
  ready: { icon: 'bi-shuffle', label: 'Scoring not open yet · matchups can still be reshuffled', tone: 'blue' },
  live: { icon: 'bi-broadcast', label: 'Scoring is open · enter scores as games finish', tone: 'green' },
  over: { icon: 'bi-flag-fill', label: 'Event closed · bracket was not finalized', tone: 'amber' },
  final: { icon: 'bi-shield-lock-fill', label: 'Finalized · scores are permanent', tone: 'green' },
};

// The bracket's state at a glance. Who can see it follows the event's status;
// scoring is opened by hand here, which also locks the matchup order.
function BracketStatusBar({
  title, hasBracket, stage, isPublic, eventStatus, formatLabel, schedule, finalizedAt, teams, completed, total, champion,
  canUndo, canFinalize, scoringOpen, canOpenScoring, openScoringHint, onOpenScoring, busyAction, onUndo, onFinalize,
}) {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const finished = total > 0 && completed === total;
  const busy = Boolean(busyAction);
  const statusText = EVENT_STATUS_LABELS[eventStatus] || eventStatus;
  const stageChip = STAGE_CHIPS[stage];

  return (
    <section
      aria-label="Bracket status and actions"
      style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderLeft: `5px solid ${stage === 'final' ? '#10b981' : stage === 'over' ? '#64748b' : '#2563eb'}`, borderRadius: 16, padding: 20, boxShadow: '0 14px 36px rgba(37, 99, 235, 0.10)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Current bracket</div>
          <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 18, fontWeight: 800, overflowWrap: 'anywhere' }}>{title}</h3>
          <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', color: '#475569', fontSize: 13, marginBottom: 12 }}>
            <span><i className="bi bi-diagram-3" style={{ marginRight: 6, color: '#64748b' }} />{formatLabel}</span>
            {schedule.dates && <span><i className="bi bi-calendar-event" style={{ marginRight: 6, color: '#64748b' }} />{schedule.dates}</span>}
            {schedule.times && <span><i className="bi bi-clock" style={{ marginRight: 6, color: '#64748b' }} />{schedule.times}</span>}
            {schedule.venue && <span><i className="bi bi-geo-alt" style={{ marginRight: 6, color: '#64748b' }} />{schedule.venue}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip icon={stageChip.icon} label={stageChip.label} tone={stageChip.tone} />
            <StatusChip
              icon={isPublic ? 'bi-broadcast' : 'bi-eye-slash'}
              label={isPublic ? `Public · event is ${statusText}` : `Hidden · event is ${statusText}`}
              tone={isPublic ? 'green' : 'amber'}
            />
          </div>
        </div>

        {stage !== 'final' && hasBracket && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!scoringOpen && (
              <button
                onClick={onOpenScoring}
                disabled={busy || !canOpenScoring}
                title={openScoringHint}
                style={{ ...toolbarButtonStyle, background: '#2563eb', border: '1px solid #2563eb', color: '#ffffff', opacity: busy || !canOpenScoring ? 0.45 : 1, cursor: busy || !canOpenScoring ? 'not-allowed' : 'pointer' }}
              >
                <i className={busyAction === 'open' ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-broadcast'} />
                {stage === 'over' ? 'Reopen Scoring' : 'Open Scoring'}
              </button>
            )}
            <button
              onClick={onUndo}
              disabled={busy || !canUndo}
              title={canUndo ? 'Reverse the most recently saved match score' : stage === 'over' ? 'The event is completed' : 'No saved result to undo yet'}
              style={{ ...toolbarButtonStyle, background: '#ffffff', borderColor: '#e2e8f0', color: '#475569', opacity: busy || !canUndo ? 0.5 : 1, cursor: busy || !canUndo ? 'not-allowed' : 'pointer' }}
            >
              <i className={busyAction === 'undo' ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-arrow-counterclockwise'} />
              Undo Last Result
            </button>
            <button
              onClick={onFinalize}
              disabled={busy || !canFinalize}
              title={canFinalize ? 'Permanently freeze these results' : 'Every match needs a saved result first'}
              style={{ ...toolbarButtonStyle, background: '#0f172a', border: '1px solid #0f172a', color: '#ffffff', opacity: busy || !canFinalize ? 0.45 : 1, cursor: busy || !canFinalize ? 'not-allowed' : 'pointer' }}
            >
              <i className={busyAction === 'finalize' ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-shield-lock-fill'} />
              Finalize Scores
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 18, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
        <div>
          <div style={statLabelStyle}>Entrants</div>
          <div style={statValueStyle}>{teams}</div>
        </div>
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <div style={statLabelStyle}>Matches played</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={statValueStyle}>{completed} <span style={{ color: '#94a3b8', fontWeight: 700 }}>/ {total}</span></div>
            <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Matches played" style={{ flex: 1, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', minWidth: 60 }}>
              <div style={{ width: `${progress}%`, height: '100%', background: finished ? '#10b981' : '#2563eb' }} />
            </div>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={statLabelStyle}>Champion</div>
          <div style={{ ...statValueStyle, display: 'flex', alignItems: 'center', gap: 8, overflowWrap: 'anywhere' }}>
            {champion ? <><i className="bi bi-trophy-fill" style={{ color: '#f59e0b', fontSize: 16 }} />{champion}</> : <span style={{ color: '#94a3b8', fontWeight: 700 }}>To be decided</span>}
          </div>
        </div>
      </div>

      {stage === 'final' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13 }}>
          <i className="bi bi-shield-lock-fill" />
          <span>
            These results were finalized{finalizedAt ? ` on ${new Date(finalizedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''} and are permanent. Scores can no longer be edited by anyone.
          </span>
        </div>
      ) : canFinalize ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a', fontSize: 13 }}>
          <i className="bi bi-info-circle" />
          Every match has a result. Check the scores, then click "Finalize Scores" to make them permanent.
        </div>
      ) : stage === 'over' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#f1f5f9', color: '#334155', fontSize: 13 }}>
          <i className="bi bi-flag-fill" />
          This event was closed before the bracket was finalized{champion ? '' : ', so there is no champion yet'}. Click "Reopen Scoring" to finish the games.
        </div>
      ) : !isPublic ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
          <i className="bi bi-eye-slash" />
          Scores cannot be entered until the event is approved. Participants and the public will also see this bracket once it is approved.
        </div>
      ) : !scoringOpen && hasBracket ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a', fontSize: 13 }}>
          <i className="bi bi-info-circle" />
          Scoring is not open yet. Click "Open Scoring" when the games are about to start. After that the teams can no longer be shuffled.
        </div>
      ) : null}
    </section>
  );
}

// First to last, for every entrant — not just the finalists.
function BracketStandings({ rows, roundRobin }) {
  if (rows.length === 0) return null;
  const final = rows[0].final;
  return (
    <div style={panelStyle}>
      <h3 style={{ color: '#0f172a', fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>{final ? 'Final Standings' : 'Standings So Far'}</h3>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px' }}>
        {roundRobin
          ? 'Ordered by wins, then score difference.'
          : final
            ? 'Placement follows how far each team went. Teams knocked out in the same round are ordered by how close their last game was.'
            : 'Teams still playing are listed first. Placements are final once every match has been played.'}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #dbeafe', width: 80 }}>Place</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #dbeafe' }}>Team</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #dbeafe', textAlign: 'right' }}>Win–loss</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #dbeafe' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const top = final && row.placement <= 3;
              return (
                <tr key={row.id} style={{ background: top ? '#f8fbff' : undefined }}>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #eff6ff' }}>
                    <span style={{ ...seedBadgeStyle, display: 'inline-grid', background: final && row.placement === 1 ? '#1d4ed8' : '#dbeafe', color: final && row.placement === 1 ? '#ffffff' : '#1d4ed8' }}>
                      {final ? row.placement : '–'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #eff6ff', fontWeight: 700, color: '#0f172a' }}>{row.name}</td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #eff6ff', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#334155' }}>{row.wins}–{row.losses}</td>
                  <td style={{ padding: '11px 12px', borderBottom: '1px solid #eff6ff', color: '#475569' }}>
                    {!final && row.eliminatedRound === null
                      ? 'Still playing'
                      : final && row.placement === 1
                        ? 'Champion'
                        : row.eliminatedRound
                          ? `Eliminated in round ${row.eliminatedRound}`
                          : final && row.group
                            ? `Out in the group stage (Group ${row.group})`
                          : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabeledControl({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </div>
  );
}

function ScoreStat({ label, value }) {
  return (
    <div style={scoreStatStyle}>
      <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 900 }}>{value || '-'}</div>
    </div>
  );
}

const controlStyle = {
  padding: '11px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
  boxShadow: '0 6px 18px rgba(37, 99, 235, 0.06)',
};

const primaryButtonStyle = {
  padding: '11px 20px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  border: 'none',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
  boxShadow: '0 10px 24px rgba(37, 99, 235, 0.18)',
};

const secondaryButtonStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

const iconButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  cursor: 'pointer',
};

const modeBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '11px 16px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 800,
  fontSize: 13,
};

const panelStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 12px 32px rgba(37, 99, 235, 0.07)',
};

const liveScoreCardStyle = {
  padding: 24,
  borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(59,130,246,0.93), rgba(30,64,175,0.94))',
  border: '1px solid rgba(165,180,252,0.22)',
  color: '#eef2ff',
  minHeight: 220,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const statGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 12,
};

const scoreStatStyle = {
  padding: '16px 18px',
  borderRadius: 14,
  background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(14,165,233,0.06))',
  border: '1px solid #bfdbfe',
};

// Wraps instead of using fixed columns, so the row stays usable on a phone.
const entrantRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
};

const seedBadgeStyle = {
  width: 32,
  height: 32,
  borderRadius: 10,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  background: '#dbeafe',
  color: '#1d4ed8',
  fontWeight: 800,
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
};

const toolbarButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '11px 16px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const statLabelStyle = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

const statValueStyle = {
  color: '#0f172a',
  fontSize: 18,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
};

const statusBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  background: '#eff6ff',
  color: '#2563eb',
  fontSize: 12,
  fontWeight: 800,
};

const leaderBadgeStyle = {
  ...statusBadgeStyle,
  background: '#dbeafe',
  color: '#1d4ed8',
};

const emptyStateStyle = {
  color: '#64748b',
  fontSize: 13,
  padding: 14,
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px dashed #bfdbfe',
};

const emptyPanelStyle = {
  background: '#ffffff',
  border: '1px dashed #bfdbfe',
  borderRadius: 16,
  padding: 24,
  color: '#64748b',
};

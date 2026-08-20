import { useEffect, useMemo, useState } from 'react';
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
import { normalizeEntrants } from '../../utils/bracketEngine';

const demoModeEnabled = import.meta.env.VITE_DEMO_MODE !== 'false';
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
  demo: 'Demo placeholder',
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

function buildEntrants({ event, teams, registrations, allowDemo = true }) {
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

  if (!allowDemo || !demoModeEnabled) {
    return [];
  }

  return normalizeEntrants(
    Array.from({ length: 8 }, (_, index) => ({
      id: `${event.id}-demo-${index + 1}`,
      name: `Demo Team ${index + 1}`,
      type: 'team',
      source: 'demo',
      seed: index + 1,
    }))
  );
}

export default function OrganizerBracket() {
  const { user } = useAuthStore();
  const {
    tournaments,
    fetchTournaments,
    updateMatchDraft,
    saveMatchResult,
    generateBracket,
    publishTournament,
    lockTournament,
    undoLastResult,
    replaceEntrants,
  } = useTournamentStore();
  const { events, fetchEvents, updateEvent, loading } = useEventStore();
  const { teams, fetchTeams } = useTeamStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores, calculateLeaderboard, getScoresForEvent } = useScoreStore();
  const { success, error, info } = useNotificationStore();
  const [searchParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState(searchParams.get('eventId') || '');
  const [bracketType, setBracketType] = useState('single');
  const [tournamentId, setTournamentId] = useState(null);
  const [seedEntrants, setSeedEntrants] = useState([]);
  const [manualEntrantName, setManualEntrantName] = useState('');
  const [pendingRegenerate, setPendingRegenerate] = useState(null);

  useEffect(() => {
    if (!user?.id) return undefined;

    fetchEvents(user.id);
    fetchTeams();
    fetchRegistrations();
    fetchTournaments();

    const intervalId = window.setInterval(() => {
      fetchTournaments();
    }, 10000);

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
    const byId = new Map(events.map((event) => [String(event.id), event]));
    tournaments.forEach((tournament) => {
      const eventId = String(tournament.eventId || '');
      if (!eventId || byId.has(eventId)) return;
      byId.set(eventId, {
        id: tournament.eventId,
        title: tournament.title || tournament.name || `Event ${eventId}`,
        eventType: 'tournament',
        type: 'tournament',
        contestants: tournament.entrantSnapshot || tournament.teams || [],
      });
    });
    return Array.from(byId.values());
  }, [events, tournaments]);

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
      allowDemo: !isPointsSystemEvent(currentEvent),
    });

    setSeedEntrants(nextEntrants);
    setBracketType(currentEvent.bracketType || currentEvent.tournamentFormat || 'single');
  }, [currentEvent, currentTournament?.bracketType, currentTournament?.entrantSnapshot, currentTournament?.id, currentTournament?.teams, registrations, teams]);

  const seedSummary = useMemo(
    () =>
      seedEntrants.map((entrant, index) => ({
        ...entrant,
        seed: index + 1,
      })),
    [seedEntrants]
  );

  const canGenerate = seedSummary.length >= 2;
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

  const randomizeSeeds = () => {
    setSeedEntrants((current) => {
      const next = [...current];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      }
      return normalizeEntrants(next.map((entrant, position) => ({ ...entrant, seed: position + 1 })));
    });
    info('Seeds randomized.');
  };

  const resetSeeds = () => {
    if (!currentEvent) return;
    setSeedEntrants(buildEntrants({ event: currentEvent, teams, registrations, allowDemo: !performanceMode }));
    info('Seeds reset from the latest event data.');
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

    const tournamentHasResults = (existingTournament.matches || []).some((match) =>
      ['completed', 'in-progress', 'bye'].includes(match.status)
    );

    if (tournamentHasResults && !force) {
      setPendingRegenerate(existingTournament);
      return;
    }

    await commitGenerate(existingTournament, force);
  };

  const commitGenerate = async (existingTournament, force) => {
    await replaceEntrants(existingTournament.id, seedSummary);
    const generated = await generateBracket(existingTournament.id, {
      entrants: seedSummary,
      force,
    });

    if (!generated) {
      error('Bracket generation failed.');
      return;
    }

    setTournamentId(existingTournament.id);
    await fetchTournaments(currentEvent.id);
    success('Bracket generated successfully.');
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

  const copyPublicLink = async () => {
    if (!currentTournament?.eventId) return;
    const link = `${window.location.origin}/events/${currentTournament.eventId}/brackets`;
    try {
      await navigator.clipboard.writeText(link);
      success('Public bracket link copied.');
    } catch {
      error('Unable to copy the public bracket link.');
    }
  };

  const handlePerformanceScoringModeChange = async (nextMode) => {
    if (!currentEvent) return;
    const nextBracketType = currentEvent.bracketType || currentEvent.tournamentFormat || bracketType || 'single';
    const updates = nextMode === 'head-to-head-bracket'
      ? {
          performanceScoringMode: nextMode,
          championRule: 'bracket-winner',
          bracketType: nextBracketType,
          tournamentFormat: nextBracketType,
          pointScale: null,
        }
      : {
          performanceScoringMode: nextMode,
          championRule: nextMode === 'ranked-leaderboard' ? 'lowest-rank-total' : 'highest-average-score',
          pointScale: currentEvent.pointScale || '100',
        };

    const updated = await updateEvent(currentEvent.id, updates);
    if (!updated) {
      error('Unable to update scoring system.');
      return;
    }

    if (nextMode === 'head-to-head-bracket') {
      setBracketType(nextBracketType);
      info('Switched to head-to-head bracket. You can generate the bracket now.');
    } else {
      info('Switched to points leaderboard.');
    }
  };

  return (
    <DashboardLayout
      title={performanceMode ? 'Points Leaderboard Management' : 'Tournament Bracket Management'}
      subtitle={performanceMode ? 'Track judge scores and rank contestants by total points' : 'Generate brackets, manage seeds, and push live tournament updates'}
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
          commitGenerate(target, true);
        }}
      />
      <div style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <LabeledControl label="Event">
            <select
              value={selectedEvent}
              onChange={(event) => {
                const nextEventId = event.target.value;
                const firstTournament = uniqueTournaments(tournaments).find((tournament) => String(tournament.eventId) === String(nextEventId));
                setSelectedEvent(nextEventId);
                setTournamentId(firstTournament?.id || null);
                setBracketType(firstTournament?.bracketType || 'single');
              }}
              style={{ ...controlStyle, width: 260 }}
            >
              <option value="">Select Event</option>
              {eligibleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </LabeledControl>
          {performanceCapable && (
            <LabeledControl label="Scoring system">
              <select
                value={currentEvent?.performanceScoringMode || 'points-leaderboard'}
                onChange={(event) => handlePerformanceScoringModeChange(event.target.value)}
                style={{ ...controlStyle, width: 240 }}
              >
                <option value="points-leaderboard">Points leaderboard</option>
                <option value="ranked-leaderboard">Judge ranking</option>
                <option value="head-to-head-bracket">Head-to-head bracket</option>
              </select>
            </LabeledControl>
          )}
          {!performanceMode && selectedEventTournaments.length > 0 && (
            <LabeledControl label="Bracket">
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
              <LabeledControl label="Format">
                <select
                  value={bracketType}
                  onChange={(event) => setBracketType(event.target.value)}
                  style={{ ...controlStyle, width: 220 }}
                >
                  <option value="single">Single Elimination</option>
                  <option value="round-robin">Round Robin</option>
                  <option value="double" disabled>Double Elimination (Coming Soon)</option>
                </select>
              </LabeledControl>
              <button
                onClick={() => handleGenerate(false)}
                style={primaryButtonStyle}
              >
                Generate Bracket
              </button>
              {currentTournament ? (
                <button
                  onClick={() => handleGenerate(true)}
                  style={secondaryButtonStyle}
                >
                  Regenerate
                </button>
              ) : null}
            </>
          ) : performanceCapable ? null : (
            <div style={modeBadgeStyle}>
              <i className="bi bi-bar-chart-line" />
              {getScoringModeLabel(currentEvent)}
            </div>
          )}
        </div>

        {!performanceMode && seedSummary.some((entrant) => entrant.source === 'demo') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, fontWeight: 600 }}>
            <i className="bi bi-exclamation-triangle" />
            This bracket is using placeholder "Demo" entrants because no real teams, registrations, or contestants were found yet. Add real entrants below before publishing.
          </div>
        )}

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

        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ color: '#0f172a', fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{performanceMode ? 'Contestant Pool' : 'Seed Manager'}</h3>
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                {performanceMode ? 'Contestants come from approved registrations and event contestants.' : 'Entrants come from teams, approved registrations, then event contestants.'}
              </p>
            </div>
            {!performanceMode && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={randomizeSeeds} style={secondaryButtonStyle}>
                <i className="bi bi-shuffle" /> Randomize
              </button>
              <button onClick={resetSeeds} style={secondaryButtonStyle}>
                <i className="bi bi-arrow-counterclockwise" /> Reset
              </button>
            </div>}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {seedSummary.length === 0 ? (
              <div style={emptyStateStyle}>
                {loading ? 'Loading entrants...' : 'No real entrants found yet. Add teams or registrations first.'}
              </div>
            ) : seedSummary.map((entrant, index) => (
              <div key={entrant.id} style={performanceMode ? contestantRowStyle : entrantRowStyle}>
                <div style={{ fontWeight: 800, color: '#2563eb' }}>{performanceMode ? `#${index + 1}` : `Seed ${index + 1}`}</div>
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {entrant.name}
                    {entrant.source === 'demo' && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309', letterSpacing: '0.04em' }}>DEMO</span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{entrant.type}</div>
                </div>
                <div style={{ color: '#475569', fontSize: 13 }}>{ENTRANT_SOURCE_LABELS[entrant.source] || entrant.source}</div>
                {!performanceMode && <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => moveEntrant(index, -1)} disabled={index === 0} style={iconButtonStyle}>
                    <i className="bi bi-arrow-up" />
                  </button>
                  <button onClick={() => moveEntrant(index, 1)} disabled={index === seedSummary.length - 1} style={iconButtonStyle}>
                    <i className="bi bi-arrow-down" />
                  </button>
                </div>}
                <button onClick={() => removeEntrant(entrant.id)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer' }}>
                  <i className="bi bi-trash3" /> Remove
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <input
              value={manualEntrantName}
              onChange={(event) => setManualEntrantName(event.target.value)}
              placeholder="Add manual entrant"
              style={{ ...controlStyle, flex: 1, minWidth: 220 }}
            />
            <button onClick={addManualEntrant} style={secondaryButtonStyle}>
              <i className="bi bi-plus-lg" /> Add Entrant
            </button>
          </div>
        </div>

        {!performanceMode && currentTournament ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => publishTournament(currentTournament.id, !currentTournament.isPublished)} style={secondaryButtonStyle}>
              <i className={`bi ${currentTournament.isPublished ? 'bi-eye-slash' : 'bi-broadcast-pin'}`} /> {currentTournament.isPublished ? 'Unpublish' : 'Publish'}
            </button>
            <button onClick={copyPublicLink} style={secondaryButtonStyle}>
              <i className="bi bi-link-45deg" /> Copy Public Link
            </button>
            <button onClick={() => lockTournament(currentTournament.id, !currentTournament.isLocked)} style={secondaryButtonStyle}>
              <i className={`bi ${currentTournament.isLocked ? 'bi-unlock' : 'bi-lock'}`} /> {currentTournament.isLocked ? 'Unlock' : 'Lock'}
            </button>
            <button onClick={() => undoLastResult(currentTournament.id).then(() => success('Last result undone.')).catch((undoError) => error(String(undoError?.message || 'Unable to undo the last result.')))} style={secondaryButtonStyle}>
              <i className="bi bi-arrow-counterclockwise" /> Undo Last Result
            </button>
          </div>
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
        ) : currentTournament ? (
          <LiveBracket
            tournament={currentTournament}
            editable={!currentTournament.isLocked}
            onScoreChange={handleScoreFieldChange}
            onSaveMatch={handleSaveMatch}
            onAutoAdvanceMatch={handleAutoAdvanceMatch}
          />
        ) : (
          <div style={emptyPanelStyle}>
            Generate a bracket to begin entering tournament match scores.
          </div>
        )}

      </div>
    </DashboardLayout>
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

const entrantRowStyle = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr 120px 110px 140px',
  gap: 12,
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
};

const contestantRowStyle = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr 120px 140px',
  gap: 12,
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
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

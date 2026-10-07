import useCertificateStore from '../store/certificateStore';
import useScoreStore from '../store/scoreStore';
import useTournamentStore from '../store/tournamentStore';
import { GROUP_KNOCKOUT_MIN_ENTRANTS, normalizeEntrants } from '../utils/bracketEngine';

const TOURNAMENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

function getSubEventName(subEvent) {
  return String(subEvent?.name || subEvent?.title || '').trim();
}

function hasStartedResults(matches = []) {
  return matches.some((match) => ['completed', 'in-progress'].includes(match.status));
}

function entrantsChanged(current = [], next = []) {
  const currentIds = current.map((entry) => String(entry.id)).sort().join('|');
  const nextIds = next.map((entry) => String(entry.id)).sort().join('|');
  return currentIds !== nextIds;
}

function filterContestantsForSubEvent(contestants = [], subEvent) {
  if (!subEvent) return contestants;
  const subEventId = String(subEvent.id || '');
  const subEventName = getSubEventName(subEvent).toLowerCase();

  return contestants.filter((contestant) => {
    if (contestant.subEventId && String(contestant.subEventId) === subEventId) return true;
    if (contestant.subEventName && String(contestant.subEventName).trim().toLowerCase() === subEventName) return true;
    return false;
  });
}

function findTournamentForEvent(tournaments, event, subEvent = null) {
  const eventTournaments = tournaments.filter((tournament) => String(tournament.eventId) === String(event.id));
  if (!subEvent) {
    return eventTournaments.find((tournament) => !tournament.subEventId && String(tournament.name || '').toLowerCase() !== 'subevent') || eventTournaments[0] || null;
  }

  const subEventId = String(subEvent.id || '');
  const subEventName = getSubEventName(subEvent).toLowerCase();
  return eventTournaments.find((tournament) =>
    String(tournament.subEventId || tournament.name || '') === subEventId ||
    String(tournament.subEventName || '').trim().toLowerCase() === subEventName ||
    String(tournament.title || '').trim().toLowerCase().endsWith(`- ${subEventName}`)
  ) || null;
}

export async function finalizeEventWorkflow(event) {
  if (!event) {
    return { lockedCount: 0, generatedCertificates: [] };
  }

  const scoreStore = useScoreStore.getState();
  const certificateStore = useCertificateStore.getState();

  const lockedCount = await scoreStore.finalizeEventScores(event.id);
  const leaderboard = scoreStore.calculateLeaderboard(event.id, event.criteria || []);

  let generatedCertificates = [];
  if (event.enableCertificates) {
    generatedCertificates = await certificateStore.generateCertificatesForEvent({
      event,
      recipients: leaderboard.map((entry) => ({
        id: entry.contestantId,
        name: entry.contestantName,
        score: entry.averageScore,
        placement: entry.rank,
      })),
      category: 'participant',
    });
  }

  return { lockedCount, leaderboard, generatedCertificates };
}

export async function ensureTournamentAutomation(event, contestants = [], options = {}) {
  if (!event) return null;

  const tournamentStore = useTournamentStore.getState();
  const subEvent = options.subEvent || null;
  const subEventName = getSubEventName(subEvent);
  const bracketType = options.bracketType || subEvent?.tournamentFormat || subEvent?.bracketType || event.bracketType || event.tournamentFormat || 'single';
  let tournament = findTournamentForEvent(tournamentStore.tournaments, event, subEvent);

  // Scorers open the bracket the organizer built — seeding, matchups and all.
  // Without this, simply opening a scorer link would re-read the roster and
  // could overwrite the organizer's seeding, or rebuild the bracket outright.
  if (options.preserveExisting && tournament && (tournament.matches || []).length > 0) {
    return tournament;
  }
  const entrants = normalizeEntrants(
    contestants.map((contestant, index) => ({
      id: contestant.id,
      name: contestant.name,
      seed: contestant.seed || index + 1,
      type: contestant.type || 'team',
      source: contestant.source || 'event',
    }))
  );

  if (!tournament) {
    tournament = await tournamentStore.createTournament({
      title: subEventName ? `${event.title} - ${subEventName}` : event.title,
      name: subEvent?.id ? String(subEvent.id) : event.title,
      eventId: event.id,
      subEventId: subEvent?.id || null,
      subEventName,
      bracketType,
      status: 'active',
      streamTitle: `${subEventName ? `${subEventName} ` : ''}${event.title} Live Bracket`,
      streamMessage: 'Bracket created and ready for live updates.',
      teams: entrants,
    });
  }
  if (!tournament) return null;

  if (entrants.length > 0) {
    await tournamentStore.replaceEntrants(tournament.id, entrants);
    tournament = tournamentStore.getTournamentById(tournament.id);
  }

  // A group stage needs enough entrants for two groups; until then the
  // bracket simply waits rather than failing a registration.
  const minimumEntrants = (tournament.bracketType || bracketType) === 'group-knockout' ? GROUP_KNOCKOUT_MIN_ENTRANTS : 2;
  if (entrants.length >= minimumEntrants) {
    const shouldGenerate =
      (tournament.matches || []).length === 0 ||
      (!hasStartedResults(tournament.matches) && entrantsChanged(tournament.entrantSnapshot || tournament.teams || [], entrants));

    if (shouldGenerate) {
      await tournamentStore.generateBracket(tournament.id, { entrants, force: !hasStartedResults(tournament.matches) });
    }
    tournament = tournamentStore.getTournamentById(tournament.id);
  }

  return tournament;
}

export async function ensureEventTournamentAutomation(event, contestants = [], options = {}) {
  if (!event || !TOURNAMENT_TYPES.includes(event.eventType || event.type)) return [];

  const subEvents = Array.isArray(event.subEvents)
    ? event.subEvents.filter((subEvent) => getSubEventName(subEvent))
    : [];

  if (subEvents.length > 0) {
    const tournaments = [];
    for (const subEvent of subEvents) {
      const subEventContestants = filterContestantsForSubEvent(contestants, subEvent);
      tournaments.push(await ensureTournamentAutomation(event, subEventContestants, { ...options, subEvent }));
    }
    return tournaments.filter(Boolean);
  }

  const tournament = await ensureTournamentAutomation(event, contestants, options);
  return tournament ? [tournament] : [];
}

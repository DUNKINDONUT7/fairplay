// What a bracket may show and allow follows from its event's status, so there
// is no separate publish or lock switch to keep in step with it.

const HIDDEN_STATUSES = ['draft', 'pending', 'rejected'];

// Visible to participants and the public once the event itself is.
export function isBracketPublic(event) {
  return Boolean(event) && !HIDDEN_STATUSES.includes(String(event.status || 'draft'));
}

// Seeding can be reshuffled freely until this is true.
export function hasEventStarted(event) {
  return Boolean(event) && (['active', 'completed'].includes(event.status) || event.scoringActive === true);
}

// Scores are read-only from here on.
export function isEventOver(event) {
  return event?.status === 'completed';
}

// Match scores can be entered only while this is true: the event is approved
// and the organizer has opened scoring, which is what starts the event.
export function isScoringOpen(event) {
  return isBracketPublic(event) && hasEventStarted(event) && !isEventOver(event);
}

// Events that are decided by a bracket (as opposed to judge scores).
const BRACKET_EVENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];
export function isBracketEvent(event) {
  if (!event) return false;
  if (event.performanceScoringMode === 'head-to-head-bracket') return true;
  if (event.competitionMode) return event.competitionMode === 'tournament';
  return BRACKET_EVENT_TYPES.includes(event.eventType || event.type);
}

export const BRACKET_FORMAT_LABELS = {
  single: 'Single elimination',
  'round-robin': 'Round robin',
  'group-knockout': 'Group stage + knockout',
  double: 'Double elimination',
};

function formatDay(value) {
  if (!value) return '';
  const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatClock(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

// When and where a bracket is played, taken from what the organizer already
// entered when creating the event (and its sub-event, for a sports fest).
export function describeBracketSchedule(event, tournament) {
  if (!event) return { dates: '', times: '', venue: '' };
  const subEvent = tournament
    ? (event.subEvents || []).find((entry) => (
        String(entry.id) === String(tournament.subEventId || tournament.name) ||
        (entry.name && String(tournament.title || '').toLowerCase().endsWith(`- ${String(entry.name).toLowerCase()}`))
      )) || null
    : null;

  const first = formatDay(subEvent?.schedule?.startDate || event.startDate);
  const last = formatDay(subEvent?.schedule?.endDate || event.endDate);
  const from = formatClock(event.startTime);
  const until = formatClock(event.endTime);

  return {
    dates: first && last && first !== last ? `${first} – ${last}` : first || last,
    times: from && until ? `${from} – ${until}` : from,
    venue: subEvent?.venue || event.location || '',
  };
}

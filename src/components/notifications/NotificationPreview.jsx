import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useTournamentStore from '../../store/tournamentStore';
import useEventReport from '../../hooks/useEventReport';
import LiveBracket from '../brackets/LiveBracket';
import { Dialog, RankBadge } from '../reports/ScoreDetails';
import { BracketLeaderboard } from '../reports/BracketScoring';
import { ReportEmptyState, ReportLoading } from '../reports/reportShared';
import { formatScore } from '../../utils/eventReport';
import { isBracketPublic } from '../../utils/bracketRules';

// Some notifications point at an event's public leaderboard or bracket. Going
// there takes a signed-in user out of their dashboard, so those open in a
// pop-up instead. Returns null for every other link, which is followed as usual.
export function getNotificationPreview(actionUrl) {
  const match = /^\/events\/([^/?#]+)\/(leaderboard|brackets)\/?(?:[?#].*)?$/.exec(String(actionUrl || ''));
  return match ? { eventId: match[1], kind: match[2] } : null;
}

export default function NotificationPreview({ preview, onClose, onNavigate }) {
  const { user } = useAuthStore();
  const { event, report, loading } = useEventReport(preview.eventId);
  const tournaments = useTournamentStore((state) => state.tournaments);
  const [eventsRequested, setEventsRequested] = useState(false);
  const [bracketId, setBracketId] = useState('');

  // The page behind the bell may not have this event loaded yet.
  useEffect(() => {
    if (event || eventsRequested) return;
    setEventsRequested(true);
    useEventStore.getState().fetchEvents(user?.role === 'organizer' ? user.id : undefined, { silent: true });
  }, [event, eventsRequested, user]);

  const eventBrackets = useMemo(
    () => tournaments.filter((tournament) => String(tournament.eventId) === String(preview.eventId)),
    [tournaments, preview.eventId]
  );
  const activeBracket = eventBrackets.find((tournament) => String(tournament.id) === String(bracketId)) || eventBrackets[0] || null;

  const isOrganizer = user?.role === 'organizer';
  const staff = isOrganizer || user?.role === 'admin';
  const showBracket = preview.kind === 'brackets';
  const fullPage = !isOrganizer ? null : showBracket
    ? { label: 'Open Brackets page', icon: 'bi bi-diagram-3', to: `/organizer/brackets?eventId=${preview.eventId}` }
    : { label: 'Open full ranking', icon: 'bi bi-trophy', to: `/organizer/events/${preview.eventId}/ranking` };

  let body;
  if (!event || !report) {
    body = loading || !eventsRequested
      ? <ReportLoading label="Loading…" />
      : <ReportEmptyState icon="bi bi-calendar-x" title="Event not found">This event is no longer available.</ReportEmptyState>;
  } else if (loading) {
    body = <ReportLoading label="Loading…" />;
  } else if (showBracket) {
    body = !activeBracket ? (
      <ReportEmptyState icon="bi bi-diagram-3" title="No bracket built yet">The bracket will appear here once it has been built.</ReportEmptyState>
    ) : !staff && !isBracketPublic(event) ? (
      <ReportEmptyState icon="bi bi-eye-slash" title="Bracket not available yet">It will be shown once the event is approved.</ReportEmptyState>
    ) : (
      <>
        {eventBrackets.length > 1 && (
          <div role="tablist" aria-label="Bracket" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {eventBrackets.map((tournament) => {
              const active = tournament.id === activeBracket.id;
              return (
                <button
                  key={tournament.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBracketId(tournament.id)}
                  style={{ padding: '7px 14px', borderRadius: 999, border: active ? '1px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {tournament.title || tournament.name || 'Bracket'}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <LiveBracket tournament={activeBracket} />
        </div>
      </>
    );
  } else if (report.isTournament) {
    body = <BracketLeaderboard report={report} />;
  } else if (report.ranked.length === 0) {
    body = <ReportEmptyState icon="bi bi-bar-chart" title="No scores yet">Rankings will appear here once judges submit their scores.</ReportEmptyState>;
  } else {
    body = (
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {report.ranked.map((participant, index) => (
          <div
            key={participant.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 16px', borderTop: index ? '1px solid #f1f5f9' : 'none', background: participant.rank === 1 ? '#fffbeb' : '#ffffff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <RankBadge rank={participant.rank} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflowWrap: 'anywhere' }}>{participant.name}</div>
                {participant.award && <div style={{ fontSize: 12, color: '#64748b' }}>{participant.award}</div>}
              </div>
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {participant.final === null ? '--' : formatScore(participant.final)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // The bell sits inside an animated header, so the pop-up is attached to the
  // page itself to cover the whole screen.
  return createPortal(
    <Dialog
      title={event?.title || 'Event'}
      subtitle={showBracket ? 'Bracket' : report?.reportStatus === 'final' ? 'Final results' : 'Leaderboard'}
      onClose={onClose}
    >
      {body}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
        <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Close
        </button>
        {fullPage && (
          <button type="button" onClick={() => onNavigate(fullPage.to)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <i className={fullPage.icon} /> {fullPage.label}
          </button>
        )}
      </div>
    </Dialog>,
    document.body
  );
}

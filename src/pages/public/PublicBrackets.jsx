import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import LiveBracket from '../../components/brackets/LiveBracket';
import useEventStore from '../../store/eventStore';
import useTournamentStore from '../../store/tournamentStore';
import { isSupabaseConfigured, subscribeToTable } from '../../utils/supabaseClient';
import PublicEventNav from '../../components/public/PublicEventNav';

export default function PublicBrackets() {
  const { id } = useParams();
  const { events, fetchEvents } = useEventStore();
  const { tournaments, fetchTournaments } = useTournamentStore();

  useEffect(() => {
    fetchEvents();
    fetchTournaments(id);

    // Fallback only — the realtime subscription below already refreshes on
    // every tournament change; this just covers a silently-dropped socket.
    const intervalId = window.setInterval(() => {
      fetchTournaments(id);
    }, 30000);

    const unsubscribe = isSupabaseConfigured
      ? subscribeToTable({
          table: 'tournaments',
          filter: `event_id=eq.${id}`,
          onChange: () => fetchTournaments(id),
        })
      : () => {};

    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [fetchEvents, fetchTournaments, id]);

  const event = events.find((entry) => String(entry.id) === String(id)) || null;
  const tournament = tournaments.find((entry) => String(entry.eventId) === String(id)) || null;
  const canViewBracket = tournament && (tournament.isPublished || tournament.liveStatus === 'completed');

  return (
    <div style={styles.page}>
      <PublicEventNav
        eventId={id}
        eventTitle={event?.title}
        activeTab="brackets"
        showBrackets
        theme="light"
        fixed
      />
      <main style={{ paddingTop: 70 }}>
        <div style={styles.main}>
          <div style={styles.header}>
            <span style={styles.eyebrow}>
              <i className="bi bi-diagram-3" /> Tournament Bracket
            </span>
            <h1 style={styles.title}>{event?.title || 'Tournament Brackets'}</h1>
            <p style={styles.subtitle}>
              Live bracket progression for spectators, judges, and teams.
            </p>
          </div>

          {canViewBracket ? (
            <LiveBracket tournament={tournament} />
          ) : (
            <div style={styles.emptyCard}>
              <span style={styles.emptyIcon}>
                <i className="bi bi-diagram-3" />
              </span>
              <h3 style={styles.emptyTitle}>Bracket not available yet</h3>
              <p style={styles.emptyCopy}>
                {tournament
                  ? 'The organizer has not published this bracket yet. It appears here the moment they do.'
                  : 'The organizer has not created a bracket for this event yet.'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Same page surface as PublicEventView and PublicLeaderboard, so the three
// public event tabs read as one product instead of three separate themes.
const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg,#f8fbff 0%,#eff6ff 48%,#ffffff 100%)',
    color: '#0f172a',
  },
  main: { maxWidth: 1480, margin: '0 auto', padding: 'clamp(24px, 4vw, 40px) clamp(16px, 3vw, 24px) 64px' },
  header: { marginBottom: 'clamp(20px, 3vw, 28px)' },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 12px',
    borderRadius: 999,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 'clamp(22px, 4vw, 30px)',
    fontWeight: 900,
    letterSpacing: '-0.02em',
    margin: '0 0 6px',
    color: '#0f172a',
  },
  subtitle: { color: '#64748b', fontSize: 'clamp(13px, 2vw, 15px)', margin: 0 },
  emptyCard: {
    background: '#ffffff',
    border: '1px solid #dbeafe',
    borderRadius: 20,
    padding: 'clamp(28px, 6vw, 48px) 24px',
    textAlign: 'center',
    boxShadow: '0 14px 40px rgba(37,99,235,0.07)',
  },
  emptyIcon: {
    display: 'grid',
    placeItems: 'center',
    width: 56,
    height: 56,
    margin: '0 auto 16px',
    borderRadius: 18,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
    fontSize: 24,
  },
  emptyTitle: { fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' },
  emptyCopy: { color: '#64748b', fontSize: 14, margin: '0 auto', maxWidth: 420, lineHeight: 1.6 },
};

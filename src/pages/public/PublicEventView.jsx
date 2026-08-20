import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import useEventStore from '../../store/eventStore';
import useScoreStore from '../../store/scoreStore';
import useTournamentStore from '../../store/tournamentStore';
import PublicEventNav from '../../components/public/PublicEventNav';

function formatDate(raw) {
  if (!raw) return 'Schedule to be announced';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Schedule to be announced';
  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getEventWindow(event) {
  const start = event?.startDate || event?.start_date || null;
  const end = event?.endDate || event?.end_date || start;
  const startTime = start ? new Date(start).getTime() : 0;
  const endTime = end ? new Date(end).getTime() : startTime;
  return { start, end, startTime, endTime };
}

function getEventPhase(event) {
  const status = String(event?.status || '').toLowerCase();
  const now = Date.now();
  const { startTime, endTime } = getEventWindow(event);
  if (['completed', 'archived'].includes(status)) return 'completed';
  if (['active', 'ongoing', 'live'].includes(status)) return 'ongoing';
  if (startTime && startTime <= now && (!endTime || endTime >= now)) return 'ongoing';
  if (['upcoming', 'approved', 'published'].includes(status) || (startTime && startTime > now)) return 'upcoming';
  return status || 'draft';
}

function statusTone(phase) {
  if (phase === 'ongoing') return { label: 'Ongoing', bg: '#dcfce7', color: '#15803d', dot: '#22c55e' };
  if (phase === 'completed') return { label: 'Completed', bg: '#e2e8f0', color: '#475569', dot: '#64748b' };
  if (phase === 'upcoming') return { label: 'Upcoming', bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' };
  return { label: 'Preview', bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' };
}

export default function PublicEventView() {
  const { id } = useParams();
  const { events, fetchEvents } = useEventStore();
  const { fetchScores, getScoresForEvent, calculateLeaderboard } = useScoreStore();
  const { tournaments, fetchTournaments } = useTournamentStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadPublicEvent() {
      try {
        await Promise.all([fetchEvents(), fetchTournaments(id), fetchScores(id)]);
      } finally {
        if (mounted) setLoaded(true);
      }
    }

    loadPublicEvent();
    return () => { mounted = false; };
  }, [fetchEvents, fetchScores, fetchTournaments, id]);

  const event = events.find((entry) => String(entry.id) === String(id)) || null;
  const tournament = tournaments.find((entry) => String(entry.eventId) === String(id)) || null;
  const scores = getScoresForEvent(id);
  const contestants = Array.isArray(event?.contestants) ? event.contestants : [];
  const phase = getEventPhase(event);
  const tone = statusTone(phase);
  const registrationClosed = phase === 'ongoing' || phase === 'completed';
  const { start, end } = getEventWindow(event);

  const leaderboard = useMemo(() => {
    if (!event) return [];
    const ranked = calculateLeaderboard(event.id, event.criteria || []);
    if (ranked.length > 0) return ranked.slice(0, 5);

    return contestants.slice(0, 5).map((contestant, index) => ({
      rank: index + 1,
      contestantId: contestant.id,
      contestantName: contestant.name || contestant.teamName || `Participant ${index + 1}`,
      averageScore: null,
      totalScores: 0,
    }));
  }, [calculateLeaderboard, contestants, event]);

  if (!event && !loaded) {
    return (
      <div style={S.centerPage}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <i className="bi bi-arrow-repeat" style={{ fontSize: 40, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Loading event preview...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={S.centerPage}>
        <i className="bi bi-search" style={{ fontSize: 48, color: '#2563eb', marginBottom: 16 }} />
        <h1 style={S.emptyTitle}>Event not found</h1>
        <p style={S.emptyText}>This event preview is invalid or no longer available.</p>
        <Link to="/" style={S.primaryLink}>Back to FairPlay</Link>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <PublicEventNav
        eventId={id}
        eventTitle={event.title}
        activeTab="preview"
        showBrackets={Boolean(tournament)}
        showRegister={!registrationClosed}
        theme="light"
      />

      <main style={S.main}>
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} style={S.hero}>
          <div style={S.heroCopy}>
            <span style={S.statusPill}>
              <span style={{ ...S.statusDot, background: tone.dot }} />
              {tone.label}
            </span>
            <h1 style={S.title}>{event.title}</h1>
            <p style={S.subtitle}>{event.description || 'Event details and public results are available here for the audience.'}</p>
            <div style={S.actionRow}>
              {registrationClosed ? (
                <span style={S.closedNotice}>
                  <i className="bi bi-lock-fill" />
                  Registration is closed because this event is {phase}.
                </span>
              ) : (
                <Link to={`/participant/register?eventId=${id}`} style={S.primaryLink}>
                  <i className="bi bi-person-plus" />
                  Register for this event
                </Link>
              )}
              <Link to={`/events/${id}/leaderboard`} style={S.secondaryLink}>
                <i className="bi bi-bar-chart-line" />
                Full Leaderboard
              </Link>
              {tournament ? (
                <Link to={`/events/${id}/brackets`} style={S.secondaryLink}>
                  <i className="bi bi-diagram-3" />
                  Brackets
                </Link>
              ) : null}
            </div>
          </div>

          <div style={S.heroPanel}>
            <div style={S.panelHeader}>
              <span>Audience Preview</span>
              <span style={{ ...S.panelBadge, background: tone.bg, color: tone.color }}>{tone.label}</span>
            </div>
            <div style={S.statsGrid}>
              <InfoCard icon="bi-calendar-event" label="Date" value={`${formatDate(start)}${end && end !== start ? ` to ${formatDate(end)}` : ''}`} />
              <InfoCard icon="bi-people" label="Participants" value={`${contestants.length || event.participants || 0}${event.maxParticipants ? ` / ${event.maxParticipants}` : ''}`} />
              <InfoCard icon="bi-geo-alt" label="Venue" value={event.location || 'Venue to be announced'} />
              <InfoCard icon="bi-trophy" label="Scores Submitted" value={String(scores.length)} />
            </div>
          </div>
        </motion.section>

        <section style={S.contentGrid}>
          <div style={S.card}>
            <div style={S.cardTitleRow}>
              <div>
                <p style={S.eyebrow}>Live Rankings</p>
                <h2 style={S.cardTitle}>Leaderboard</h2>
              </div>
              <Link to={`/events/${id}/leaderboard`} style={S.textLink}>View all</Link>
            </div>
            <div style={S.list}>
              {leaderboard.length > 0 ? leaderboard.map((item) => (
                <div key={item.contestantId || item.rank} style={S.rankRow}>
                  <div style={{ ...S.rankBadge, background: item.rank === 1 ? '#fef3c7' : '#eff6ff', color: item.rank === 1 ? '#b45309' : '#1d4ed8' }}>
                    #{item.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={S.rowName}>{item.contestantName}</strong>
                    <p style={S.rowMeta}>{item.totalScores ? `${item.totalScores} score submissions` : 'Waiting for scores'}</p>
                  </div>
                  <span style={S.scoreValue}>{item.averageScore !== null ? item.averageScore.toFixed(2) : '--'}</span>
                </div>
              )) : (
                <EmptyMessage icon="bi-bar-chart" text="No leaderboard data yet." />
              )}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitleRow}>
              <div>
                <p style={S.eyebrow}>Contestants</p>
                <h2 style={S.cardTitle}>Participants</h2>
              </div>
              <span style={S.countPill}>{contestants.length}</span>
            </div>
            <div style={S.participantGrid}>
              {contestants.length > 0 ? contestants.slice(0, 10).map((contestant, index) => (
                <div key={contestant.id || index} style={S.participantItem}>
                  <span style={S.avatar}>{String(contestant.name || contestant.teamName || 'P').charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={S.rowName}>{contestant.name || contestant.teamName || `Participant ${index + 1}`}</strong>
                    <p style={S.rowMeta}>{contestant.type === 'team' ? 'Team' : 'Participant'}</p>
                  </div>
                </div>
              )) : (
                <EmptyMessage icon="bi-people" text="Participants will appear here once approved or registered." />
              )}
            </div>
          </div>

          <div style={{ ...S.card, gridColumn: '1 / -1' }}>
            <div style={S.cardTitleRow}>
              <div>
                <p style={S.eyebrow}>Score Feed</p>
                <h2 style={S.cardTitle}>Recent Scores</h2>
              </div>
              <span style={S.countPill}>{scores.length}</span>
            </div>
            <div style={S.scoreGrid}>
              {scores.length > 0 ? scores.slice(0, 8).map((score) => (
                <div key={score.id} style={S.scoreCard}>
                  <strong style={S.rowName}>{score.contestantName}</strong>
                  <p style={S.rowMeta}>Judge: {score.judgeName || 'Judge'}</p>
                  <span style={S.scoreValue}>{event.criteria?.length ? useScoreStore.getState().calculateWeightedTotal(event.criteria, score.criteriaScores).totalScore.toFixed(2) : 'Saved'}</span>
                </div>
              )) : (
                <EmptyMessage icon="bi-clipboard-data" text="Scores will appear once judges submit them." />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <div style={S.infoCard}>
      <i className={`bi ${icon}`} style={S.infoIcon} />
      <span style={S.infoLabel}>{label}</span>
      <strong style={S.infoValue}>{value}</strong>
    </div>
  );
}

function EmptyMessage({ icon, text }) {
  return (
    <div style={S.emptyBox}>
      <i className={`bi ${icon}`} />
      <span>{text}</span>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg,#f8fbff 0%,#eff6ff 48%,#ffffff 100%)', color: '#0f172a' },
  centerPage: { minHeight: '100vh', background: '#f8fbff', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' },
  main: { maxWidth: 1180, margin: '0 auto', padding: '36px 24px 72px' },
  hero: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 24, alignItems: 'stretch', marginBottom: 24 },
  heroCopy: { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 28, padding: 32, boxShadow: '0 22px 60px rgba(37,99,235,0.10)' },
  heroPanel: { background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', borderRadius: 28, padding: 24, color: '#fff', boxShadow: '0 22px 60px rgba(15,23,42,0.20)' },
  title: { fontSize: 'clamp(32px,5vw,56px)', lineHeight: 1, fontWeight: 950, letterSpacing: '-0.05em', margin: '16px 0 14px', color: '#0f172a' },
  subtitle: { color: '#475569', fontSize: 16, lineHeight: 1.7, maxWidth: 680 },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  actionRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 },
  primaryLink: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 18px', borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', fontWeight: 900, textDecoration: 'none', border: 'none' },
  secondaryLink: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 18px', borderRadius: 14, background: '#eff6ff', color: '#1d4ed8', fontWeight: 900, textDecoration: 'none', border: '1px solid #bfdbfe' },
  closedNotice: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 18px', borderRadius: 14, background: '#fef3c7', color: '#92400e', fontWeight: 900, border: '1px solid #fde68a' },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: '#bfdbfe', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18 },
  panelBadge: { padding: '6px 10px', borderRadius: 999, fontSize: 11, letterSpacing: 0 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 },
  infoCard: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(191,219,254,0.16)', borderRadius: 18, padding: 16, display: 'grid', gap: 8 },
  infoIcon: { color: '#93c5fd', fontSize: 18 },
  infoLabel: { color: '#bfdbfe', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' },
  infoValue: { color: '#ffffff', fontSize: 15, lineHeight: 1.35 },
  contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 20 },
  card: { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 24, padding: 24, boxShadow: '0 18px 42px rgba(37,99,235,0.08)' },
  cardTitleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
  eyebrow: { color: '#2563eb', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 },
  cardTitle: { color: '#0f172a', fontSize: 22, fontWeight: 950, margin: '4px 0 0' },
  textLink: { color: '#1d4ed8', fontWeight: 900, textDecoration: 'none', fontSize: 13 },
  countPill: { padding: '6px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontWeight: 900, fontSize: 12 },
  list: { display: 'grid', gap: 10 },
  rankRow: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, background: '#f8fbff', border: '1px solid #e0ecff' },
  rankBadge: { width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', fontWeight: 950, flex: '0 0 auto' },
  rowName: { color: '#0f172a', fontSize: 14, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { color: '#64748b', fontSize: 12, margin: '3px 0 0' },
  scoreValue: { color: '#1d4ed8', fontSize: 22, fontWeight: 950 },
  participantGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 },
  participantItem: { display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, background: '#f8fbff', border: '1px solid #e0ecff' },
  avatar: { width: 38, height: 38, borderRadius: 13, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 950, flex: '0 0 auto' },
  scoreGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 },
  scoreCard: { padding: 14, borderRadius: 16, background: '#f8fbff', border: '1px solid #e0ecff' },
  emptyBox: { minHeight: 90, display: 'grid', placeItems: 'center', gap: 8, color: '#64748b', background: '#f8fbff', border: '1px dashed #bfdbfe', borderRadius: 16, padding: 18 },
  emptyTitle: { color: '#0f172a', fontSize: 24, fontWeight: 950, margin: 0 },
  emptyText: { color: '#64748b', marginBottom: 18 },
};

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useCertificateStore from '../../store/certificateStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';

// Mirrors the matching used by ParticipantSchedule/ParticipantDashboard — email
// first, exact name as a fallback for older or mobile-typed registrations.
function isMyRegistration(registration, user) {
  if (!user) return false;
  const email = String(registration.email || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  if (email && userEmail && email === userEmail) return true;

  const participantName = String(registration.participantName || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();
  return Boolean(participantName && userName && participantName === userName);
}

function SectionLabel({ icon, children }) {
  return (
    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
      <i className={icon} style={{ color: '#2563eb' }} />
      {children}
    </h3>
  );
}

function StatTile({ label, value, icon, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18, background: `${color}1a`, color }}>
        <i className={icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 22, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{value}</span>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</span>
      </span>
    </div>
  );
}

export default function ParticipantScores() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { fetchCertificates, getCertificatesByRecipient } = useCertificateStore();
  const { fetchScores, calculateLeaderboard } = useScoreStore();

  useEffect(() => {
    fetchEvents();
    fetchRegistrations();
    fetchCertificates();
    fetchScores();
  }, [fetchCertificates, fetchEvents, fetchRegistrations, fetchScores]);

  const myEventIds = useMemo(() => {
    if (!user) return new Set();
    return new Set(
      registrations
        .filter((registration) => isMyRegistration(registration, user))
        .map((registration) => String(registration.eventId))
    );
  }, [registrations, user]);

  const recipientCertificates = getCertificatesByRecipient(user?.name || '');
  // Only the events this participant is actually registered for — showing
  // every event on the platform here (including ones never joined) was just
  // noise and made it look like scores were missing for unrelated events.
  const results = events
    .filter((event) => myEventIds.has(String(event.id)))
    .map((event) => {
      const leaderboard = calculateLeaderboard(event.id, event.criteria || []);
      const participantEntry = leaderboard.find((entry) => entry.contestantName === user?.name) || null;
      const certificate = recipientCertificates.find((item) => String(item.eventId) === String(event.id)) || null;

      return {
        eventId: event.id,
        event: event.title,
        score: participantEntry?.averageScore ?? null,
        rank: participantEntry?.rank ?? null,
        total: leaderboard.length,
        status: event.status,
        date: event.endDate || event.startDate,
        certificate,
      };
    });

  const summary = {
    scored: results.filter((result) => result.score !== null).length,
    certificates: results.filter((result) => result.certificate).length,
    bestRank: results.reduce((best, result) => (result.rank && (!best || result.rank < best) ? result.rank : best), null),
  };

  return (
    <DashboardLayout title="Scores and Results" subtitle="View rankings, progress, and available certificates">
      {results.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-bar-chart" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No results yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Register for an event to see your scores and rankings here.</p>
          <button type="button" onClick={() => navigate('/participant/events')} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <i className="bi bi-calendar-plus" /> Browse events
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
            <StatTile label="Events scored" value={summary.scored} icon="bi bi-bar-chart-line-fill" color="#2563eb" />
            <StatTile label="Certificates earned" value={summary.certificates} icon="bi bi-award-fill" color="#d97706" />
            <StatTile label="Best rank" value={summary.bestRank ? `#${summary.bestRank}` : '—'} icon="bi bi-trophy-fill" color="#7c3aed" />
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <SectionLabel icon="bi bi-list-check">My results</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
              {results.map((result, index) => (
            <motion.div
              key={result.eventId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4, boxShadow: '0 18px 40px rgba(37,99,235,0.12)' }}
              transition={{ delay: index * 0.05 }}
              style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16, gap: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{result.event}</h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: result.status === 'completed' ? '#dcfce7' : '#dbeafe', color: result.status === 'completed' ? '#15803d' : '#2563eb' }}>
                  <i className={result.status === 'completed' ? 'bi bi-check-circle-fill' : 'bi bi-lightning-charge-fill'} />
                  {result.status}
                </span>
              </div>

              {result.score !== null ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Score</p>
                      <p style={{ fontSize: 36, fontWeight: 900, color: '#10b981', margin: 0 }}>{result.score}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Rank</p>
                      <p style={{ fontSize: 36, fontWeight: 900, color: '#2563eb', margin: 0 }}>{result.rank ? `#${result.rank}` : 'N/A'}</p>
                    </div>
                  </div>
                  <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 12, marginBottom: 0 }}>
                    Out of {result.total || 0} ranked contestants
                  </p>
                </div>
              ) : (
                <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 16 }}>
                  <i className="bi bi-hourglass-split" style={{ fontSize: 22, color: '#93c5fd', display: 'block', marginBottom: 8 }} />
                  <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Scores will appear once judging submissions are finalized.</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/events/${result.eventId}/leaderboard`)}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#dbeafe', border: '1px solid #bfdbfe', color: '#2563eb', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <i className="bi bi-bar-chart-line-fill" /> Leaderboard
                </motion.button>
                <motion.button
                  whileHover={result.certificate ? { scale: 1.015 } : undefined}
                  whileTap={result.certificate ? { scale: 0.98 } : undefined}
                  disabled={!result.certificate}
                  onClick={() => {
                    if (result.certificate) {
                      navigate('/participant/profile', { state: { certificateId: result.certificate.id } });
                    }
                  }}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, background: result.certificate ? '#dcfce7' : '#f1f5f9', border: `1px solid ${result.certificate ? '#bbf7d0' : '#e2e8f0'}`, color: result.certificate ? '#15803d' : '#94a3b8', fontWeight: 700, fontSize: 12, cursor: result.certificate ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <i className="bi bi-award-fill" /> {result.certificate ? 'Certificate' : 'Pending'}
                </motion.button>
              </div>
            </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

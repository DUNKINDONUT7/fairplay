import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useCertificateStore from '../../store/certificateStore';
import useEventStore from '../../store/eventStore';
import useScoreStore from '../../store/scoreStore';

export default function ParticipantScores() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { fetchCertificates, getCertificatesByRecipient } = useCertificateStore();
  const { fetchScores, calculateLeaderboard } = useScoreStore();

  useEffect(() => {
    fetchEvents();
    fetchCertificates();
    fetchScores();
  }, [fetchCertificates, fetchEvents, fetchScores]);

  const recipientCertificates = getCertificatesByRecipient(user?.name || '');
  const results = events.map((event) => {
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

  return (
    <DashboardLayout title="Scores and Results" subtitle="View rankings, progress, and available certificates">
      {results.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-bar-chart" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No results yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Your scores will show up here once events are underway</p>
        </div>
      ) : (
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
      )}
    </DashboardLayout>
  );
}

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import { getBusinessActorId } from '../../utils/identity';

export default function JudgeEvents() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { fetchJudges, ensureJudgeProfileForUser, getJudgeAssignments, getJudgeForActor } = useJudgeStore();
  const { fetchScores, getScoresByJudge } = useScoreStore();
  const judgeId = getJudgeForActor(user)?.id || getBusinessActorId(user);

  useEffect(() => {
    fetchEvents();
    fetchJudges();
    fetchScores();
    ensureJudgeProfileForUser(user);
  }, [ensureJudgeProfileForUser, fetchEvents, fetchJudges, fetchScores, user]);

  const eventCards = useMemo(() => {
    const assignments = getJudgeAssignments(user);
    return assignments
      .map((assignment) => {
        const event = events.find((item) => String(item.id) === String(assignment.eventId));
        if (!event) return null;

        const contestantCount = Array.isArray(event.contestants) ? event.contestants.length : Number(event.participants || 0);
        const scores = getScoresByJudge(event.id, judgeId || 0);

        return {
          ...event,
          submitted: scores.length,
          participants: contestantCount,
          deadline: event.endDate || event.startDate || 'Schedule pending',
        };
      })
      .filter(Boolean);
  }, [events, getJudgeAssignments, getScoresByJudge, judgeId, user]);

  return (
    <DashboardLayout title="Assigned Events" subtitle="Access each event, continue scoring, and monitor progress">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {eventCards.length === 0 ? (
          <div style={{ padding: 40, borderRadius: 18, background: '#ffffff', border: '1px solid #dbeafe', color: '#64748b' }}>
            No active judge assignments are connected to your account yet.
          </div>
        ) : (
          eventCards.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18, padding: 22 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12, gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{event.title}</h3>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{event.type} • {event.location || 'Venue pending'}</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: event.status === 'active' ? 'rgba(16,185,129,0.14)' : 'rgba(59,130,246,0.14)', color: event.status === 'active' ? '#34d399' : '#60a5fa' }}>{event.status}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ padding: 12, background: '#0f172a', borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Participants</div>
                  <div style={{ fontSize: 21, fontWeight: 800 }}>{event.participants}</div>
                </div>
                <div style={{ padding: 12, background: '#0f172a', borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Submitted</div>
                  <div style={{ fontSize: 21, fontWeight: 800, color: '#34d399' }}>{event.submitted}/{event.participants}</div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#64748b' }}>
                  <span>Completion</span>
                  <span>{event.participants ? Math.round((event.submitted / event.participants) * 100) : 0}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${event.participants ? (event.submitted / event.participants) * 100 : 0}%`, background: 'linear-gradient(90deg, #2563eb, #10b981)' }} />
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>Schedule: {event.deadline}</div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/judge/scoring?eventId=${event.id}`)}
                  style={{ flex: 1, minWidth: 130, padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)', color: '#04111d', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  Start Scoring
                </button>
                <button
                  onClick={() => navigate(`/judge/review?eventId=${event.id}`)}
                  style={{ flex: 1, minWidth: 130, padding: '10px 14px', borderRadius: 10, background: '#e2e8f0', border: '1px solid #e2e8f0', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}
                >
                  Review Scores
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}

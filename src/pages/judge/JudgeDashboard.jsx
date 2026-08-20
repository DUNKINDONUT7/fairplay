import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import { getBusinessActorId } from '../../utils/identity';

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 18,
  padding: 24,
  backdropFilter: 'blur(12px)',
};

export default function JudgeDashboard() {
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

  const assignments = useMemo(() => getJudgeAssignments(user), [getJudgeAssignments, user]);
  const assignedEvents = useMemo(
    () =>
      assignments
        .map((assignment) => events.find((event) => String(event.id) === String(assignment.eventId)))
        .filter(Boolean),
    [assignments, events]
  );

  const totals = useMemo(() => {
    const eventIds = new Set(assignedEvents.map((event) => String(event.id)));
    const scores = Object.values(useScoreStore.getState().scores).filter(
      (score) =>
        String(score.judgeId) === String(judgeId) && eventIds.has(String(score.eventId))
    );

    return {
      assignedEvents: assignedEvents.length,
      submittedScores: scores.length,
      activeEvents: assignedEvents.filter((event) => event.status === 'active').length,
      pendingEvents: assignedEvents.filter((event) => event.status !== 'completed').length,
    };
  }, [assignedEvents, judgeId]);

  return (
    <DashboardLayout title="Judge Dashboard" subtitle="Track assigned events, submit scores, and review judging activity">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Assigned Events', value: totals.assignedEvents, accent: '#2563eb', icon: 'bi bi-calendar-event' },
          { label: 'Active Sessions', value: totals.activeEvents, accent: '#10b981', icon: 'bi bi-broadcast' },
          { label: 'Scores Submitted', value: totals.submittedScores, accent: '#f59e0b', icon: 'bi bi-check2-square' },
          { label: 'Pending Events', value: totals.pendingEvents, accent: '#8b5cf6', icon: 'bi bi-hourglass-split' },
        ].map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{ ...cardStyle, borderTop: `3px solid ${item.accent}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>{item.label}</span>
              <i className={item.icon} style={{ color: item.accent, fontSize: 18 }} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a' }}>{item.value}</div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Assigned Events</h3>
              <p style={{ fontSize: 13, color: '#64748b' }}>Real event assignments and judging progress</p>
            </div>
            <button
              onClick={() => navigate('/judge/events')}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
            >
              Open Event List
            </button>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {assignedEvents.length === 0 ? (
              <div style={{ padding: 36, borderRadius: 14, background: '#0f172a', textAlign: 'center', color: '#64748b' }}>
                No judge assignments yet. Once the organizer assigns you to an event, it will appear here.
              </div>
            ) : (
              assignedEvents.map((event, index) => {
                const contestantCount = Array.isArray(event.contestants) ? event.contestants.length : Number(event.participants || 0);
                const myScores = getScoresByJudge(event.id, judgeId || 0);
                const completion = contestantCount ? Math.round((myScores.length / contestantCount) * 100) : 0;

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, #eff6ff, #ffffff)', border: '1px solid #dbeafe' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <h4 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{event.title}</h4>
                        <p style={{ fontSize: 13, color: '#64748b' }}>{event.type} • {event.location || 'Venue to be announced'}</p>
                      </div>
                      <span style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, background: event.status === 'active' ? 'rgba(16,185,129,0.16)' : 'rgba(59,130,246,0.16)', color: event.status === 'active' ? '#34d399' : '#60a5fa', fontSize: 12, fontWeight: 700 }}>
                        {event.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 12 }}>
                      <div style={{ padding: 12, borderRadius: 12, background: '#0f172a' }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Contestants</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{contestantCount}</div>
                      </div>
                      <div style={{ padding: 12, borderRadius: 12, background: '#0f172a' }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Criteria</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{event.criteria?.length || 0}</div>
                      </div>
                      <div style={{ padding: 12, borderRadius: 12, background: '#0f172a' }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Your Progress</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{myScores.length}/{contestantCount || 0}</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#64748b' }}>
                        <span>Scoring completion</span>
                        <span>{completion}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${completion}%`, background: 'linear-gradient(90deg, #2563eb, #22c55e)' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => navigate(`/judge/scoring?eventId=${event.id}`)}
                        style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)', color: '#04111d', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Start Scoring
                      </button>
                      <button
                        onClick={() => navigate(`/judge/review?eventId=${event.id}`)}
                        style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.24)', background: '#ffffff', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Review Submissions
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, background: 'linear-gradient(180deg, #eff6ff, #ffffff)' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Judging Workflow</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>The scoring flow now follows the same live data path used by organizers and public leaderboards.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { title: '1. Open assignment', text: 'Choose an event from your assigned queue or direct scoring link.' },
              { title: '2. Submit scores', text: 'Each criterion is stored in the score store and can sync to Supabase.' },
              { title: '3. Review activity', text: 'Your review and history pages now reflect actual records, not mock entries.' },
              { title: '4. Final publication', text: 'Once the organizer finalizes results, leaderboards and certificates update from the same dataset.' },
            ].map((step) => (
              <div key={step.title} style={{ padding: 14, borderRadius: 14, background: '#0f172a', border: '1px solid rgba(148,163,184,0.08)' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{step.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

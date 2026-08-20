import { useEffect, useMemo } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import { getBusinessActorId } from '../../utils/identity';

export default function JudgeHistory() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { fetchJudges, ensureJudgeProfileForUser, getJudgeAssignments, getJudgeForActor } = useJudgeStore();
  const { fetchScores, getScoresByJudge, calculateWeightedTotal } = useScoreStore();
  const judgeId = getJudgeForActor(user)?.id || getBusinessActorId(user);

  useEffect(() => {
    fetchEvents();
    fetchJudges();
    fetchScores();
    ensureJudgeProfileForUser(user);
  }, [ensureJudgeProfileForUser, fetchEvents, fetchJudges, fetchScores, user]);

  const history = useMemo(() => {
    const assignments = getJudgeAssignments(user);

    return assignments
      .map((assignment) => {
        const event = events.find((item) => String(item.id) === String(assignment.eventId));
        if (!event) return null;

        const scores = getScoresByJudge(event.id, judgeId || 0);
        const contestants = Array.isArray(event.contestants) ? event.contestants.length : Number(event.participants || 0);
        const average = scores.length
          ? Math.round(
              (scores.reduce((total, score) => total + calculateWeightedTotal(event.criteria || [], score.criteriaScores).totalScore, 0) / scores.length) * 100
            ) / 100
          : 0;

        return {
          date: event.endDate || event.startDate || event.created_at || new Date().toISOString(),
          event: event.title,
          contestants,
          scores: scores.length,
          avgScore: average,
        };
      })
      .filter(Boolean)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [calculateWeightedTotal, events, getJudgeAssignments, getScoresByJudge, judgeId, user]);

  return (
    <DashboardLayout title="Submission History" subtitle="Audit your completed and in-progress judging activity">
      <div style={{ overflowX: 'auto', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              {['Date', 'Event', 'Contestants', 'Scores Submitted', 'Average Score', 'Status'].map((header) => (
                <th key={header} style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  No judging history available yet.
                </td>
              </tr>
            ) : (
              history.map((item) => {
                const complete = item.contestants > 0 && item.scores >= item.contestants;
                return (
                  <tr key={`${item.event}-${item.date}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '14px 18px', color: '#64748b' }}>{new Date(item.date).toLocaleDateString()}</td>
                    <td style={{ padding: '14px 18px', fontWeight: 600 }}>{item.event}</td>
                    <td style={{ padding: '14px 18px', color: '#cbd5e1' }}>{item.contestants}</td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: complete ? '#34d399' : '#f59e0b' }}>{item.scores}/{item.contestants}</td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#2563eb' }}>{item.avgScore}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: complete ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)', color: complete ? '#34d399' : '#fbbf24' }}>
                        {complete ? 'Complete' : 'Partial'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

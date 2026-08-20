import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import { getBusinessActorId } from '../../utils/identity';

export default function JudgeReview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { fetchJudges, ensureJudgeProfileForUser, getJudgeForActor } = useJudgeStore();
  const { fetchScores, getScoresByJudge, calculateWeightedTotal } = useScoreStore();
  const judgeId = getJudgeForActor(user)?.id || getBusinessActorId(user);

  const eventId = searchParams.get('eventId');

  useEffect(() => {
    fetchEvents();
    fetchJudges();
    fetchScores(eventId || undefined);
    ensureJudgeProfileForUser(user);
  }, [ensureJudgeProfileForUser, eventId, fetchEvents, fetchJudges, fetchScores, user]);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === String(eventId)) || events[0] || null,
    [eventId, events]
  );

  const submissions = useMemo(() => {
    if (!selectedEvent || !user) return [];

    return getScoresByJudge(selectedEvent.id, judgeId).map((score) => {
      const totals = calculateWeightedTotal(selectedEvent.criteria || [], score.criteriaScores || {});
      return {
        id: score.id,
        contestant: score.contestantName,
        event: score.eventTitle || selectedEvent.title,
        score: totals.totalScore,
        status: score.locked ? 'locked' : 'submitted',
        timestamp: score.timestamp,
        contestantId: score.contestantId,
      };
    });
  }, [calculateWeightedTotal, getScoresByJudge, judgeId, selectedEvent, user]);

  return (
    <DashboardLayout title="Score Review" subtitle="Review the scores you already submitted before final lock">
      <div style={{ marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {events.map((event) => (
          <button
            key={event.id}
            onClick={() => navigate(`/judge/review?eventId=${event.id}`)}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid #dbeafe',
              background: String(selectedEvent?.id) === String(event.id) ? '#dbeafe' : '#ffffff',
              color: String(selectedEvent?.id) === String(event.id) ? '#2563eb' : '#cbd5e1',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {event.title}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              {['Contestant', 'Event', 'Computed Score', 'Status', 'Submitted At', 'Action'].map((header) => (
                <th key={header} style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  No saved scores found for this event yet.
                </td>
              </tr>
            ) : (
              submissions.map((submission) => (
                <tr key={submission.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 600 }}>{submission.contestant}</td>
                  <td style={{ padding: '14px 18px', color: '#64748b' }}>{submission.event}</td>
                  <td style={{ padding: '14px 18px', fontSize: 22, fontWeight: 800, color: '#34d399' }}>{submission.score}</td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: submission.status === 'locked' ? 'rgba(244,114,182,0.14)' : 'rgba(16,185,129,0.14)', color: submission.status === 'locked' ? '#f472b6' : '#34d399' }}>
                      {submission.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748b' }}>{new Date(submission.timestamp).toLocaleString()}</td>
                  <td style={{ padding: '14px 18px' }}>
                    <button
                      disabled={submission.status === 'locked'}
                      onClick={() => navigate(`/judge/scoring?eventId=${selectedEvent.id}&contestantId=${submission.contestantId}`)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid #bfdbfe',
                        background: submission.status === 'locked' ? '#e2e8f0' : '#eff6ff',
                        color: submission.status === 'locked' ? '#64748b' : '#2563eb',
                        fontWeight: 600,
                        cursor: submission.status === 'locked' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {submission.status === 'locked' ? 'Locked' : 'Edit Score'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

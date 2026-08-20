import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useNotificationStore from '../../store/notificationStore';
import useScoreStore from '../../store/scoreStore';
import { getBusinessActorId } from '../../utils/identity';

export default function JudgeScoring() {
  const { sessionId, token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { success, error } = useNotificationStore();
  const { events, getEventById, fetchEvents } = useEventStore();
  const { fetchJudges, ensureJudgeProfileForUser, getJudgeForActor } = useJudgeStore();
  const { fetchScores, submitScore, updateScore, getScoreByKey } = useScoreStore();

  const initialEventId = searchParams.get('eventId') || location.state?.eventId || '';
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [selectedContestantId, setSelectedContestantId] = useState('');
  const [scores, setScores] = useState({});

  const judgeId = getJudgeForActor(user)?.id || getBusinessActorId(user);
  const resolvedEvent = selectedEventId ? getEventById(selectedEventId) : null;
  const contestants = Array.isArray(resolvedEvent?.contestants) && resolvedEvent.contestants.length > 0
    ? resolvedEvent.contestants
    : [];
  const criteria = resolvedEvent?.criteria || [];
  const selectedContestant = contestants.find((c) => String(c.id) === String(selectedContestantId)) || null;

  useEffect(() => {
    fetchEvents();
    fetchJudges();
    ensureJudgeProfileForUser(user);
  }, [ensureJudgeProfileForUser, fetchEvents, fetchJudges, user]);

  useEffect(() => {
    if (!selectedEventId) return;
    fetchScores(selectedEventId);
    setSelectedContestantId('');
    setScores({});
  }, [fetchScores, selectedEventId]);

  useEffect(() => {
    if (!resolvedEvent || !selectedContestant || !judgeId) return;
    const existingScore = getScoreByKey(resolvedEvent.id, judgeId, selectedContestant.id);
    if (existingScore?.criteriaScores) {
      setScores(existingScore.criteriaScores);
      return;
    }
    const nextScores = {};
    criteria.forEach((criterion) => { nextScores[criterion.id] = 0; });
    setScores(nextScores);
  }, [criteria, getScoreByKey, judgeId, resolvedEvent, selectedContestant]);

  const handleEventChange = (eventId) => {
    setSelectedEventId(eventId);
    setSearchParams(eventId ? { eventId } : {});
  };

  const handleScoreChange = (criteriaId, value) => {
    setScores((previous) => ({ ...previous, [criteriaId]: value }));
  };

  const handleSubmit = async () => {
    if (!resolvedEvent || !selectedContestant || !user || !judgeId) {
      error('Scoring session is incomplete. Please select an event and contestant.');
      return;
    }

    const existingScore = getScoreByKey(resolvedEvent.id, judgeId, selectedContestant.id);
    const payload = {
      contestantName: selectedContestant.name,
      eventTitle: resolvedEvent.title,
      judgeName: user.name,
      sessionId: sessionId || token || 'manual-session',
    };

    if (existingScore) {
      await updateScore(resolvedEvent.id, judgeId, selectedContestant.id, scores, payload);
      success('Score updated successfully.');
    } else {
      await submitScore(resolvedEvent.id, judgeId, selectedContestant.id, scores, payload);
      success('Score submitted successfully.');
    }

    navigate('/judge/review', { replace: true });
  };

  const scoringEvents = events.filter((e) => e.status === 'active' || e.status === 'upcoming' || e.status === 'ongoing');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <button
        onClick={() => navigate('/judge')}
        style={{
          background: 'transparent',
          color: '#64748b',
          marginBottom: '24px',
          cursor: 'pointer',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          alignSelf: 'flex-start',
          fontWeight: 600,
        }}
      >
        <i className="bi bi-arrow-left" /> Back to Dashboard
      </button>

      <div style={{ width: '100%', maxWidth: '860px' }}>
        {/* Event selector */}
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)', borderRadius: '20px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ color: '#2563eb', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Judge Session
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>Select Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => handleEventChange(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: `1px solid ${selectedEventId ? '#93c5fd' : '#fca5a5'}`, color: selectedEventId ? '#0f172a' : '#64748b', fontSize: '14px' }}
            >
              <option value="">— Select an event to score —</option>
              {scoringEvents.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
              {scoringEvents.length === 0 && events.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>

          {resolvedEvent && (
            <>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>{resolvedEvent.title}</h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>Contestant</label>
                  {contestants.length > 0 ? (
                    <select
                      value={selectedContestant?.id || ''}
                      onChange={(e) => setSelectedContestantId(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}
                    >
                      <option value="">— Select contestant —</option>
                      {contestants.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px' }}>
                      No contestants added to this event yet. Ask the organizer to add contestants first.
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>Assigned Judge</label>
                  <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                    {user?.name || 'Judge'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {!selectedEventId && (
          <div style={{ background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)', borderRadius: '20px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚖️</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>Select an event to start scoring</p>
            <p style={{ fontSize: '13px' }}>Choose the event you are assigned to judge from the dropdown above.</p>
          </div>
        )}

        {resolvedEvent && selectedContestant && (
          criteria.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: '20px', padding: '24px', color: '#0f172a' }}>
              This event has no scoring criteria yet. Ask the organizer to add criteria to this event.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {criteria.map((criterion) => {
                  const rangeMax = Number(String(criterion.scoringRange || '10').split('-').pop()) || 10;
                  const score = scores[criterion.id] ?? 0;
                  const buttons = Array.from({ length: rangeMax + 1 }, (_, i) => i);
                  return (
                    <div key={criterion.id} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '18px', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ color: '#0f172a', fontWeight: 700, fontSize: '17px', display: 'block' }}>{criterion.name}</label>
                          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>{criterion.description}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: '12px', backgroundColor: '#eff6ff', color: '#2563eb', padding: '5px 10px', borderRadius: '999px' }}>
                            Weight {criterion.weight}%
                          </span>
                          <div style={{ minWidth: 52, textAlign: 'center', backgroundColor: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8', fontFamily: 'monospace', fontSize: 24, fontWeight: 800, padding: '6px 10px', borderRadius: 10 }}>
                            {score}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {buttons.map((n) => {
                          const isSelected = score === n;
                          return (
                            <button
                              key={n}
                              onClick={() => handleScoreChange(criterion.id, n)}
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                border: isSelected ? '2px solid #2563eb' : '2px solid #e2e8f0',
                                background: isSelected ? '#dbeafe' : '#f8fafc',
                                color: isSelected ? '#1d4ed8' : '#64748b',
                                fontWeight: isSelected ? 800 : 600,
                                fontSize: 15,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleSubmit}
                style={{
                  width: '100%',
                  marginTop: '28px',
                  padding: '16px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 10px 30px rgba(37,99,235,0.25)',
                }}
              >
                Save Score
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}

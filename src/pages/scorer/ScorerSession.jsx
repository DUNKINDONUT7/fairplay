import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import useEventStore from '../../store/eventStore';
import useTournamentStore from '../../store/tournamentStore';
import { ensureEventTournamentAutomation } from '../../services/automationService';

function statusBadge(status) {
  const map = {
    completed: { label: 'Completed', bg: '#dcfce7', color: '#16a34a' },
    'in-progress': { label: 'In Progress', bg: '#fef9c3', color: '#ca8a04' },
    bye: { label: 'BYE', bg: '#f1f5f9', color: '#64748b' },
    scheduled: { label: 'Scheduled', bg: '#eff6ff', color: '#2563eb' },
    pending: { label: 'Pending', bg: '#f1f5f9', color: '#94a3b8' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, letterSpacing: '0.04em' }}>
      {s.label}
    </span>
  );
}

export default function ScorerSession() {
  const { token } = useParams();
  const { events, fetchEvents } = useEventStore();
  const { tournaments, fetchTournaments, updateMatchDraft, saveMatchResult } = useTournamentStore();

  const [phase, setPhase] = useState('loading');
  const [event, setEvent] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [saving, setSaving] = useState(null);
  const [localScores, setLocalScores] = useState({});

  useEffect(() => {
    async function init() {
      await fetchEvents();
      await fetchTournaments();

      const allEvents = useEventStore.getState().events;
      let matchedEvent = null;
      let matchedAssignment = null;

      for (const e of allEvents) {
        const found = (e.scorerAssignments || []).find((a) => a.token === token);
        if (found) {
          matchedEvent = e;
          matchedAssignment = found;
          break;
        }
      }

      if (!matchedEvent || !matchedAssignment) {
        setPhase('error');
        return;
      }

      await ensureEventTournamentAutomation(matchedEvent, matchedEvent.contestants || []);
      await fetchTournaments();
      setEvent(matchedEvent);
      setAssignment(matchedAssignment);
      setPhase('ready');
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const currentTournament = useMemo(() => {
    if (!event) return null;
    const eventTournaments = tournaments.filter((t) => String(t.eventId) === String(event.id));
    if (assignment?.subEventId || assignment?.subEventName) {
      const assignedSubEventId = String(assignment.subEventId || '');
      const assignedSubEventName = String(assignment.subEventName || '').trim().toLowerCase();
      return eventTournaments.find((t) =>
        String(t.subEventId || t.name || '') === assignedSubEventId ||
        String(t.subEventName || '').trim().toLowerCase() === assignedSubEventName ||
        String(t.title || '').trim().toLowerCase().endsWith(`- ${assignedSubEventName}`)
      ) || eventTournaments[0] || null;
    }
    return eventTournaments[0] || null;
  }, [assignment, event, tournaments]);

  const matchesByRound = useMemo(() => {
    if (!currentTournament?.matches) return [];
    const rounds = {};
    currentTournament.matches.forEach((m) => {
      const r = m.round || 1;
      if (!rounds[r]) rounds[r] = [];
      rounds[r].push(m);
    });
    return Object.entries(rounds)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([round, matches]) => ({ round: Number(round), matches }));
  }, [currentTournament]);

  function setScore(matchId, field, value) {
    setLocalScores((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] || {}), [field]: value },
    }));
    if (currentTournament) {
      updateMatchDraft(currentTournament.id, matchId, field, value);
    }
  }

  async function submitMatch(matchId) {
    if (!currentTournament) return;
    setSaving(matchId);
    try {
      await saveMatchResult(currentTournament.id, matchId);
      await fetchTournaments();
    } finally {
      setSaving(null);
    }
  }

  function getScore(match, field) {
    return localScores[match.id]?.[field] ?? match[field] ?? 0;
  }

  if (phase === 'loading') {
    return (
      <div style={fullPage}>
        <i className="bi bi-arrow-repeat" style={{ fontSize: 40, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Loading scorer session...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={fullPage}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
        <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 8 }}>QR Code Not Found</div>
        <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 300 }}>This scorer QR code is invalid or has been removed by the organizer.</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!currentTournament || currentTournament.matches?.length === 0) {
    return (
      <div style={fullPage}>
        <div style={gateCard}>
          <div style={{ textAlign: 'center' }}>
            <i className="bi bi-hourglass-split" style={{ fontSize: 40, color: '#94a3b8', display: 'block', marginBottom: 12 }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginBottom: 6 }}>{event?.title}</div>
            {assignment?.subEventName && (
              <div style={{ fontSize: 13, color: '#2563eb', fontWeight: 600, marginBottom: 12 }}>
                <i className="bi bi-diagram-3" style={{ marginRight: 4 }} />{assignment.subEventName}
              </div>
            )}
            <div style={{ fontSize: 14, color: '#64748b' }}>
              Bracket hasn't been generated yet.<br />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Wait for the organizer to set up the bracket.</span>
            </div>
            <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
              <i className="bi bi-person-fill" style={{ marginRight: 6, color: '#2563eb' }} />
              Logged in as: <strong>{assignment?.name}</strong>
            </div>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef4ff', paddingBottom: 40 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Game Scorer{assignment?.subEventName ? ` · ${assignment.subEventName}` : ''}
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{event?.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px' }}>
          <i className="bi bi-person-fill" style={{ color: '#fff', fontSize: 14 }} />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{assignment?.name}</span>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
        {/* Bracket status */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {currentTournament.champion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 16px' }}>
              <i className="bi bi-trophy-fill" style={{ color: '#d97706' }} />
              <span style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>
                Champion: {currentTournament.champion?.name || currentTournament.champion}
              </span>
            </div>
          )}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#475569' }}>
            <span style={{ fontWeight: 700 }}>
              {currentTournament.bracketType === 'round-robin' ? 'Round Robin' : 'Single Elimination'}
            </span>
            {' · '}Round {currentTournament.currentRound || 1} of {currentTournament.totalRounds || '?'}
          </div>
        </div>

        {/* Matches by round */}
        {matchesByRound.map(({ round, matches }) => (
          <div key={round} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              Round {round}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {matches.map((match) => {
                const isDone = match.status === 'completed' || match.status === 'bye';
                const isBye = match.status === 'bye';
                const isActive = saving === match.id;

                return (
                  <div key={match.id} style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: `1px solid ${isDone ? '#e2e8f0' : '#bfdbfe'}`,
                    padding: '16px 20px',
                    boxShadow: isDone ? 'none' : '0 4px 16px rgba(37,99,235,0.08)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Match {match.id}</span>
                      {statusBadge(match.status)}
                    </div>

                    {isBye ? (
                      <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: '8px 0' }}>
                        <strong>{match.team1?.name || match.winner?.name || '—'}</strong> advances via BYE
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                          {/* Team 1 */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: match.winner?.id === match.team1?.id ? '#16a34a' : '#0f172a', marginBottom: 8 }}>
                              {match.team1?.name || 'TBD'}
                              {match.winner?.id === match.team1?.id && (
                                <i className="bi bi-trophy-fill" style={{ color: '#d97706', marginLeft: 6, fontSize: 12 }} />
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={getScore(match, 'score1')}
                              onChange={(e) => setScore(match.id, 'score1', e.target.value)}
                              disabled={isDone || !match.team1}
                              style={{
                                ...scoreInput,
                                borderColor: match.winner?.id === match.team1?.id ? '#16a34a' : '#e2e8f0',
                                opacity: (!match.team1 || isDone) ? 0.5 : 1,
                              }}
                            />
                          </div>

                          <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, color: '#94a3b8' }}>VS</div>

                          {/* Team 2 */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: match.winner?.id === match.team2?.id ? '#16a34a' : '#0f172a', marginBottom: 8 }}>
                              {match.team2?.name || 'TBD'}
                              {match.winner?.id === match.team2?.id && (
                                <i className="bi bi-trophy-fill" style={{ color: '#d97706', marginLeft: 6, fontSize: 12 }} />
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={getScore(match, 'score2')}
                              onChange={(e) => setScore(match.id, 'score2', e.target.value)}
                              disabled={isDone || !match.team2}
                              style={{
                                ...scoreInput,
                                borderColor: match.winner?.id === match.team2?.id ? '#16a34a' : '#e2e8f0',
                                opacity: (!match.team2 || isDone) ? 0.5 : 1,
                              }}
                            />
                          </div>
                        </div>

                        {!isDone && match.team1 && match.team2 && (
                          <button
                            onClick={() => submitMatch(match.id)}
                            disabled={isActive}
                            style={{
                              marginTop: 16,
                              width: '100%',
                              padding: '12px',
                              borderRadius: 12,
                              border: 'none',
                              background: isActive ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: 14,
                              cursor: isActive ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                            }}
                          >
                            {isActive
                              ? <><i className="bi bi-arrow-repeat" style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                              : <><i className="bi bi-check2-circle" /> Submit Result</>
                            }
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const fullPage = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const gateCard = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 24,
  padding: 36,
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
};

const scoreInput = {
  width: '100%',
  padding: '12px',
  borderRadius: 12,
  border: '2px solid #e2e8f0',
  fontSize: 22,
  fontWeight: 800,
  textAlign: 'center',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
};

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useEventStore from '../../store/eventStore';
import useTournamentStore from '../../store/tournamentStore';
import { ensureEventTournamentAutomation } from '../../services/automationService';

const STORAGE_KEY = 'fairplay_judge_identity';

function getStoredScorer() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

const TOURNAMENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

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

export default function ScorerLiveScoring() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { events, fetchEvents } = useEventStore();
  const { tournaments, fetchTournaments, updateMatchDraft, saveMatchResult } = useTournamentStore();

  const [event, setEvent] = useState(null);
  const [scorer, setScorer] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [selectedSubEvent, setSelectedSubEvent] = useState(null);
  const [saving, setSaving] = useState(null);
  const [localScores, setLocalScores] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    async function init() {
      await fetchEvents();
      await fetchTournaments();

      const allEvents = useEventStore.getState().events;
      const matched = allEvents.find((e) =>
        (e.judgeSessions || []).some((s) => s.sessionId === sessionId)
      );

      if (!matched) { setPhase('error'); return; }

      await ensureEventTournamentAutomation(matched, matched.contestants || []);
      await fetchTournaments();
      setEvent(matched);

      if (matched.eventType === 'sportsfest' && matched.subEvents?.length > 0) {
        setSelectedSubEvent(matched.subEvents[0].id);
      }

      const stored = getStoredScorer();
      setScorer(stored);
      setPhase('ready');
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const isSportsFest = event?.eventType === 'sportsfest';

  const currentTournament = useMemo(() => {
    if (!event) return null;
    if (isSportsFest && selectedSubEvent) {
      const selected = (event.subEvents || []).find((subEvent) => String(subEvent.id) === String(selectedSubEvent));
      const selectedName = String(selected?.name || selected?.title || '').trim().toLowerCase();
      return tournaments.find(
        (t) => String(t.eventId) === String(event.id) &&
               (
                 String(t.subEventId || t.name || '') === String(selectedSubEvent) ||
                 String(t.subEventName || '').trim().toLowerCase() === selectedName ||
                 String(t.title || '').trim().toLowerCase().endsWith(`- ${selectedName}`)
               )
      ) || tournaments.find((t) => String(t.eventId) === String(event.id));
    }
    return tournaments.find((t) => String(t.eventId) === String(event.id)) || null;
  }, [event, tournaments, isSportsFest, selectedSubEvent]);

  const allMatchesCompleted = useMemo(() => {
    if (!currentTournament?.matches) return false;
    return currentTournament.matches.every((m) => m.status === 'completed' || m.status === 'bye');
  }, [currentTournament]);

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
    updateMatchDraft(currentTournament.id, matchId, field, value);
  }

  async function submitMatch(matchId) {
    if (!currentTournament) return;
    setError(null);
    setSaving(matchId);
    try {
      await saveMatchResult(currentTournament.id, matchId);
      await fetchTournaments();
    } catch (err) {
      console.error('Error saving match:', err);
      setError(err.message || 'Failed to save match result');
    } finally {
      setSaving(null);
    }
  }

  function isTieMatch(match) {
    const score1 = Number(getScore(match, 'score1') || 0);
    const score2 = Number(getScore(match, 'score2') || 0);
    return score1 === score2;
  }

  function canSubmitMatch(match) {
    // Allow submit for round-robin (ties allowed)
    if (currentTournament?.bracketType === 'round-robin') {
      return true;
    }
    // For elimination, don't allow ties
    return !isTieMatch(match);
  }

  function getScore(match, field) {
    return localScores[match.id]?.[field] ?? match[field] ?? 0;
  }

  if (phase === 'loading') {
    return (
      <div style={fullPage}>
        <i className="bi bi-arrow-repeat" style={{ fontSize: 40, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Loading bracket...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={fullPage}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
        <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 8 }}>Session not found</div>
        <p style={{ color: '#64748b' }}>This QR code or session link is invalid or has expired.</p>
      </div>
    );
  }

  if (!currentTournament || currentTournament.matches?.length === 0) {
    return (
      <div style={fullPage}>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <i className="bi bi-hourglass-split" style={{ fontSize: 48, color: '#94a3b8', marginBottom: 16, display: 'block' }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginBottom: 8 }}>{event?.title}</div>
            <div style={{ color: '#64748b', fontSize: 14 }}>Bracket hasn't been generated yet.</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 6 }}>Wait for the organizer to set up the bracket.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef4ff', padding: '0 0 40px' }}>
      {/* Top bar */}
      <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Game Scorer</div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{event?.title}</div>
        </div>
        {scorer?.judgeName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px' }}>
            <i className="bi bi-person-fill" style={{ color: '#fff', fontSize: 14 }} />
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{scorer.judgeName}</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: 20, padding: 16, borderRadius: 12,
            background: '#fee2e2', border: '1.5px solid #fca5a5',
            display: 'flex', alignItems: 'center', gap: 12
          }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 20, color: '#dc2626' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#7f1d1d', fontSize: 14 }}>Error</div>
              <div style={{ fontSize: 13, color: '#991b1b' }}>{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}
            >
              ×
            </button>
          </div>
        )}
        {/* All matches completed banner */}
        {allMatchesCompleted && (
          <div style={{
            marginBottom: 20, padding: 24, borderRadius: 16,
            background: '#f0fdf4', border: '1.5px solid #86efac',
            display: 'flex', alignItems: 'center', gap: 14, flexDirection: 'column', textAlign: 'center'
          }}>
            <i className="bi bi-check-circle-fill" style={{ fontSize: 48, color: '#16a34a' }} />
            <div>
              <div style={{ fontWeight: 800, color: '#166534', fontSize: 18, marginBottom: 4 }}>All matches scored!</div>
              <div style={{ fontSize: 14, color: '#4ade80', marginBottom: 16 }}>Thank you for scoring. Tournament results have been recorded.</div>
              <button
                onClick={() => navigate(`/scorer/events`)}
                style={{
                  padding: '12px 24px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer'
                }}
              >
                <i className="bi bi-arrow-left" style={{ marginRight: 8 }} /> Back to Events
              </button>
            </div>
          </div>
        )}
        {isSportsFest && event?.subEvents?.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {event.subEvents.filter((se) => se.name?.trim()).map((se) => (
              <button
                key={se.id}
                onClick={() => setSelectedSubEvent(se.id)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 20,
                  border: '1px solid',
                  borderColor: selectedSubEvent === se.id ? '#2563eb' : '#e2e8f0',
                  background: selectedSubEvent === se.id ? '#2563eb' : '#fff',
                  color: selectedSubEvent === se.id ? '#fff' : '#334155',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {se.name}
              </button>
            ))}
          </div>
        )}

        {/* Bracket status */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {currentTournament.champion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 16px' }}>
              <i className="bi bi-trophy-fill" style={{ color: '#d97706' }} />
              <span style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>Champion: {currentTournament.champion?.name || currentTournament.champion}</span>
            </div>
          )}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#475569' }}>
            <span style={{ fontWeight: 700 }}>{currentTournament.bracketType === 'round-robin' ? 'Round Robin' : 'Single Elimination'}</span>
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
                  <div key={match.id} style={{ background: '#fff', borderRadius: 16, border: `1px solid ${isDone ? '#e2e8f0' : '#bfdbfe'}`, padding: '16px 20px', boxShadow: isDone ? 'none' : '0 4px 16px rgba(37,99,235,0.08)' }}>
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
                              {match.winner?.id === match.team1?.id && <i className="bi bi-trophy-fill" style={{ color: '#d97706', marginLeft: 6, fontSize: 12 }} />}
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={getScore(match, 'score1')}
                              onChange={(e) => setScore(match.id, 'score1', e.target.value)}
                              disabled={isDone || !match.team1}
                              style={{ ...scoreInput, borderColor: match.winner?.id === match.team1?.id ? '#16a34a' : '#e2e8f0' }}
                            />
                          </div>

                          {/* VS */}
                          <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, color: '#94a3b8' }}>VS</div>

                          {/* Team 2 */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: match.winner?.id === match.team2?.id ? '#16a34a' : '#0f172a', marginBottom: 8 }}>
                              {match.team2?.name || 'TBD'}
                              {match.winner?.id === match.team2?.id && <i className="bi bi-trophy-fill" style={{ color: '#d97706', marginLeft: 6, fontSize: 12 }} />}
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={getScore(match, 'score2')}
                              onChange={(e) => setScore(match.id, 'score2', e.target.value)}
                              disabled={isDone || !match.team2}
                              style={{ ...scoreInput, borderColor: match.winner?.id === match.team2?.id ? '#16a34a' : '#e2e8f0' }}
                            />
                          </div>
                        </div>

                        {!isDone && match.team1 && match.team2 && (
                          <>
                            <button
                              onClick={() => submitMatch(match.id)}
                              disabled={isActive || !canSubmitMatch(match)}
                              style={{
                                marginTop: 16,
                                width: '100%',
                                padding: '12px',
                                borderRadius: 12,
                                border: 'none',
                                background: (isActive || !canSubmitMatch(match)) ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: 14,
                                cursor: (isActive || !canSubmitMatch(match)) ? 'not-allowed' : 'pointer',
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
                            {!canSubmitMatch(match) && currentTournament?.bracketType !== 'round-robin' && (
                              <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className="bi bi-exclamation-circle-fill" />
                                Elimination matches cannot end in a tie. Set different scores to continue.
                              </div>
                            )}
                          </>
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

const card = {
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
  transition: 'border-color 0.2s',
};

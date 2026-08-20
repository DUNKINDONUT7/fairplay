import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useEventStore from '../../store/eventStore';
import useAudienceScoreStore from '../../store/audienceScoreStore';

function getVoterKey(eventId) {
  const key = `fairplay_audience_voter_${eventId}`;
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, value);
  }
  return value;
}

function isVotingAllowed(event) {
  if (!event) return false;
  const audienceEnabled = Boolean(event.audienceImpactEnabled ?? event.audienceImpact);
  const statusAllowed = ['active', 'ongoing', 'upcoming'].includes(String(event.status || '').toLowerCase());
  return audienceEnabled && Boolean(event.audienceVotingOpen) && statusAllowed;
}

export default function AudienceScoring() {
  const { eventId } = useParams();
  const { events, fetchEvents } = useEventStore();
  const { submitAudienceScore, fetchAudienceScores, getAudienceSummary, subscribeToAudienceScores, submissions } = useAudienceScoreStore();
  const [selectedContestantId, setSelectedContestantId] = useState('');
  const [score, setScore] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      await Promise.all([fetchEvents(), fetchAudienceScores(eventId)]);
      if (mounted) setLoaded(true);
    }
    load();
    return () => { mounted = false; };
  }, [eventId, fetchAudienceScores, fetchEvents]);

  useEffect(() => {
    return subscribeToAudienceScores(eventId);
  }, [eventId, subscribeToAudienceScores]);

  const voterKey = useMemo(() => (eventId ? getVoterKey(eventId) : ''), [eventId]);
  const event = events.find((entry) => String(entry.id) === String(eventId)) || null;
  const contestants = Array.isArray(event?.contestants) ? event.contestants : [];
  const votedContestantIds = useMemo(() => {
    const ids = new Set();
    Object.values(submissions).forEach((submission) => {
      if (String(submission.eventId) === String(eventId) && String(submission.voterKey) === String(voterKey)) {
        ids.add(String(submission.contestantId));
      }
    });
    return ids;
  }, [eventId, submissions, voterKey]);
  const summary = useMemo(() => getAudienceSummary(eventId), [eventId, getAudienceSummary, submissions]);
  const audienceRanking = useMemo(() => (
    contestants
      .map((contestant) => {
        const row = summary.byContestant[String(contestant.id)];
        return {
          contestant,
          averageScore: row?.averageScore || 0,
          count: row?.count || 0,
          total: row?.total || 0,
        };
      })
      .sort((left, right) => {
        if (right.total !== left.total) return right.total - left.total;
        if (right.averageScore !== left.averageScore) return right.averageScore - left.averageScore;
        if (right.count !== left.count) return right.count - left.count;
        return String(left.contestant.name || left.contestant.teamName || '').localeCompare(String(right.contestant.name || right.contestant.teamName || ''));
      })
  ), [contestants, summary]);
  const votingAllowed = isVotingAllowed(event);

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    setError('');
    setMessage('');

    const contestant = contestants.find((entry) => String(entry.id) === String(selectedContestantId));
    if (!contestant) {
      setError('Please select a participant.');
      return;
    }

    if (votedContestantIds.has(String(contestant.id))) {
      setError('You already voted for this participant from this device.');
      return;
    }

    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 10) {
      setError('Please give a score from 1 to 10.');
      return;
    }

    if (!votingAllowed) {
      setError('Audience scoring is closed for this event.');
      return;
    }

    setBusy(true);
    try {
      await submitAudienceScore({
        eventId,
        contestantId: contestant.id,
        contestantName: contestant.name || contestant.teamName || 'Participant',
        voterKey,
        score: numericScore,
      });
      setMessage('Thank you. Your audience score was submitted.');
      setSelectedContestantId('');
      setScore('');
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit audience score.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#eff6ff,#f8fbff)', color: '#0f172a' }}>
      <header style={{ minHeight: 68, background: '#ffffff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', gap: 12 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon.svg" alt="" style={{ width: 34, height: 34 }} />
          <span style={{ color: '#0f172a', fontWeight: 900, fontSize: 18 }}>FairPlay</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {eventId && (
            <Link to={`/events/${eventId}/leaderboard`} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              Leaderboard
            </Link>
          )}
          <span style={{ padding: '6px 10px', borderRadius: 999, background: votingAllowed ? '#dcfce7' : '#fee2e2', color: votingAllowed ? '#15803d' : '#dc2626', fontSize: 12, fontWeight: 900 }}>
            {votingAllowed ? 'Voting Open' : 'Voting Closed'}
          </span>
        </div>
      </header>

      <main style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '28px 16px 56px', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <p style={{ color: '#2563eb', fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Audience Impact</p>
          <h1 style={{ fontSize: 30, lineHeight: 1.08, margin: 0, fontWeight: 950 }}>{event?.title || 'Event'} Audience Scoring</h1>
          <p style={{ color: '#64748b', marginTop: 10, fontSize: 14 }}>
            {loaded ? 'Select one participant and submit your audience score.' : 'Loading event participants...'}
          </p>
        </div>

        {!event ? (
          <div style={cardStyle}>Event not found.</div>
        ) : !Boolean(event.audienceImpactEnabled ?? event.audienceImpact) ? (
          <div style={cardStyle}>Audience Impact is not enabled for this event.</div>
        ) : (
          <>
            <form onSubmit={handleSubmit} style={cardStyle}>
              <label style={labelStyle}>Participant</label>
              <select value={selectedContestantId} onChange={(e) => setSelectedContestantId(e.target.value)} style={inputStyle} disabled={busy || !votingAllowed}>
                <option value="">Select participant</option>
                {contestants.map((contestant) => (
                  <option key={contestant.id} value={contestant.id}>
                    {contestant.name || contestant.teamName || `Participant ${contestant.id}`}
                    {votedContestantIds.has(String(contestant.id)) ? ' — already voted on this device' : ''}
                  </option>
                ))}
              </select>
              {votedContestantIds.size > 0 && (
                <p style={{ marginTop: -10, marginBottom: 16, fontSize: 12, color: '#64748b' }}>
                  <i className="bi bi-info-circle" /> You can vote once per participant from this device. Switch to a different device or browser to vote again for someone you've already scored.
                </p>
              )}

              <label style={labelStyle}>Audience Score</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScore(String(value))}
                    disabled={busy || !votingAllowed}
                    style={{
                      padding: '12px 0',
                      borderRadius: 12,
                      border: score === String(value) ? '2px solid #2563eb' : '1px solid #bfdbfe',
                      background: score === String(value) ? '#2563eb' : '#eff6ff',
                      color: score === String(value) ? '#ffffff' : '#1d4ed8',
                      fontWeight: 900,
                      cursor: votingAllowed ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>

              {error && <div style={errorStyle}>{error}</div>}
              {message && <div style={successStyle}>{message}</div>}

              <button type="submit" disabled={busy || !votingAllowed || contestants.length === 0} style={submitStyle}>
                {busy ? 'Submitting...' : 'Submit Audience Score'}
              </button>
            </form>

            <div style={{ ...cardStyle, marginTop: 16 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900 }}>Live Audience Ranking</h2>
              <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13 }}>
                {summary.totalSubmissions} audience vote{summary.totalSubmissions === 1 ? '' : 's'} counted live
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {audienceRanking.map(({ contestant, averageScore, count, total }, index) => {
                  const isLeader = index === 0 && count > 0;
                  return (
                    <div key={contestant.id} style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, background: isLeader ? '#eff6ff' : '#f8fafc', border: isLeader ? '1px solid #93c5fd' : '1px solid #e2e8f0' }}>
                      <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: isLeader ? '#2563eb' : '#e0ecff', color: isLeader ? '#ffffff' : '#1d4ed8', fontWeight: 950, fontSize: 13 }}>
                        #{index + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contestant.name || contestant.teamName}</span>
                          {isLeader && <span style={{ padding: '3px 7px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 900 }}>Leading</span>}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                          {count} vote{count === 1 ? '' : 's'} - average {count > 0 ? averageScore.toFixed(2) : '--'}
                        </div>
                      </div>
                      <span style={{ color: count > 0 ? '#2563eb' : '#94a3b8', fontWeight: 950, fontSize: 18, whiteSpace: 'nowrap' }}>
                        {count > 0 ? `${total.toFixed(0)} pts` : '--'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 20,
  boxShadow: '0 18px 45px rgba(37,99,235,0.10)',
};

const labelStyle = {
  display: 'block',
  color: '#0f172a',
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 8,
};

const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  background: '#ffffff',
  marginBottom: 16,
  boxSizing: 'border-box',
};

const submitStyle = {
  width: '100%',
  border: 'none',
  borderRadius: 14,
  padding: 15,
  background: 'linear-gradient(135deg,#2563eb,#0ea5e9)',
  color: '#ffffff',
  fontWeight: 900,
  cursor: 'pointer',
};

const errorStyle = { padding: 12, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 800, fontSize: 13, marginBottom: 12 };
const successStyle = { padding: 12, borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 800, fontSize: 13, marginBottom: 12 };

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useEventStore from '../../store/eventStore';
import useScoreStore from '../../store/scoreStore';

export default function JudgePublicScoring() {
  const { eventId } = useParams();
  const { events, loading: eventsLoading, error: eventsError, fetchEvents } = useEventStore();
  const { fetchScores, submitScore, updateScore, getScoreByKey } = useScoreStore();

  const [phase, setPhase] = useState('identify');
  const [judgeName, setJudgeName] = useState('');
  const [judgeEmail, setJudgeEmail] = useState('');
  const [selectedContestantId, setSelectedContestantId] = useState('');
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState({});
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState('');
  const [eventsLoaded, setEventsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadEvents() {
      try {
        await fetchEvents();
      } finally {
        if (mounted) {
          setEventsLoaded(true);
        }
      }
    }

    loadEvents();
    return () => {
      mounted = false;
    };
  }, [fetchEvents]);

  useEffect(() => { if (eventId) fetchScores(eventId); }, [fetchScores, eventId]);

  useEffect(() => {
    const prev = document.body.style.background;
    const prevColor = document.body.style.backgroundColor;
    document.body.style.background = '#f0f6ff';
    document.body.style.backgroundColor = '#f0f6ff';
    return () => {
      document.body.style.background = prev;
      document.body.style.backgroundColor = prevColor;
    };
  }, []);

  const event = events.find((e) => String(e.id) === String(eventId)) || null;
  const contestants = Array.isArray(event?.contestants) && event.contestants.length > 0 ? event.contestants : [];
  const criteria = event?.criteria || [];
  const selectedContestant = contestants.find((c) => String(c.id) === String(selectedContestantId)) || null;
  const judgeId = judgeEmail.trim().toLowerCase();

  useEffect(() => {
    if (!selectedContestant || !event || !judgeId) return;
    const existing = getScoreByKey(event.id, judgeId, selectedContestant.id);
    if (existing?.criteriaScores) {
      setScores(existing.criteriaScores);
      setComments(existing.comments || {});
      setRemarks(existing.remarks || '');
      return;
    }
    const next = {};
    criteria.forEach((c) => { next[c.id] = 0; });
    setScores(next);
    setComments({});
    setRemarks('');
  }, [criteria, event, getScoreByKey, judgeId, selectedContestant]);

  function handleIdentify(e) {
    e.preventDefault();
    if (!judgeName.trim()) { setError('Please enter your full name.'); return; }
    if (!judgeEmail.trim() || !judgeEmail.includes('@')) { setError('Please enter a valid email address.'); return; }
    setError('');
    if (contestants.length > 0 && !selectedContestantId) {
      setSelectedContestantId(String(contestants[0].id));
    }
    setPhase('scoring');
  }

  async function handleSubmit() {
    if (!event || !selectedContestant || !judgeId) return;
    setSubmitting(true);
    setSubmitSuccess(false);
    try {
      const payload = {
        contestantName: selectedContestant.name,
        eventTitle: event.title,
        judgeName: judgeName.trim(),
        comments,
        remarks,
        sessionId: 'qr-open',
      };
      const existing = getScoreByKey(event.id, judgeId, selectedContestant.id);
      if (existing) {
        await updateScore(event.id, judgeId, selectedContestant.id, scores, payload);
      } else {
        await submitScore(event.id, judgeId, selectedContestant.id, scores, payload);
      }

      const currentIndex = contestants.findIndex((c) => String(c.id) === String(selectedContestantId));
      const remaining = contestants.filter((c) => {
        if (String(c.id) === String(selectedContestantId)) return false;
        return !getScoreByKey(event.id, judgeId, c.id);
      });

      if (remaining.length > 0) {
        const nextAfter = contestants.slice(currentIndex + 1).find((c) => remaining.includes(c));
        const next = nextAfter || remaining[0];
        setSubmitSuccess(true);
        setTimeout(() => {
          setSelectedContestantId(String(next.id));
          setScores({});
          setComments({});
          setRemarks('');
          setError('');
          setSubmitSuccess(false);
        }, 800);
      } else {
        setPhase('done');
      }
    } catch {
      setError('Error submitting scores. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (!event && eventsLoaded && !eventsLoading) {
    return (
      <div style={S.fullPage}>
        <div style={{ ...S.gateCard, textAlign: 'center' }}>
          <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
          <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 8 }}>
            Judge link not available
          </div>
          <p style={{ color: '#64748b', marginBottom: 20, lineHeight: 1.7 }}>
            {eventsError
              ? 'FairPlay could not load event data right now. Please refresh or ask the organizer to verify the event is published.'
              : 'This judge scoring link is invalid, expired, or the event was removed.'}
          </p>
          <Link to="/" style={S.secondaryLink}>
            <i className="bi bi-house" />
            Back to FairPlay
          </Link>
        </div>
      </div>
    );
  }
  if (!event) {
    return (
      <div style={S.fullPage}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <i className="bi bi-arrow-repeat" style={{ fontSize: 40, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Loading event...</p>
      </div>
    );
  }

  // ─── Phase: Identify ─────────────────────────────────────────────────────
  if (phase === 'identify') {
    return (
      <div style={S.fullPage}>
        <div style={S.gateCard}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(37,99,235,0.3)' }}>
              <i className="bi bi-person-badge-fill" style={{ fontSize: 28, color: '#fff' }} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Judge Access</p>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{event.title}</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Please enter your information to begin scoring.</p>
          </div>

          <form onSubmit={handleIdentify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={S.label}>Full Name</label>
              <input
                autoFocus
                type="text"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                placeholder="Juan Dela Cruz"
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>Email Address</label>
              <input
                type="email"
                value={judgeEmail}
                onChange={(e) => setJudgeEmail(e.target.value)}
                placeholder="judge@email.com"
                style={S.input}
              />
            </div>
            {error && <div style={S.errorBox}>{error}</div>}
            <button type="submit" style={{ ...S.primaryBtn, marginTop: 4 }}>
              <i className="bi bi-check2-circle" />
              Proceed to Scoring
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Phase: Done ─────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div style={S.fullPage}>
        <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }`}</style>
        <div style={{ ...S.gateCard, maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 16, animation: 'float 3s ease-in-out infinite' }}>🏆</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '5px 14px', marginBottom: 22 }}>
            <i className="bi bi-check-circle-fill" style={{ color: '#16a34a', fontSize: 13 }} />
            <span style={{ color: '#15803d', fontSize: 12, fontWeight: 700 }}>All contestants scored</span>
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: 26, fontWeight: 900, color: '#0f172a' }}>Thank you, {judgeName}!</h2>
          <p style={{ margin: '0 0 4px', color: '#475569', fontSize: 14, lineHeight: 1.7 }}>All your scores have been recorded for</p>
          <p style={{ margin: '0 0 28px', color: '#2563eb', fontWeight: 800, fontSize: 16 }}>{event.title}</p>
          <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 14, padding: '16px 20px', marginBottom: 28, textAlign: 'left' }}>
            {[
              { label: 'Contestants scored', value: contestants.length },
              { label: 'Judge', value: judgeName },
              { label: 'Event', value: event.title },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #dbeafe' }}>
                <span style={{ color: '#64748b', fontSize: 13 }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 700, fontSize: 13, maxWidth: 220, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>You may now close this page. ✨</p>
        </div>
      </div>
    );
  }

  // ─── Phase: Scoring ───────────────────────────────────────────────────────
  const scoredCount = contestants.filter((c) => getScoreByKey(event.id, judgeId, c.id)).length;
  const currentIndex = contestants.findIndex((c) => String(c.id) === String(selectedContestantId));
  const isLastContestant = contestants.filter((c) => {
    if (String(c.id) === String(selectedContestantId)) return false;
    return !getScoreByKey(event.id, judgeId, c.id);
  }).length === 0;
  const progressPct = contestants.length > 0 ? (scoredCount / contestants.length) * 100 : 0;
  const allCriteriaScored = criteria.every((c) => (scores[c.id] ?? 0) > 0);

  return (
    <div style={{ height: '100vh', background: '#f0f6ff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .num-btn { transition: all 0.12s; }
        .num-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(37,99,235,0.22) !important; }
        .num-btn:active:not(:disabled) { transform: scale(0.96); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #dbeafe', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="bi bi-clipboard2-check-fill" style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Scoring Form</p>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{event.title}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '6px 12px' }}>
            <i className="bi bi-person-fill" style={{ color: '#2563eb', fontSize: 12 }} />
            <span style={{ color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>{judgeName}</span>
          </div>
          <div style={{ background: '#f1f5f9', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
            {scoredCount}/{contestants.length} done
          </div>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      <div style={{ flexShrink: 0, height: 4, background: '#dbeafe' }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#2563eb,#0ea5e9)', transition: 'width 0.5s ease' }} />
      </div>

      {/* ── Scrollable Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f0f6ff' }}>
      <div style={{ padding: '20px 16px', maxWidth: 740, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Contestant Card */}
        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 18, padding: '18px 20px', marginBottom: 18, boxShadow: '0 4px 24px rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="bi bi-person-fill" style={{ fontSize: 22, color: '#2563eb' }} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3 }}>Now Scoring</p>
            {contestants.length === 0 ? (
              <p style={{ margin: 0, color: '#dc2626', fontWeight: 700 }}>No contestants in this event.</p>
            ) : (
              <select
                value={selectedContestantId}
                onChange={(e) => { setSelectedContestantId(e.target.value); setSubmitSuccess(false); }}
                style={{ width: '100%', padding: '6px 0', border: 'none', background: 'transparent', color: '#0f172a', fontSize: 20, fontWeight: 900, outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {contestants.map((c) => {
                  const alreadyScored = !!getScoreByKey(event.id, judgeId, c.id);
                  return (
                    <option key={c.id} value={c.id}>
                      {alreadyScored ? '✓ ' : ''}{c.name}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Contestant</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#2563eb' }}>{currentIndex + 1} / {contestants.length}</span>
            {isLastContestant && (
              <span style={{ fontSize: 11, background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>
                Last one!
              </span>
            )}
          </div>
        </div>

        {/* No criteria warning */}
        {selectedContestant && criteria.length === 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 18, color: '#dc2626', marginBottom: 18, fontSize: 14 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 8 }} />
            No scoring criteria set up for this event. Contact the organizer.
          </div>
        )}

        {/* Criteria Cards */}
        {selectedContestant && criteria.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {criteria.map((criterion, idx) => {
              const rangeMax = Number(String(criterion.scoringRange || '10').split('-').pop()) || 10;
              const score = scores[criterion.id] ?? 0;
              const buttons = Array.from({ length: rangeMax + 1 }, (_, i) => i);
              const isScored = score > 0;

              return (
                <div key={criterion.id} style={{ background: '#fff', border: `1px solid ${isScored ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 16, overflow: 'hidden', boxShadow: isScored ? '0 2px 16px rgba(37,99,235,0.08)' : '0 1px 4px rgba(0,0,0,0.04)', transition: 'border-color 0.2s, box-shadow 0.2s' }}>
                  {/* Criterion header row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 10px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: isScored ? '#eff6ff' : '#f8fafc', border: `1px solid ${isScored ? '#bfdbfe' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: isScored ? '#2563eb' : '#94a3b8' }}>{idx + 1}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{criterion.name}</span>
                      {criterion.description && (
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{criterion.description}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {criterion.weight && (
                        <span style={{ fontSize: 11, fontWeight: 700, background: '#f0f7ff', color: '#3b82f6', border: '1px solid #dbeafe', padding: '3px 9px', borderRadius: 999 }}>
                          {criterion.weight}%
                        </span>
                      )}
                      <div style={{ minWidth: 52, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isScored ? '#2563eb' : '#f1f5f9', border: `2px solid ${isScored ? '#1d4ed8' : '#e2e8f0'}`, borderRadius: 10, transition: 'all 0.15s' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: isScored ? '#fff' : '#94a3b8', lineHeight: 1 }}>{score}</span>
                      </div>
                    </div>
                  </div>

                  {/* Number buttons */}
                  <div style={{ padding: '12px 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {buttons.map((n) => {
                      const sel = score === n;
                      return (
                        <button
                          key={n}
                          className="num-btn"
                          onClick={() => setScores((prev) => ({ ...prev, [criterion.id]: n }))}
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 10,
                            border: sel ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                            background: sel ? '#2563eb' : n === 0 ? '#f8fafc' : '#fff',
                            color: sel ? '#fff' : n === 0 ? '#cbd5e1' : '#374151',
                            fontWeight: sel ? 900 : 600,
                            fontSize: 15,
                            cursor: 'pointer',
                            boxShadow: sel ? '0 4px 14px rgba(37,99,235,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>

                  {/* Per-criterion comment */}
                  <div style={{ padding: '0 18px 14px' }}>
                    <input
                      type="text"
                      value={comments[criterion.id] || ''}
                      onChange={(e) => setComments((prev) => ({ ...prev, [criterion.id]: e.target.value }))}
                      placeholder={`Comment for ${criterion.name}... (optional)`}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Remarks */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Remarks <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Additional comments or observations..."
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>
          </div>
        )}
      </div>
      </div>{/* end scrollable content */}

      {/* ── Submit Footer ── */}
      {selectedContestant && criteria.length > 0 && (
        <div style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #dbeafe', padding: '14px 16px' }}>
          <div style={{ maxWidth: 740, margin: '0 auto', width: '100%' }}>
            {!allCriteriaScored && (
              <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-circle" />
                Some criteria still have a score of 0. Make sure all criteria are scored.
              </div>
            )}
            {error && <div style={{ ...S.errorBox, marginBottom: 8 }}>{error}</div>}
            {submitSuccess && (
              <div style={{ padding: '8px 14px', borderRadius: 10, background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, animation: 'slideIn 0.2s ease' }}>
                <i className="bi bi-check-circle-fill" />
                Score saved! Moving to next contestant...
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting || submitSuccess || contestants.length === 0}
              style={{
                width: '100%',
                padding: '15px 20px',
                borderRadius: 14,
                border: 'none',
                background: submitting || submitSuccess ? '#e2e8f0' : 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
                color: submitting || submitSuccess ? '#94a3b8' : '#fff',
                fontWeight: 800,
                fontSize: 16,
                cursor: submitting || submitSuccess ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: submitting || submitSuccess ? 'none' : '0 6px 24px rgba(29,78,216,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {submitting ? (
                <><i className="bi bi-arrow-repeat" style={{ animation: 'spin 1s linear infinite' }} /> Saving scores...</>
              ) : isLastContestant ? (
                <><i className="bi bi-trophy-fill" /> Submit Final Score</>
              ) : (
                <><i className="bi bi-arrow-right-circle-fill" /> Submit &amp; Next Contestant</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  fullPage: {
    minHeight: '100vh',
    background: '#f0f6ff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gateCard: {
    background: '#fff',
    border: '1px solid #bfdbfe',
    borderRadius: 24,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    background: '#f8fafc',
    border: '1px solid #bfdbfe',
    color: '#0f172a',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 8px 20px rgba(29,78,216,0.28)',
    fontFamily: 'inherit',
  },
  secondaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '11px 16px',
    borderRadius: 12,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: 800,
    textDecoration: 'none',
  },
  errorBox: {
    padding: '10px 14px',
    borderRadius: 10,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    fontSize: 13,
  },
};

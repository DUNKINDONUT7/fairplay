import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import { isSupabaseConfigured, supabase } from '../../utils/supabaseClient';

const BUBBLE_STYLE = `
  @keyframes floatBubble {
    0%   { transform: translateY(0px) scale(1);    opacity: 0.18; }
    33%  { transform: translateY(-28px) scale(1.04); opacity: 0.28; }
    66%  { transform: translateY(14px) scale(0.97); opacity: 0.14; }
    100% { transform: translateY(0px) scale(1);    opacity: 0.18; }
  }
  .judge-bubble {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    animation: floatBubble ease-in-out infinite;
  }
  html, body { background: #eef4ff !important; }
`;

const BUBBLES = [
  { size: 320, top: '-80px',  left: '-80px',  color: '#bfdbfe', duration: '8s',  delay: '0s'   },
  { size: 200, top: '10%',   right: '-60px',  color: '#93c5fd', duration: '11s', delay: '1.5s' },
  { size: 260, bottom: '5%', left: '-60px',   color: '#dbeafe', duration: '9s',  delay: '0.8s' },
  { size: 180, top: '40%',   left: '30%',     color: '#bae6fd', duration: '13s', delay: '2s'   },
  { size: 140, bottom: '15%',right: '10%',    color: '#e0f2fe', duration: '10s', delay: '0.3s' },
  { size: 100, top: '60%',   left: '60%',     color: '#c7d2fe', duration: '7s',  delay: '1s'   },
];

function AnimatedBackground() {
  return (
    <>
      <style>{BUBBLE_STYLE}</style>
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          className="judge-bubble"
          style={{
            width: b.size,
            height: b.size,
            top: b.top,
            left: b.left,
            right: b.right,
            bottom: b.bottom,
            background: `radial-gradient(circle at 40% 40%, ${b.color}, transparent 70%)`,
            animationDuration: b.duration,
            animationDelay: b.delay,
          }}
        />
      ))}
    </>
  );
}

const STORAGE_KEY = 'fairplay_judge_identity';

function getStoredJudge() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

function ScoreSelector({ value, onChange }) {
  const [hovered, setHovered] = useState(null);
  const display = hovered ?? value;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const filled = display !== null && n <= display;
        const selected = value === n;
        return (
          <button
            key={n}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(n)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: selected
                ? '2px solid #2563eb'
                : filled
                ? '2px solid #93c5fd'
                : '2px solid #e2e8f0',
              background: selected
                ? '#2563eb'
                : filled
                ? '#dbeafe'
                : '#f8fafc',
              color: selected ? '#ffffff' : filled ? '#1d4ed8' : '#94a3b8',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              transition: 'all 0.12s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function CriterionCard({ criterion, score, comment, onScore, onComment }) {
  return (
    <div style={{
      background: '#ffffff',
      border: score ? '1.5px solid #bfdbfe' : '1.5px solid #e2e8f0',
      borderRadius: 18,
      padding: 20,
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4 }}>
            {criterion.name}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{criterion.description}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{
            padding: '4px 10px', borderRadius: 999,
            background: '#eff6ff', color: '#2563eb',
            fontSize: 12, fontWeight: 700,
          }}>
            {criterion.weight}%
          </span>
          {score && (
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              background: '#2563eb', color: '#fff',
              fontSize: 13, fontWeight: 800,
            }}>
              {score}/10
            </span>
          )}
        </div>
      </div>

      {/* Score selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Score
        </div>
        <ScoreSelector value={score ?? null} onChange={onScore} />
      </div>

      {/* Comment */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Judge's Note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
        </div>
        <textarea
          value={comment || ''}
          onChange={(e) => onComment(e.target.value)}
          placeholder={criterion.judgeInstructions || 'Add a note about this score...'}
          rows={2}
          style={{
            width: '100%',
            borderRadius: 12,
            border: '1.5px solid #e2e8f0',
            padding: '10px 12px',
            fontSize: 13,
            color: '#334155',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            boxSizing: 'border-box',
            background: '#f8fafc',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => e.target.style.borderColor = '#93c5fd'}
          onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
        />
      </div>
    </div>
  );
}

export default function JudgeLiveScoring() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { fetchEvents } = useEventStore();
  const { notifyScoreSubmitted } = useNotificationStore();

  const [event, setEvent] = useState(null);
  const [judge, setJudge] = useState(null);
  const [scores, setScores] = useState({});     // { contestantId: { criterionId: score } }
  const [comments, setComments] = useState({});  // { contestantId: { criterionId: comment } }
  const [submitted, setSubmitted] = useState({}); // { contestantId: true }
  const [activeContestantId, setActiveContestantId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = getStoredJudge();
    if (!stored?.judgeId) { navigate(`/judge/session/${sessionId}`); return; }
    setJudge(stored);

    async function load() {
      await fetchEvents();
      const allEvents = useEventStore.getState().events;
      const inviteEventId = sessionId?.startsWith('invite-') ? location.state?.eventId : null;
      const matched = allEvents.find((e) =>
        (e.judgeSessions || []).some((s) => s.sessionId === sessionId)
      ) || (inviteEventId != null ? allEvents.find((e) => String(e.id) === String(inviteEventId)) : null);
      if (!matched) return;
      setEvent(matched);

      // Restore existing scores from Supabase
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: rows } = await supabase
            .from('scores')
            .select('id,event_id,judge_id,contestant_id,criteria_scores,comments,remarks')
            .eq('judge_id', stored.judgeId)
            .eq('event_id', matched.id);

          if (rows && rows.length > 0) {
            const restoredScores = {};
            const restoredComments = {};
            const restoredSubmitted = {};

            rows.forEach((row) => {
              if (!restoredScores[row.contestant_id]) restoredScores[row.contestant_id] = {};
              if (!restoredComments[row.contestant_id]) restoredComments[row.contestant_id] = {};
              const saved = row.criteria_scores || {};
              restoredScores[row.contestant_id] = { ...restoredScores[row.contestant_id], ...saved };
              restoredComments[row.contestant_id] = { ...restoredComments[row.contestant_id], ...(row.comments || {}) };
            });

            // Mark contestants as submitted if all criteria are scored
            const criteria = matched.criteria || [];
            Object.keys(restoredScores).forEach((cId) => {
              const allScored = criteria.every((c) => restoredScores[cId][c.id] != null);
              if (allScored) restoredSubmitted[cId] = true;
            });

            setScores(restoredScores);
            setComments(restoredComments);
            setSubmitted(restoredSubmitted);

            // Auto-select first unsubmitted contestant
            const firstUnscored = matched.contestants?.find((c) => !restoredSubmitted[c.id]);
            setActiveContestantId(firstUnscored?.id ?? matched.contestants?.[0]?.id ?? null);
            return;
          }
        } catch {
          // Non-critical — fall through to empty state
        }
      }

      setActiveContestantId(matched.contestants?.[0]?.id ?? null);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function setScore(contestantId, criterionId, val) {
    // Block editing already-submitted contestants
    if (submitted[contestantId]) return;
    setScores((prev) => ({
      ...prev,
      [contestantId]: { ...(prev[contestantId] || {}), [criterionId]: val },
    }));
  }

  function setComment(contestantId, criterionId, val) {
    if (submitted[contestantId]) return;
    setComments((prev) => ({
      ...prev,
      [contestantId]: { ...(prev[contestantId] || {}), [criterionId]: val },
    }));
  }

  function isComplete(contestantId) {
    const criteria = event?.criteria || [];
    const s = scores[contestantId] || {};
    return criteria.every((c) => s[c.id] != null);
  }

  function getWeightedTotal(contestantId) {
    const criteria = event?.criteria || [];
    const s = scores[contestantId] || {};
    return criteria.reduce((sum, c) => {
      return sum + (Number(s[c.id] || 0) * (c.weight / 100));
    }, 0).toFixed(2);
  }

  async function submitContestant(contestantId) {
    if (!isComplete(contestantId) || saving) return;
    setSaving(true);

    const criteria = event?.criteria || [];
    const s = scores[contestantId] || {};
    const c = comments[contestantId] || {};

    // Save each criterion score to Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const scorePayload = {
          id: `${event.id}_${judge.judgeId}_${contestantId}`,
          event_id: event.id,
          judge_id: judge.judgeId,
          contestant_id: contestantId,
          criteria_scores: criteria.reduce((acc, criterion) => {
            acc[criterion.id] = Number(s[criterion.id] || 0);
            return acc;
          }, {}),
          total_score: Number(getWeightedTotal(contestantId)),
          comments: c,
          remarks: Object.values(c).filter(Boolean).join(' | '),
          updated_at: new Date().toISOString(),
        };

        await supabase.from('scores').upsert([scorePayload]);
        await notifyScoreSubmitted({
          ...scorePayload,
          eventId: event.id,
          judgeId: judge.judgeId,
          contestantId,
          contestantName: event.contestants?.find((contestant) => String(contestant.id) === String(contestantId))?.name || `Contestant ${contestantId}`,
          eventTitle: event.title,
          judgeName: judge.judgeName,
        }, event, 'submitted');
      } catch {
        // Non-critical — state still updates locally
      }
    } else {
      await notifyScoreSubmitted({
        id: `${event.id}_${judge.judgeId}_${contestantId}`,
        eventId: event.id,
        judgeId: judge.judgeId,
        contestantId,
        contestantName: event.contestants?.find((contestant) => String(contestant.id) === String(contestantId))?.name || `Contestant ${contestantId}`,
        eventTitle: event.title,
        judgeName: judge.judgeName,
      }, event, 'submitted');
    }

    setSaving(false);
    setSubmitted((prev) => ({ ...prev, [contestantId]: true }));

    // Auto-advance to next unscored contestant
    const eliminated = new Set((event?.eliminatedContestantIds || []).map(String));
    const contestants = (event?.contestants || []).filter((c) => !eliminated.has(String(c.id)));
    const next = contestants.find((c) => !submitted[c.id] && c.id !== contestantId);
    if (next) setActiveContestantId(next.id);
  }

  if (!event || !judge) {
    return (
      <div style={fullPage}>
        <AnimatedBackground />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 36, color: '#2563eb' }} />
          <p style={{ color: '#64748b', marginTop: 16 }}>Loading session...</p>
        </div>
      </div>
    );
  }

  const eliminatedIds = new Set((event.eliminatedContestantIds || []).map(String));
  const contestants = (event.contestants || []).filter((c) => !eliminatedIds.has(String(c.id)));
  const criteria = event.criteria || [];
  const doneCount = Object.keys(submitted).length;
  const activeContestant = contestants.find((c) => c.id === activeContestantId);
  const allDone = doneCount === contestants.length && contestants.length > 0;
  const sessionClosed = event.scoringActive === false && event.status === 'completed';

  if (sessionClosed) {
    return (
      <div style={fullPage}>
        <AnimatedBackground />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <i className="bi bi-lock-fill" style={{ fontSize: 52, color: '#94a3b8', display: 'block', marginBottom: 16 }} />
          <div style={{ fontWeight: 800, fontSize: 22, color: '#0f172a', marginBottom: 8 }}>Scoring Session Ended</div>
          <p style={{ color: '#64748b', fontSize: 15 }}>The organizer has closed this scoring session.<br />Thank you for judging!</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef4ff', position: 'relative' }}>
      <AnimatedBackground />
      {/* Top bar */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Judge Session</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginTop: 1 }}>{event.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="bi bi-person-check" style={{ color: '#2563eb' }} />
            <span style={{ fontWeight: 600 }}>{judge.judgeName}</span>
          </div>
          <div style={{
            padding: '4px 12px', borderRadius: 999,
            background: allDone ? '#dcfce7' : '#eff6ff',
            color: allDone ? '#16a34a' : '#2563eb',
            fontWeight: 700, fontSize: 13,
          }}>
            {doneCount}/{contestants.length} scored
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px', position: 'relative', zIndex: 1 }}>
        {/* All done banner */}
        {allDone && (
          <div style={{
            marginBottom: 20, padding: 24, borderRadius: 16,
            background: '#f0fdf4', border: '1.5px solid #86efac',
            display: 'flex', alignItems: 'center', gap: 14, flexDirection: 'column', textAlign: 'center'
          }}>
            <i className="bi bi-check-circle-fill" style={{ fontSize: 48, color: '#16a34a' }} />
            <div>
              <div style={{ fontWeight: 800, color: '#166534', fontSize: 18, marginBottom: 4 }}>All contestants scored!</div>
              <div style={{ fontSize: 14, color: '#4ade80', marginBottom: 16 }}>Thank you for judging. The organizer will be notified once results are finalized.</div>
              <button
                onClick={() => navigate(`/judge/events`)}
                style={{
                  padding: '12px 24px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', marginRight: 10
                }}
              >
                <i className="bi bi-arrow-left" /> Back to Events
              </button>
            </div>
          </div>
        )}

        {/* Contestant pills */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Contestants
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {contestants.map((c) => {
              const done = submitted[c.id];
              const active = c.id === activeContestantId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveContestantId(c.id)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: active ? '2px solid #2563eb' : done ? '2px solid #86efac' : '2px solid #e2e8f0',
                    background: active ? '#2563eb' : done ? '#f0fdf4' : '#ffffff',
                    color: active ? '#ffffff' : done ? '#16a34a' : '#334155',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  {done && <i className="bi bi-check-circle-fill" style={{ fontSize: 13 }} />}
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scoring panel */}
        {activeContestant && (
          <div>
            {/* Contestant header */}
            <div style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: '20px 22px',
              marginBottom: 16,
              border: '1.5px solid #dbeafe',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Now Scoring
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{activeContestant.name}</div>
              </div>
              {isComplete(activeContestant.id) && !submitted[activeContestant.id] && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Weighted Total</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#2563eb' }}>
                    {getWeightedTotal(activeContestant.id)}
                  </div>
                </div>
              )}
            </div>

            {submitted[activeContestant.id] ? (
              /* Submitted state */
              <div style={{
                background: '#ffffff', borderRadius: 18, padding: 36,
                border: '1.5px solid #86efac', textAlign: 'center',
              }}>
                <i className="bi bi-check-circle-fill" style={{ fontSize: 48, color: '#16a34a', marginBottom: 16, display: 'block' }} />
                <div style={{ fontWeight: 800, fontSize: 20, color: '#166534', marginBottom: 6 }}>
                  Scores Submitted
                </div>
                <div style={{ fontSize: 15, color: '#64748b', marginBottom: 20 }}>
                  Weighted total: <strong style={{ color: '#2563eb' }}>{getWeightedTotal(activeContestant.id)} / 10</strong>
                </div>
                {/* Summary of submitted scores */}
                <div style={{ display: 'grid', gap: 8, textAlign: 'left', marginBottom: 20 }}>
                  {criteria.map((c) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderRadius: 10, background: '#f8fafc' }}>
                      <span style={{ fontSize: 13, color: '#475569' }}>{c.name}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{scores[activeContestant.id]?.[c.id]}/10</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const next = contestants.find((c) => !submitted[c.id] && c.id !== activeContestant.id);
                    if (next) setActiveContestantId(next.id);
                  }}
                  style={{
                    padding: '12px 24px', borderRadius: 14, border: 'none',
                    background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                    color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  Next Contestant <i className="bi bi-arrow-right" />
                </button>
              </div>
            ) : (
              /* Scoring criteria */
              <>
                <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                  {criteria.map((criterion) => (
                    <CriterionCard
                      key={criterion.id}
                      criterion={criterion}
                      score={scores[activeContestant.id]?.[criterion.id] ?? null}
                      comment={comments[activeContestant.id]?.[criterion.id] ?? ''}
                      onScore={(val) => setScore(activeContestant.id, criterion.id, val)}
                      onComment={(val) => setComment(activeContestant.id, criterion.id, val)}
                    />
                  ))}
                </div>

                {/* Weighted total preview */}
                {isComplete(activeContestant.id) && (
                  <div style={{
                    padding: '16px 20px', borderRadius: 16, marginBottom: 16,
                    background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                    border: '1.5px solid #bfdbfe',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 700, color: '#1d4ed8' }}>Weighted Total</span>
                    <span style={{ fontWeight: 800, fontSize: 24, color: '#2563eb' }}>
                      {getWeightedTotal(activeContestant.id)} / 10
                    </span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={() => submitContestant(activeContestant.id)}
                  disabled={!isComplete(activeContestant.id) || saving}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 16,
                    border: 'none',
                    background: isComplete(activeContestant.id)
                      ? 'linear-gradient(135deg, #2563eb, #0ea5e9)'
                      : '#e2e8f0',
                    color: isComplete(activeContestant.id) ? '#ffffff' : '#94a3b8',
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: isComplete(activeContestant.id) ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginBottom: 32,
                    boxShadow: isComplete(activeContestant.id) ? '0 8px 24px rgba(37,99,235,0.25)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {saving
                    ? <><i className="bi bi-arrow-repeat animate-spin" /> Saving...</>
                    : isComplete(activeContestant.id)
                      ? <><i className="bi bi-send-check" /> Submit Scores for {activeContestant.name}</>
                      : <><i className="bi bi-lock" /> Score all {criteria.length} criteria to submit</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const fullPage = {
  minHeight: '100vh',
  background: '#eef4ff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
};

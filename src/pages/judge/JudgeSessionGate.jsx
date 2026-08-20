import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../utils/supabaseClient';
import useEventStore from '../../store/eventStore';

const STORAGE_KEY = 'fairplay_judge_identity';

function getStoredJudge() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function storeJudge(judgeData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(judgeData));
}

async function findOrCreateJudge(email, name) {
  if (!isSupabaseConfigured || !supabase) {
    return { id: Date.now(), name, email };
  }

  // Check if judge exists — handle RLS 400 gracefully
  try {
    const { data: existing, error: selectError } = await supabase
      .from('judges')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (!selectError && existing) return existing;
  } catch {
    // RLS or network issue — fall through to create
  }

  // Create new judge with explicit id (judges table has no default id)
  const newId = Date.now();
  const { data: created, error: insertError } = await supabase
    .from('judges')
    .insert({
      id: newId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      status: 'active',
      score_count: 0,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);
  return created || { id: newId, name: name.trim(), email: email.toLowerCase().trim() };
}

async function assignJudgeToEvent(judgeId, eventId) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    await supabase
      .from('judge_assignments')
      .upsert(
        { id: `${judgeId}_${eventId}`, judge_id: judgeId, event_id: eventId, status: 'active', assigned_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
  } catch {
    // Non-critical — continue even if assignment fails
  }
}

export default function JudgeSessionGate() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { events, fetchEvents } = useEventStore();

  const [phase, setPhase] = useState('loading'); // loading | gate | error
  const [event, setEvent] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function init() {
      await fetchEvents();

      // Find the event matching this sessionId
      const allEvents = useEventStore.getState().events;
      const matched = allEvents.find((e) =>
        (e.judgeSessions || []).some((s) => s.sessionId === sessionId)
      );

      if (!matched) {
        setPhase('error');
        return;
      }

      setEvent(matched);

      const isTournament = ['tournament', 'sportsfest', 'esports', 'sports'].includes(matched.eventType);

      // Check if judge/scorer already identified on this device
      const stored = getStoredJudge();
      if (stored?.judgeId && stored?.judgeEmail) {
        if (isTournament) {
          navigate(`/scorer/live/${sessionId}`);
        } else {
          await assignJudgeToEvent(stored.judgeId, matched.id);
          navigate(`/judge/live/${sessionId}`);
        }
        return;
      }

      setPhase('gate');
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function checkEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !isSupabaseConfigured || !supabase) {
      setIsNew(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('judges')
        .select('id, name, email')
        .eq('email', trimmed)
        .maybeSingle();

      if (!error && data) {
        // Existing judge — auto-login
        setName(data.name);
        setIsNew(false);
        await handleSubmitJudge(data);
      } else {
        // New judge or RLS blocked read — ask for name
        setIsNew(true);
      }
    } catch {
      setIsNew(true);
    }
  }

  async function handleSubmitJudge(existingJudge = null) {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const isTournament = ['tournament', 'sportsfest', 'esports', 'sports'].includes(event?.eventType);
      const judge = existingJudge || await findOrCreateJudge(email, name);

      storeJudge({
        judgeId: judge.id,
        judgeName: judge.name,
        judgeEmail: judge.email,
        sessionId,
      });

      if (isTournament) {
        navigate(`/scorer/live/${sessionId}`);
      } else {
        await assignJudgeToEvent(judge.id, event.id);
        navigate(`/judge/live/${sessionId}`);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div style={fullPage}>
        <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 40, color: '#2563eb' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Verifying session...</p>
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

  return (
    <div style={fullPage}>
      <div style={gateCard}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            <i className="bi bi-person-badge" style={{ color: '#2563eb' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
            {['tournament', 'sportsfest', 'esports', 'sports'].includes(event?.eventType) ? 'Scorer Access' : 'Judge Access'}
          </h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {event?.title}
          </p>
        </div>

        {/* Email field */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Your email address</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setIsNew(false); setName(''); }}
              onBlur={checkEmail}
              placeholder="judge@email.com"
              style={inputStyle}
              disabled={submitting}
            />
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
            Enter your email. If it's registered, you'll go in automatically.
          </p>
        </div>

        {/* Name field — only shown if new judge */}
        {isNew && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Your full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan dela Cruz"
              style={inputStyle}
              disabled={submitting}
            />
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
              First time? We'll create your judge account using this name and email.
            </p>
          </div>
        )}

        {errorMsg && (
          <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        <button
          onClick={() => handleSubmitJudge()}
          disabled={submitting || !email.trim() || (isNew && !name.trim())}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
            cursor: submitting || !email.trim() || (isNew && !name.trim()) ? 'not-allowed' : 'pointer',
            opacity: submitting || !email.trim() || (isNew && !name.trim()) ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          {submitting
            ? <><i className="bi bi-arrow-repeat animate-spin" /> Verifying...</>
            : <><i className="bi bi-box-arrow-in-right" /> Enter Session</>
          }
        </button>

        {/* Event info pill */}
        <div style={{ marginTop: 24, padding: '10px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
          <i className="bi bi-calendar-event" style={{ marginRight: 6 }} />
          {event?.startDate || 'Date TBD'} • {event?.location || 'Venue TBD'}
        </div>
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

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#334155',
  marginBottom: 8,
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
};

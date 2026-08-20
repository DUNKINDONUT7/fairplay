import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../utils/supabaseClient';

const STORAGE_KEY = 'fairplay_judge_identity';

function storeJudge(judgeData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(judgeData));
}

export default function JudgeInviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('loading'); // loading | ready | error
  const [invite, setInvite] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    async function resolveInvite() {
      if (!isSupabaseConfigured || !supabase) {
        setErrorMsg('This invite link requires FairPlay to be connected to Supabase.');
        setPhase('error');
        return;
      }

      const { data, error } = await supabase.rpc('resolve_judge_invite', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;

      if (error || !row || !row.event_id) {
        setErrorMsg('This invite link is invalid or has expired.');
        setPhase('error');
        return;
      }

      if (row.status === 'revoked') {
        setErrorMsg('This invite has been revoked. Ask the organizer for a new one.');
        setPhase('error');
        return;
      }

      setInvite(row);
      setPhase('ready');
    }

    resolveInvite();
  }, [token]);

  async function handleEnter() {
    setEntering(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.rpc('claim_judge_invite', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;

      if (error || !row?.judge_id) {
        throw new Error(error?.message || 'Unable to activate this invite.');
      }

      storeJudge({
        judgeId: row.judge_id,
        judgeName: row.judge_name,
        judgeEmail: row.judge_email,
        sessionId: `invite-${token}`,
      });

      navigate(`/judge/live/invite-${token}`, { state: { eventId: row.event_id } });
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setEntering(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div style={fullPage}>
        <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 40, color: '#2563eb' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Verifying your invite...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={fullPage}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
        <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 8 }}>Invite not found</div>
        <p style={{ color: '#64748b', maxWidth: 360, textAlign: 'center' }}>{errorMsg}</p>
      </div>
    );
  }

  return (
    <div style={fullPage}>
      <div style={gateCard}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            <i className="bi bi-person-badge" style={{ color: '#2563eb' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
            Judge Invitation
          </h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>{invite?.event_title}</p>
        </div>

        <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Signed in as</div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{invite?.judge_name}</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{invite?.judge_email}</div>
        </div>

        {errorMsg && (
          <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleEnter}
          disabled={entering}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
            cursor: entering ? 'not-allowed' : 'pointer',
            opacity: entering ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          {entering
            ? <><i className="bi bi-arrow-repeat animate-spin" /> Activating...</>
            : <><i className="bi bi-box-arrow-in-right" /> Enter Scoring Session</>
          }
        </button>

        <p style={{ marginTop: 18, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          This link is unique to you — please don't share it.
        </p>
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

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { supabase } from '../../utils/supabaseClient';
import { activateInvite, previewInvite } from '../../services/staffService';

// Same rule as every other account form in the app.
function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password needs at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password needs at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password needs at least one number.';
  return '';
}

const ROLE_LABEL = { judge: 'Judge', scorer: 'Scorer' };

// The link in a judge/scorer invitation (W10). The invited person creates
// their account (or signs in with an existing one) using the invited email,
// then the assignment is activated for that account — the link is single-use
// and stops working once activated, revoked or replaced.
export default function StaffActivate() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, login, logout, initialized } = useAuthStore();

  const [invite, setInvite] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | invalid | form | done
  const [mode, setMode] = useState('create'); // create | signin
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let cancelled = false;
    previewInvite(token)
      .then((data) => {
        if (cancelled) return;
        if (!data) { setPhase('invalid'); return; }
        setInvite(data);
        setFullName(data.fullName || '');
        setPhase('form');
      })
      .catch((error) => { if (!cancelled) { setFailure(error.message); setPhase('invalid'); } });
    return () => { cancelled = true; };
  }, [token]);

  const signedInAsInvitee = Boolean(user && invite && String(user.email).toLowerCase() === String(invite.email).toLowerCase());
  const signedInAsSomeoneElse = Boolean(user && invite && !signedInAsInvitee);

  const finish = async () => {
    const result = await activateInvite(token);
    setPhase('done');
    setMessage(result?.alreadyActive ? 'This assignment was already active on your account.' : 'Your assignment is now active.');
    window.setTimeout(() => navigate(invite.role === 'scorer' ? '/scorer' : '/judge'), 1200);
  };

  const run = async (action) => {
    setBusy(true);
    setFailure('');
    try {
      await action();
    } catch (error) {
      setFailure(String(error?.message || 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = () => run(async () => {
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    if (password !== confirm) throw new Error('The two passwords do not match.');
    if (fullName.trim().length < 2) throw new Error('Enter your full name.');

    const { data, error } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { data: { full_name: fullName.trim(), role: invite.role } },
    });
    if (error) throw error;
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      setMode('signin');
      throw new Error('An account with this email already exists. Sign in with its password instead.');
    }
    if (!data.session) {
      setMessage(`We sent a confirmation email to ${invite.email}. Click the link in it, then open this invitation link again to finish.`);
      return;
    }
    await finish();
  });

  const signIn = () => run(async () => {
    const result = await login(invite.email, password);
    if (!result?.success) throw new Error(result?.error || 'Sign-in failed.');
    await finish();
  });

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#ffffff', borderRadius: 20, border: '1px solid #dbeafe', boxShadow: '0 24px 60px rgba(37,99,235,0.12)', padding: 28 }}>
        <img src="/logo.svg" alt="FairPlay" style={{ width: 120, display: 'block', marginBottom: 18 }} />
        {children}
      </div>
    </div>
  );

  if (phase === 'loading' || !initialized) {
    return shell(<p style={{ color: '#64748b', margin: 0 }}>Checking your invitation…</p>);
  }

  if (phase === 'invalid') {
    return shell(
      <>
        <h1 style={titleStyle}>Invitation not found</h1>
        <p style={bodyStyle}>{failure || 'This activation link is invalid. Ask the event organizer to send you a new one.'}</p>
        <Link to="/" style={linkStyle}>Go to FairPlay</Link>
      </>
    );
  }

  if (phase === 'done') {
    return shell(
      <>
        <h1 style={titleStyle}><i className="bi bi-check-circle-fill" style={{ color: '#16a34a', marginRight: 8 }} />You're all set</h1>
        <p style={bodyStyle}>{message} Taking you to your assignments…</p>
      </>
    );
  }

  const roleLabel = ROLE_LABEL[invite.role] || 'Staff';
  const header = (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 800, marginBottom: 10 }}>
        <i className={invite.role === 'scorer' ? 'bi bi-clipboard-data' : 'bi bi-person-check'} /> {roleLabel} invitation
      </div>
      <h1 style={titleStyle}>{invite.eventTitle}</h1>
      <p style={bodyStyle}>
        You were invited as <strong>{roleLabel.toLowerCase()}</strong>{invite.subEventName ? <> for <strong>{invite.subEventName}</strong></> : null}.
        {' '}Your account will be <strong>{invite.email}</strong>.
      </p>
    </>
  );

  if (invite.status !== 'invited') {
    return shell(
      <>
        {header}
        <div style={noticeStyle('#fef2f2', '#fecaca', '#b91c1c')}>
          {invite.status === 'active'
            ? 'This invitation was already activated. Sign in with your account to see your assignments.'
            : invite.status === 'replaced'
              ? 'You were replaced for this event, so this invitation no longer works.'
              : 'The organizer revoked this invitation.'}
        </div>
        <Link to="/?modal=login" style={linkStyle}>Sign in</Link>
      </>
    );
  }

  if (signedInAsSomeoneElse) {
    return shell(
      <>
        {header}
        <div style={noticeStyle('#fff7ed', '#fed7aa', '#9a3412')}>
          You are signed in as {user.email}. This invitation is for {invite.email}.
        </div>
        <button type="button" onClick={() => logout()} style={primaryButton(false)}>Sign out and continue</button>
      </>
    );
  }

  if (signedInAsInvitee) {
    return shell(
      <>
        {header}
        {failure && <div role="alert" style={noticeStyle('#fef2f2', '#fecaca', '#b91c1c')}>{failure}</div>}
        <button type="button" disabled={busy} onClick={() => run(finish)} style={primaryButton(busy)}>
          {busy ? 'Activating…' : `Activate my ${roleLabel.toLowerCase()} assignment`}
        </button>
      </>
    );
  }

  return shell(
    <>
      {header}
      <div style={{ display: 'flex', gap: 6, margin: '4px 0 16px', background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
        {[['create', 'Create my account'], ['signin', 'I already have an account']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setMode(value); setFailure(''); }}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: mode === value ? '#ffffff' : 'transparent', color: mode === value ? '#0f172a' : '#64748b', boxShadow: mode === value ? '0 2px 6px rgba(15,23,42,0.08)' : 'none' }}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); if (mode === 'create') createAccount(); else signIn(); }} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>
          Email
          <input value={invite.email} readOnly style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} />
        </label>
        {mode === 'create' && (
          <label style={labelStyle}>
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" style={inputStyle} />
          </label>
        )}
        <label style={labelStyle}>
          {mode === 'create' ? 'Choose a password' : 'Password'}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} style={inputStyle} />
        </label>
        {mode === 'create' && (
          <label style={labelStyle}>
            Confirm password
            <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" style={inputStyle} />
          </label>
        )}
        {message && <div style={noticeStyle('#eff6ff', '#bfdbfe', '#1d4ed8')}>{message}</div>}
        {failure && <div role="alert" style={noticeStyle('#fef2f2', '#fecaca', '#b91c1c')}>{failure}</div>}
        <button type="submit" disabled={busy} style={primaryButton(busy)}>
          {busy ? 'Please wait…' : mode === 'create' ? 'Create account and activate' : 'Sign in and activate'}
        </button>
        {mode === 'signin' && (
          <Link to={`/?modal=login&returnTo=${encodeURIComponent(`/staff/activate/${token}`)}`} style={{ ...linkStyle, fontSize: 13 }}>
            Forgot your password? Reset it from the sign-in window.
          </Link>
        )}
      </form>
    </>
  );
}

const titleStyle = { margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1.25 };
const bodyStyle = { margin: '0 0 18px', fontSize: 14, color: '#475569', lineHeight: 1.6 };
const linkStyle = { color: '#2563eb', fontWeight: 700, fontSize: 14, textDecoration: 'none' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' };
const inputStyle = { padding: '11px 13px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' };
const noticeStyle = (background, border, color) => ({ padding: '10px 12px', borderRadius: 12, background, border: `1px solid ${border}`, color, fontSize: 13, lineHeight: 1.5, marginBottom: 14 });
const primaryButton = (busy) => ({ width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#ffffff', fontWeight: 800, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 });

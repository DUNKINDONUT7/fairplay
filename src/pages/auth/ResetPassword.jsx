import { useEffect, useState } from 'react';
import useAuthStore from '../../store/authStore';

// Landing page for Supabase's password-recovery email link (set as the
// redirectTo in authStore.requestPasswordReset(), and must also be added to
// Supabase Dashboard > Authentication > URL Configuration > Redirect URLs —
// same requirement as /auth/confirmed, see EmailConfirmed.jsx). Supabase's
// client SDK auto-detects the recovery token in the URL fragment on load
// (detectSessionInUrl, on by default) and establishes a temporary session
// before this component's auth state ever settles, so by the time `user` is
// populated here, there's already a real (if short-lived) session that
// authStore.updateCredentials() can act on.
export default function ResetPassword() {
  const { user, loading, initialized, updateCredentials, logout } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const stillWorking = loading || !initialized;
  const linkInvalid = !stillWorking && !user;

  useEffect(() => {
    if (done) {
      const timer = setTimeout(() => {
        window.location.href = '/?modal=login';
      }, 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [done]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await updateCredentials({ password });
      // The recovery session is single-purpose — sign out so the next visit
      // requires a real sign-in with the new password instead of quietly
      // staying logged in on whatever device opened the email link.
      await logout();
      setDone(true);
    } catch (err) {
      setError(err.message || 'Unable to update your password. The link may have expired — request a new one.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 24, padding: 36, textAlign: 'center', boxShadow: '0 20px 60px rgba(37,99,235,0.12)' }}>
        {stillWorking ? (
          <>
            <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 44, color: '#2563eb', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Verifying your link...</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>Just a moment.</p>
          </>
        ) : linkInvalid ? (
          <>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 46, color: '#f59e0b', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>This link expired</h1>
            <p style={{ margin: '0 0 22px', color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
              Password reset links only work once and expire after a while. Request a new one from the sign-in screen.
            </p>
            <a
              href="/?modal=login"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', color: '#fff', fontWeight: 800, textDecoration: 'none' }}
            >
              Go to Sign In
            </a>
          </>
        ) : done ? (
          <>
            <i className="bi bi-check-circle-fill" style={{ fontSize: 46, color: '#10b981', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Password updated!</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>Taking you to sign in with your new password...</p>
          </>
        ) : (
          <>
            <i className="bi bi-shield-lock-fill" style={{ fontSize: 44, color: '#2563eb', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Set a new password</h1>
            <p style={{ margin: '0 0 22px', color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>Choose a new password for your account.</p>

            {error && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>New Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                style={fieldStyle}
              />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', margin: '14px 0 6px' }}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                style={fieldStyle}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{ width: '100%', marginTop: 22, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

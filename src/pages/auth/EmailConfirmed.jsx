import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { roleHomePath } from '../../utils/navigation';

// Landing page for Supabase's email confirmation link (set as the
// emailRedirectTo in authStore.register(), and must also be added to
// Supabase Dashboard > Authentication > URL Configuration > Redirect URLs).
// Supabase's client SDK auto-detects the access/refresh tokens in the
// URL fragment on load (detectSessionInUrl, on by default) and establishes
// a real session before this component's auth state ever settles — so by
// the time `user` is populated here, they're already actually signed in,
// not just "confirmed."
export default function EmailConfirmed() {
  const navigate = useNavigate();
  const { user, loading, initialized } = useAuthStore();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || !initialized || !user) return;

    setRedirecting(true);
    const timer = setTimeout(() => {
      navigate(roleHomePath(user.role), { replace: true });
    }, 1600);

    return () => clearTimeout(timer);
  }, [loading, initialized, user, navigate]);

  const stillWorking = loading || !initialized;
  const failed = !stillWorking && !user;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#ffffff',
          border: '1px solid #bfdbfe',
          borderRadius: 24,
          padding: 36,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
        }}
      >
        {stillWorking ? (
          <>
            <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 44, color: '#2563eb', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Confirming your email...</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>Just a moment.</p>
          </>
        ) : failed ? (
          <>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 46, color: '#f59e0b', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Couldn't confirm this link</h1>
            <p style={{ margin: '0 0 22px', color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
              This confirmation link may have expired or already been used. Try signing in — if your email was already confirmed, it'll work right away.
            </p>
            <a
              href="/?modal=login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 20px',
                borderRadius: 12,
                background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
                color: '#fff',
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              Go to Sign In
            </a>
          </>
        ) : (
          <>
            <i className="bi bi-check-circle-fill" style={{ fontSize: 46, color: '#10b981', display: 'block', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Your email is confirmed!</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
              {redirecting ? 'Taking you to your dashboard...' : 'You can now access your account.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

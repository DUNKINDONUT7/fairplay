import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

function formatCountdown(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days}d` : null, hours ? `${hours}h` : null, `${minutes}m`].filter(Boolean).join(' ');
}

export function formatBackAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MaintenanceScreen({ message, until, preview = false }) {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!until) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [until]);

  const untilTime = until ? new Date(until).getTime() : NaN;
  const hasTime = !Number.isNaN(untilTime);
  const remaining = hasTime ? untilTime - now : 0;
  const signedIn = Boolean(user && token);

  return (
    <div
      style={{
        minHeight: preview ? 0 : '100vh',
        height: preview ? '100%' : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: preview ? 24 : '40px 16px',
        background: 'linear-gradient(180deg, #f8fbff 0%, #e0f2fe 100%)',
        fontFamily: "'Manrope', system-ui, sans-serif",
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: 'min(520px, 100%)', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 24, padding: preview ? 24 : 36, boxShadow: '0 24px 60px rgba(37,99,235,0.12)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 18px', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
          <i className="bi bi-tools" />
        </div>
        <h1 style={{ margin: 0, fontSize: preview ? 22 : 26, fontWeight: 800, color: '#0f172a' }}>We're doing some maintenance</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, color: '#475569', whiteSpace: 'pre-line' }}>
          {message?.trim() || 'FairPlay is temporarily unavailable while we make some improvements. Please check back soon.'}
        </p>

        {hasTime && (
          <div style={{ marginTop: 22, padding: '14px 16px', borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Expected back</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1d4ed8', marginTop: 4 }}>{formatBackAt(until)}</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
              {remaining > 0 ? `in about ${formatCountdown(remaining)}` : 'Finishing up — should be back any moment.'}
            </div>
          </div>
        )}

        {!preview && (
          <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Try again
            </button>
            {signedIn ? (
              <button
                type="button"
                onClick={async () => { await logout(); navigate('/'); }}
                style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/?modal=login')}
                style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Admin sign in
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

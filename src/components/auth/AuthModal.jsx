import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { getPostAuthPath } from '../../utils/navigation';

export default function AuthModal({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialMode = searchParams.get('modal') === 'register' ? 'register' : 'login';

  const store = useAuthStore();
  const authMode = store.authMode;
  const authModeLabel = authMode === 'hybrid'
    ? 'Supabase Auth with Demo Backup'
    : authMode === 'demo'
      ? 'Demo Mode Active'
      : 'Secure Sign In';
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const overlayRef = useRef(null);
  const returnTo = searchParams.get('returnTo');

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [regData, setRegData] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'organizer' });

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    const remembered = window.localStorage.getItem('fairplay_remembered_email');
    if (remembered) {
      setLoginData((current) => ({ ...current, email: remembered }));
      setRememberMe(true);
    }
  }, []);

  const redirectAfterLogin = (user) => {
    navigate(getPostAuthPath(user, returnTo), { replace: true });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const email = String(loginData.email || '').trim();
    const password = String(loginData.password || '');

    if (!email) return setError('Email is required.');
    if (!password) return setError('Password is required.');

    const result = await store.login(email, password);
    if (result.success) {
      if (rememberMe) {
        window.localStorage.setItem('fairplay_remembered_email', email);
      } else {
        window.localStorage.removeItem('fairplay_remembered_email');
      }
      onClose();
      redirectAfterLogin(result.user);
      return;
    }

    setError(result.error || 'Login failed. Please try again.');
  };

  const passwordStrength = (() => {
    const password = String(regData.password || '');
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { label: 'Weak', color: '#f87171', width: '25%' };
    if (score === 2) return { label: 'Fair', color: '#fbbf24', width: '50%' };
    if (score === 3) return { label: 'Strong', color: '#38bdf8', width: '75%' };
    return { label: 'Very strong', color: '#34d399', width: '100%' };
  })();

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const name = String(regData.name || '').trim();
    const email = String(regData.email || '').trim();
    const password = String(regData.password || '');
    const confirmPassword = String(regData.confirmPassword || '');

    if (!name || !email || !password || !confirmPassword) return setError('Please complete every field.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return setError('Password must include uppercase, lowercase, and numbers.');
    }
    if (password !== confirmPassword) return setError('Passwords do not match.');
    if (!acceptedTerms) return setError('Please agree to the terms to continue.');

    const result = await store.register({ name, email, password, role: 'organizer' });
    if (result.success) {
      if (result.requiresEmailConfirmation) {
        setMode('login');
        setNotice(result.message || 'Account created. Please confirm your email before signing in.');
        setLoginData({ email, password: '' });
        return;
      }
      onClose();
      redirectAfterLogin(result.user);
      return;
    }

    setError(result.error || 'Registration failed.');
  };

  return (
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(1, 6, 20, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '10px 16px 18px',
        overflowY: 'auto',
      }}
    >
      <div style={{
        background: 'linear-gradient(180deg, rgba(10,15,26,0.98), rgba(5,10,18,0.98))',
        border: '1px solid rgba(103,232,249,0.14)',
        borderRadius: 28,
        width: '100%',
        maxWidth: 540,
        maxHeight: 'calc(100vh - 20px)',
        boxShadow: '0 30px 120px rgba(0,0,0,0.56)',
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          aria-label="Close authentication dialog"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 36,
            height: 36,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            color: '#a0aec0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <i className="bi bi-x-lg" />
        </button>

        <div style={{ padding: '18px 32px 0', textAlign: 'center' }}>
          <div style={{ width: 42, height: 42, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/icon.svg" alt="FairPlay" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 0 15px rgba(6, 182, 212, 0.5))' }} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)', color: '#67e8f9', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            <i className={authMode === 'supabase' ? 'bi bi-shield-lock' : authMode === 'hybrid' ? 'bi bi-layers' : 'bi bi-display'} />
            {authModeLabel}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, color: '#f8fafc' }}>
            {mode === 'login' ? 'Welcome Back' : 'Create Organizer Account'}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 14 }}>
            {mode === 'login' ? 'Access your FairPlay workspace and continue your workflow.' : 'Register as an organizer and go straight to your dashboard.'}
          </p>

          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4, marginBottom: 14 }}>
            <button
              onClick={() => { setMode('login'); setError(''); setNotice(''); }}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                background: mode === 'login' ? 'rgba(0,242,254,0.12)' : 'transparent',
                color: mode === 'login' ? '#b5f3ff' : '#a0aec0',
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setNotice(''); }}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                background: mode === 'register' ? 'rgba(79,172,254,0.14)' : 'transparent',
                color: mode === 'register' ? '#dbeafe' : '#a0aec0',
              }}
            >
              Register
            </button>
          </div>
        </div>

        <div style={{ padding: '0 32px 20px' }}>
          {error && (
            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
              {error}
            </div>
          )}

          {notice && (
            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', color: '#bae6fd', fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
              {notice}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <Field label="Email">
                <input type="email" value={loginData.email} onChange={(event) => setLoginData((current) => ({ ...current, email: event.target.value }))} autoFocus style={inputStyle} />
              </Field>
              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={loginData.password} onChange={(event) => setLoginData((current) => ({ ...current, password: event.target.value }))} style={inputStyle} />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} style={passwordToggleStyle}>
                    <i className={showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'} />
                  </button>
                </div>
              </Field>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} style={{ width: 16, height: 16, accentColor: '#06b6d4' }} />
                  Remember me
                </label>
              </div>

              <button type="submit" disabled={store.loading} style={primaryButtonStyle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                  <i className={store.loading ? 'bi bi-arrow-repeat' : 'bi bi-box-arrow-in-right'} style={store.loading ? rotatingIconStyle : undefined} />
                  {store.loading ? 'Signing In...' : 'Sign In'}
                </span>
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister}>
              <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                <Field label="Full Name" noMargin>
                  <input type="text" value={regData.name} onChange={(event) => setRegData((current) => ({ ...current, name: event.target.value }))} autoFocus style={inputStyle} />
                </Field>
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)', color: '#bae6fd', fontSize: 13, fontWeight: 700 }}>
                  Role: Organizer only. You will be redirected to the organizer dashboard after registration.
                </div>
              </div>

              <Field label="Email">
                <input type="email" value={regData.email} onChange={(event) => setRegData((current) => ({ ...current, email: event.target.value }))} style={inputStyle} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 12 }}>
                <Field label="Password" noMargin>
                  <div style={{ position: 'relative' }}>
                    <input type={showRegisterPassword ? 'text' : 'password'} value={regData.password} onChange={(event) => setRegData((current) => ({ ...current, password: event.target.value }))} style={inputStyle} />
                    <button type="button" onClick={() => setShowRegisterPassword((value) => !value)} style={passwordToggleStyle}>
                      <i className={showRegisterPassword ? 'bi bi-eye-slash' : 'bi bi-eye'} />
                    </button>
                  </div>
                </Field>
                <Field label="Confirm Password" noMargin>
                  <div style={{ position: 'relative' }}>
                    <input type={showRegisterConfirmPassword ? 'text' : 'password'} value={regData.confirmPassword} onChange={(event) => setRegData((current) => ({ ...current, confirmPassword: event.target.value }))} style={inputStyle} />
                    <button type="button" onClick={() => setShowRegisterConfirmPassword((value) => !value)} style={passwordToggleStyle}>
                      <i className={showRegisterConfirmPassword ? 'bi bi-eye-slash' : 'bi bi-eye'} />
                    </button>
                  </div>
                </Field>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Password strength</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: passwordStrength.color }}>{passwordStrength.label}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: passwordStrength.width, height: '100%', background: passwordStrength.color, transition: 'width 0.2s ease' }} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#cbd5e1', marginBottom: 20 }}>
                <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} style={{ width: 16, height: 16, accentColor: '#06b6d4' }} />
                I agree to the FairPlay terms and privacy policy.
              </label>

              <button type="submit" disabled={store.loading} style={primaryButtonStyle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                  <i className={store.loading ? 'bi bi-arrow-repeat' : 'bi bi-person-plus'} style={store.loading ? rotatingIconStyle : undefined} />
                  {store.loading ? 'Creating Account...' : 'Create Account'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fairplay-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, noMargin = false }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#a0aec0', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
};

const passwordToggleStyle = {
  position: 'absolute',
  right: 12,
  top: 12,
  border: 'none',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 14,
};

const primaryButtonStyle = {
  width: '100%',
  padding: '14px',
  borderRadius: 14,
  border: 'none',
  background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
  color: '#03111c',
  fontWeight: 800,
  fontSize: 15,
  cursor: 'pointer',
};

const rotatingIconStyle = {
  display: 'inline-flex',
  animation: 'fairplay-spin 0.9s linear infinite',
};

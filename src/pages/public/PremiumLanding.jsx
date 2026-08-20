import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import './PremiumLanding.css';

/* ─── Auth Modal ────────────────────────────────────────────────── */
const AuthModal = ({ mode: initialMode, onClose }) => {
  const store = useAuthStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [error, setError] = useState('');
  const overlayRef = useRef(null);

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [regData, setRegData] = useState({
    name: '', email: '', password: '', confirmPassword: '', role: 'organizer'
  });

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const redirectAfterLogin = (user) => {
    const paths = { admin: '/admin', organizer: '/organizer', judge: '/judge', participant: '/participant' };
    navigate(paths[user?.role] || '/dashboard', { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginData.email || !loginData.password) { setError('Please fill in all fields.'); return; }
    const result = await store.login(loginData.email, loginData.password);
    if (result.success) {
      onClose();
      redirectAfterLogin(result.user);
    } else {
      setError(result.error || 'Login failed. Please try again.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regData.name || !regData.email || !regData.password) { setError('Please fill in all fields.'); return; }
    if (regData.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (regData.password !== regData.confirmPassword) { setError('Passwords do not match.'); return; }
    const result = await store.register({ name: regData.name, email: regData.email, password: regData.password, role: 'organizer' });
    if (result.success) {
      onClose();
      redirectAfterLogin(result.user);
    } else {
      setError(result.error || 'Registration failed.');
    }
  };

  return (
    <div className="fp-modal-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="fp-modal">
        <button className="fp-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="fp-modal-logo">
          <span className="fp-modal-logo-icon">⚡</span>
          <span>FairPlay</span>
        </div>
        <div className="fp-modal-tabs">
          <button className={`fp-modal-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>
            Sign In
          </button>
          <button className={`fp-modal-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>
            Create Account
          </button>
          <div className={`fp-modal-tab-indicator ${mode === 'register' ? 'right' : 'left'}`} />
        </div>

        {error && <div className="fp-modal-error">⚠ {error}</div>}

        {mode === 'login' && (
          <form className="fp-form" onSubmit={handleLogin}>
            <div className="fp-field">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={loginData.email}
                onChange={e => setLoginData(p => ({ ...p, email: e.target.value }))} autoFocus />
            </div>
            <div className="fp-field">
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={loginData.password}
                onChange={e => setLoginData(p => ({ ...p, password: e.target.value }))} />
            </div>
            <button type="submit" className="fp-btn-primary" disabled={store.loading}>
              {store.loading ? <span className="fp-spinner" /> : 'Sign In →'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form className="fp-form" onSubmit={handleRegister}>
            <div className="fp-field-row">
              <div className="fp-field">
                <label>Full Name</label>
                <input type="text" placeholder="Juan dela Cruz" value={regData.name}
                  onChange={e => setRegData(p => ({ ...p, name: e.target.value }))} autoFocus />
              </div>
              <div className="fp-field">
                <label>Role</label>
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)', color: '#bae6fd', fontWeight: 700 }}>
                  Organizer only. You will go straight to your dashboard after registration.
                </div>
              </div>
            </div>
            <div className="fp-field">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={regData.email}
                onChange={e => setRegData(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="fp-field-row">
              <div className="fp-field">
                <label>Password</label>
                <input type="password" placeholder="Min. 6 characters" value={regData.password}
                  onChange={e => setRegData(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="fp-field">
                <label>Confirm Password</label>
                <input type="password" placeholder="Repeat password" value={regData.confirmPassword}
                  onChange={e => setRegData(p => ({ ...p, confirmPassword: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="fp-btn-primary" disabled={store.loading}>
              {store.loading ? <span className="fp-spinner" /> : 'Create Account →'}
            </button>
          </form>
        )}

        <p className="fp-modal-footer">
          {mode === 'login' ? (
            <>No account yet? <button type="button" onClick={() => { setMode('register'); setError(''); }}>Sign up free</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
};

/* ─── Icon Helper ── */
function renderIcon(name) {
  const icons = {
    calendar: '📅', users: '👥', brand: '⚡', globe: '🌐',
    settings: '⚙️', trophy: '🏆', chart: '📊', lock: '🔒',
    mobile: '📱', star: '⭐', medal: '🏅', gamepad: '🎮',
    speech: '🎤', brain: '🧠',
    success: '🟢', gold: '🥇', error: '🔴',
    dashboard: '📊', menu: '☰', bell: '🔔', user: '👤'
  };
  return icons[name] || '✨';
}

/* ─── Main Landing Page ─────────────────────────────────────────── */
const PremiumLanding = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialModal = searchParams.get('modal');

  const [modalMode, setModalMode] = useState(initialModal || null);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (initialModal) setModalMode(initialModal);
  }, [initialModal]);

  const openModal = useCallback((mode) => setModalMode(mode), []);
  const closeModal = useCallback(() => {
    setModalMode(null);
    if (searchParams.has('modal')) navigate('/', { replace: true });
  }, [navigate, searchParams]);

  const stats = [
    { number: '10K+', label: 'Events Hosted', icon: 'calendar' },
    { number: '100K+', label: 'Participants', icon: 'users' },
    { number: '99.9%', label: 'Uptime', icon: 'brand' },
    { number: '50+', label: 'Countries', icon: 'globe' },
  ];

  const features = [
    { icon: 'settings', title: 'Easy Event Setup', desc: 'Create and configure events in under 5 minutes with our intuitive builder.' },
    { icon: 'brand', title: 'Real-Time Scoring', desc: 'Live score updates with instant leaderboard sync across all devices.' },
    { icon: 'trophy', title: 'Auto Rankings', desc: 'Automatic ranking with weighted scoring — fair and transparent.' },
    { icon: 'chart', title: 'Analytics Dashboard', desc: 'Rich insights, performance reports, and exportable data.' },
    { icon: 'lock', title: 'Role-Based Access', desc: 'Admin, Organizer, Judge, and Participant roles out of the box.' },
    { icon: 'mobile', title: 'Mobile Ready', desc: 'Fully responsive — works perfectly on phones and tablets.' },
  ];

  return (
    <div className="fp-landing">
      <div className="fp-bg-grid" />
      <div className="fp-bg-glow fp-bg-glow-1" />
      <div className="fp-bg-glow fp-bg-glow-2" />

      <nav className={`fp-nav ${scrolled ? 'fp-nav--scrolled' : ''}`}>
        <div className="fp-nav-inner">
          <div className="fp-nav-brand">
            <span className="fp-nav-logo">⚡</span>
            <span>FairPlay</span>
          </div>
          <div className="fp-nav-links">
            <a href="#features" className="fp-nav-link">Features</a>
            <button className="fp-nav-btn-ghost" onClick={() => openModal('login')}>Sign In</button>
            <button className="fp-nav-btn-primary" onClick={() => openModal('register')}>Get Started</button>
          </div>
          <div className="fp-nav-mobile">
            <button className="fp-nav-btn-ghost" onClick={() => openModal('login')}>Sign In</button>
            <button className="fp-nav-btn-primary" onClick={() => openModal('register')}>Join</button>
          </div>
        </div>
      </nav>

      <section className="fp-hero">
        <div className="fp-hero-inner">
          <div className="fp-hero-badge">
            <span className="fp-badge-dot" />
            Now live — Event Management Revolution
          </div>
          <h1 className="fp-hero-title">
            The Platform for<br />
            <span className="fp-hero-gradient">Fair Competition</span>
          </h1>
          <p className="fp-hero-desc">
            Create, organize, and score events with real-time leaderboards, automated rankings, and beautiful analytics.
          </p>
          <div className="fp-hero-actions">
            <button className="fp-btn-hero-primary" onClick={() => openModal('register')}>
              Start for Free <span className="fp-btn-arrow">→</span>
            </button>
            <button className="fp-btn-hero-ghost" onClick={() => openModal('login')}>Sign In</button>
          </div>
          <p className="fp-hero-note">No credit card required · Free forever for small events</p>
        </div>
        <div className="fp-hero-visual">
          <div className="fp-hero-card fp-hc-1">
            <div className="fp-hc-label">Live Leaderboard</div>
            {[
              { label: 'Team Alpha', score: 980 },
              { label: 'Team Beta', score: 870 },
              { label: 'Team Gamma', score: 760 }
            ].map((t, i) => (
              <div key={i} className="fp-hc-row">
                <span>{t.label}</span>
                <span className="fp-hc-score">{t.score}</span>
              </div>
            ))}
          </div>
          <div className="fp-hero-card fp-hc-2">
            <div className="fp-hc-label">Active Events</div>
            <div className="fp-hc-big">6</div>
            <div className="fp-hc-sub">↑ 2 new today</div>
          </div>
          <div className="fp-hero-card fp-hc-3">
            <div className="fp-hc-label">Participants</div>
            <div className="fp-hc-big">342</div>
            <div className="fp-hc-sub">Across 6 events</div>
          </div>
        </div>
      </section>

      <section className="fp-stats">
        {stats.map((s, i) => (
          <div key={i} className="fp-stat">
            <div className="fp-stat-icon">{renderIcon(s.icon)}</div>
            <div className="fp-stat-number">{s.number}</div>
            <div className="fp-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="fp-section" id="features">
        <div className="fp-section-header">
          <div className="fp-section-badge">Features</div>
          <h2>Everything you need to run great events</h2>
          <p>One platform for organizing, scoring, and analyzing any competition.</p>
        </div>
        <div className="fp-features-grid">
          {features.map((f, i) => (
            <div key={i} className="fp-feature-card" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="fp-feature-icon">{renderIcon(f.icon)}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="fp-cta">
        <div className="fp-cta-glow" />
        <div className="fp-cta-inner">
          <h2>Ready to transform your events?</h2>
          <p>Join thousands of organizers running better competitions with FairPlay.</p>
          <div className="fp-cta-actions">
            <button className="fp-btn-hero-primary" onClick={() => openModal('register')}>
              Create Free Account <span className="fp-btn-arrow">→</span>
            </button>
            <button className="fp-btn-hero-ghost" onClick={() => openModal('login')}>I have an account</button>
          </div>
        </div>
      </section>

      <footer className="fp-footer">
        <div className="fp-footer-brand"><span className="fp-nav-logo">⚡</span> FairPlay</div>
        <p>© 2025 FairPlay Events. Built for fair competition.</p>
      </footer>

      {modalMode && <AuthModal mode={modalMode} onClose={closeModal} />}
    </div>
  );
};

export default PremiumLanding;

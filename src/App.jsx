import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Component, Suspense, lazy, useEffect, useState } from 'react';
import useAuthStore from './store/authStore';
import ToastContainer from './components/ui/Toast';
import GlobalAuthModal from './components/auth/GlobalAuthModal';
import AIChatbot from './components/AIChatbot';
import { APPROVAL_ROLES, buildAuthModalPath, buildReturnToPath, roleHomePath } from './utils/navigation';

const Landing = lazy(() => import('./pages/public/Landing'));
const PremiumLanding = lazy(() => import('./pages/public/PremiumLanding'));
const PublicEventView = lazy(() => import('./pages/public/PublicEventView'));
const CertificateVerify = lazy(() => import('./pages/public/CertificateVerify'));
const PublicBrackets = lazy(() => import('./pages/public/PublicBrackets'));
const PublicLeaderboard = lazy(() => import('./pages/public/PublicLeaderboard'));
const AudienceScoring = lazy(() => import('./pages/public/AudienceScoring'));
const QRInterceptor = lazy(() => import('./pages/public/QRInterceptor'));
const QRResolver = lazy(() => import('./components/qr/QRResolver'));
const EmailConfirmed = lazy(() => import('./pages/auth/EmailConfirmed'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminRoles = lazy(() => import('./pages/admin/AdminRoles'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminAIMonitor = lazy(() => import('./pages/admin/AdminAIMonitor'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminBackup = lazy(() => import('./pages/admin/AdminBackup'));

const OrganizerDashboard = lazy(() => import('./pages/organizer/OrganizerDashboard'));
const CreateEvent = lazy(() => import('./pages/organizer/CreateEvent'));
const OrganizerEvents = lazy(() => import('./pages/organizer/OrganizerEvents'));
const OrganizerContestants = lazy(() => import('./pages/organizer/OrganizerContestants'));
const OrganizerJudges = lazy(() => import('./pages/organizer/OrganizerJudges'));
const OrganizerSchedule = lazy(() => import('./pages/organizer/OrganizerSchedule'));
const OrganizerVenues = lazy(() => import('./pages/organizer/OrganizerVenues'));
const OrganizerReports = lazy(() => import('./pages/organizer/OrganizerReports'));
const OrganizerSettings = lazy(() => import('./pages/organizer/OrganizerSettings'));
const OrganizerBracket = lazy(() => import('./pages/organizer/OrganizerBracket'));
const OrganizerScoring = lazy(() => import('./pages/organizer/OrganizerScoring'));
const OrganizerVerification = lazy(() => import('./pages/organizer/OrganizerVerification'));
const OrganizerEventDetail = lazy(() => import('./pages/organizer/OrganizerEventDetail'));
const OrganizerCertificates = lazy(() => import('./pages/organizer/OrganizerCertificates'));

const JudgeDashboard = lazy(() => import('./pages/judge/JudgeDashboard'));
const JudgeEvents = lazy(() => import('./pages/judge/JudgeEvents'));
const JudgeScoring = lazy(() => import('./pages/judge/JudgeScoring'));
const JudgeReview = lazy(() => import('./pages/judge/JudgeReview'));
const JudgeHistory = lazy(() => import('./pages/judge/JudgeHistory'));
const JudgeSettings = lazy(() => import('./pages/judge/JudgeSettings'));
const JudgeSessionGate = lazy(() => import('./pages/judge/JudgeSessionGate'));
const JudgeInviteAccept = lazy(() => import('./pages/judge/JudgeInviteAccept'));
const JudgePublicScoring = lazy(() => import('./pages/judge/JudgePublicScoring'));
const JudgeLiveScoring = lazy(() => import('./pages/judge/JudgeLiveScoring'));
const ScorerLiveScoring = lazy(() => import('./pages/scorer/ScorerLiveScoring'));
const ScorerSession = lazy(() => import('./pages/scorer/ScorerSession'));

const PublicParticipantRegister = lazy(() => import('./pages/participant/PublicParticipantRegister'));
const ParticipantDashboard = lazy(() => import('./pages/participant/ParticipantDashboard'));
const ParticipantEvents = lazy(() => import('./pages/participant/ParticipantEvents'));
const ParticipantSchedule = lazy(() => import('./pages/participant/ParticipantSchedule'));
const ParticipantScores = lazy(() => import('./pages/participant/ParticipantScores'));
const ParticipantAnnouncements = lazy(() => import('./pages/participant/ParticipantAnnouncements'));
const ParticipantProfile = lazy(() => import('./pages/participant/ParticipantProfile'));
const TeamRegistration = lazy(() => import('./pages/participant/TeamRegistration'));
const IndividualRegistration = lazy(() => import('./pages/participant/IndividualRegistration'));
const RegistrationSuccess = lazy(() => import('./pages/participant/RegistrationSuccess'));

const BracketsPage = lazy(() => import('./pages/BracketsPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('FairPlay page error:', error);
  }

  render() {
    if (this.state.hasError) {
      return <AppErrorFallback onRetry={() => this.setState({ hasError: false })} />;
    }

    return this.props.children;
  }
}

function ProtectedRoute({ children, role, roles }) {
  const { user, token, loading, initialized } = useAuthStore();
  const location = useLocation();

  if (loading || !initialized) {
    return <LoadingFallback />;
  }

  if (!user || !token) {
    return <Navigate to={buildAuthModalPath('login', buildReturnToPath(location))} replace />;
  }

  if (user.role === 'organizer' && user.status !== 'active') {
    return <Navigate to="/?modal=login" replace />;
  }

  const allowedRoles = roles || (role ? [role] : []);
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }

  return children;
}

function DashboardRedirect() {
  const { user, token, loading, initialized } = useAuthStore();
  const location = useLocation();

  if (loading || !initialized) {
    return <LoadingFallback />;
  }

  if (!user || !token) {
    return <Navigate to={buildAuthModalPath('login', buildReturnToPath(location))} replace />;
  }

  if (user.role === 'organizer' && user.status !== 'active') {
    return <Navigate to="/?modal=login" replace />;
  }

  return <Navigate to={roleHomePath(user.role)} replace />;
}

function AuthEntryRedirect({ mode }) {
  const location = useLocation();
  const currentParams = new URLSearchParams(location.search);
  const returnTo = currentParams.get('returnTo') || '';

  return <Navigate to={buildAuthModalPath(mode, returnTo)} replace />;
}

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <img src="/logo.svg" alt="FairPlay" style={{ width: 150, height: 'auto' }} />
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" style={{ animation: 'fp-spin 0.9s linear infinite' }}>
        <defs>
          <linearGradient id="fp-loading-ring" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#26D6FF" />
            <stop offset="0.5" stopColor="#1686E8" />
            <stop offset="1" stopColor="#083FA5" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="13" stroke="url(#fp-loading-ring)" strokeWidth="3" strokeLinecap="round" strokeDasharray="55 26" />
      </svg>
      <p style={{ margin: 0, color: '#64748b', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Loading FairPlay
      </p>
      <style>{`
        @keyframes fp-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function AppErrorFallback({ onRetry }) {
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
          maxWidth: 460,
          background: '#ffffff',
          border: '1px solid #fecaca',
          borderRadius: 24,
          padding: 32,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(239,68,68,0.10)',
        }}
      >
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 46, color: '#ef4444', marginBottom: 16 }} />
        <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Something went wrong</h1>
        <p style={{ margin: '0 0 22px', color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
          FairPlay could not load this page correctly. Try again, or return to the home page and open the link again.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '11px 16px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <Link
            to="/"
            style={{
              padding: '11px 16px',
              borderRadius: 12,
              border: '1px solid #bfdbfe',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return isMobile;
}

function MobileAccessBlocked({ message }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
        color: '#0f172a',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#ffffff',
          border: '1px solid #bfdbfe',
          borderRadius: 24,
          padding: 32,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: 'linear-gradient(135deg,#2563eb,#0ea5e9)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 18px',
            fontSize: 28,
          }}
        >
          <i className="bi bi-shield-lock" />
        </div>
        <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 900 }}>Mobile App Access Restricted</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
          {message || 'This area is not available in the mobile app. Admin and organizer tools are intentionally excluded for security and usability.'}
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 18px',
            borderRadius: 14,
            background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
            color: '#fff',
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          <i className="bi bi-house" />
          Go to FairPlay
        </Link>
      </div>
    </div>
  );
}

function MobileRestrictedRoute({ children, message }) {
  const isMobile = useIsMobileViewport();

  if (isMobile) {
    return <MobileAccessBlocked message={message} />;
  }

  return children;
}

function AppNotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
        color: '#0f172a',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#ffffff',
          border: '1px solid #bfdbfe',
          borderRadius: 24,
          padding: 32,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'linear-gradient(135deg,#2563eb,#0ea5e9)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 18px',
            fontSize: 28,
          }}
        >
          <i className="bi bi-link-45deg" />
        </div>
        <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 900 }}>Link not found</h1>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
          This FairPlay link is invalid, expired, or no longer available. Check the QR code or ask the organizer for a fresh link.
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 18px',
            borderRadius: 14,
            background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
            color: '#fff',
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          <i className="bi bi-house" />
          Go to FairPlay
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const initAuth = useAuthStore((state) => state.initAuth);

  useEffect(() => {
    // Initialize AI logging system
    if (typeof window !== 'undefined' && !window.fairplayAILog) {
      window.fairplayAILog = [];
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GlobalAuthModal />
      <AppErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/premium" element={<PremiumLanding />} />
          <Route path="/login" element={<AuthEntryRedirect mode="login" />} />
          <Route path="/register" element={<AuthEntryRedirect mode="register" />} />
          <Route path="/events/:id" element={<PublicEventView />} />
          <Route path="/certificates/:code" element={<CertificateVerify />} />
          <Route path="/events/:id/brackets" element={<PublicBrackets />} />
          <Route path="/events/:id/leaderboard" element={<PublicLeaderboard />} />
          <Route path="/audience/:eventId" element={<AudienceScoring />} />
          <Route path="/qr/:token" element={<QRInterceptor />} />
          <Route path="/scan/:token" element={<QRResolver />} />
          <Route path="/auth/confirmed" element={<EmailConfirmed />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/analytics" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminAnalytics /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/users" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/roles" element={<MobileRestrictedRoute><ProtectedRoute roles={APPROVAL_ROLES}><AdminRoles /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/audit" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminAudit /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/ai-monitor" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminAIMonitor /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/reports" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminReports /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/settings" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminSettings /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/backup" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminBackup /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/admin/profile" element={<MobileRestrictedRoute><ProtectedRoute role="admin"><AdminSettings /></ProtectedRoute></MobileRestrictedRoute>} />

          {/* Approval Routes */}
          <Route path="/approvals" element={<MobileRestrictedRoute><ProtectedRoute roles={APPROVAL_ROLES}><AdminRoles /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/institute-coordinator" element={<MobileRestrictedRoute><ProtectedRoute role="institute-coordinator"><AdminRoles /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/sports-head" element={<MobileRestrictedRoute><ProtectedRoute role="sports-head"><AdminRoles /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/osds" element={<MobileRestrictedRoute><ProtectedRoute role="osds"><AdminRoles /></ProtectedRoute></MobileRestrictedRoute>} />

          {/* Organizer Routes */}
          <Route path="/organizer" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerDashboard /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/create-event" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><CreateEvent /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/events" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerEvents /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/contestants" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerContestants /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/judges" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerJudges /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/schedule" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerSchedule /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/venues" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerVenues /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/reports" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerReports /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/settings" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerSettings /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/brackets" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerBracket /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/scoring" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerScoring /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/events/:id" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerEventDetail /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/verify/:token" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerVerification /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/certificates" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerCertificates /></ProtectedRoute></MobileRestrictedRoute>} />
          <Route path="/organizer/profile" element={<MobileRestrictedRoute><ProtectedRoute role="organizer"><OrganizerSettings /></ProtectedRoute></MobileRestrictedRoute>} />

          {/* Judge Routes */}
          <Route path="/judge" element={<ProtectedRoute role="judge"><JudgeDashboard /></ProtectedRoute>} />
          <Route path="/judge/events" element={<ProtectedRoute role="judge"><JudgeEvents /></ProtectedRoute>} />
          <Route path="/judge/scoring" element={<ProtectedRoute role="judge"><JudgeScoring /></ProtectedRoute>} />
          <Route path="/judge/review" element={<ProtectedRoute role="judge"><JudgeReview /></ProtectedRoute>} />
          <Route path="/judge/history" element={<ProtectedRoute role="judge"><JudgeHistory /></ProtectedRoute>} />
          <Route path="/judge/settings" element={<ProtectedRoute role="judge"><JudgeSettings /></ProtectedRoute>} />
          <Route path="/judge/profile" element={<ProtectedRoute role="judge"><JudgeSettings /></ProtectedRoute>} />
          <Route path="/participant/register" element={<PublicParticipantRegister />} />
          <Route path="/judge/open/:eventId" element={<JudgePublicScoring />} />
          <Route path="/judge/session/:sessionId" element={<JudgeSessionGate />} />
          <Route path="/judge/invite/:token" element={<JudgeInviteAccept />} />
          <Route path="/judge/live/:sessionId" element={<JudgeLiveScoring />} />
          <Route path="/scorer/live/:sessionId" element={<ScorerLiveScoring />} />
          <Route path="/scorer/session/:token" element={<ScorerSession />} />
          <Route path="/judge/score/:token" element={<ProtectedRoute role="judge"><JudgeScoring /></ProtectedRoute>} />

          {/* Participant Routes */}
          <Route path="/participant" element={<ProtectedRoute role="participant"><ParticipantDashboard /></ProtectedRoute>} />
          <Route path="/participant/events" element={<ProtectedRoute role="participant"><ParticipantEvents /></ProtectedRoute>} />
          <Route path="/participant/schedule" element={<ProtectedRoute role="participant"><ParticipantSchedule /></ProtectedRoute>} />
          <Route path="/participant/scores" element={<ProtectedRoute role="participant"><ParticipantScores /></ProtectedRoute>} />
          <Route path="/participant/announcements" element={<ProtectedRoute role="participant"><ParticipantAnnouncements /></ProtectedRoute>} />
          <Route path="/participant/profile" element={<ProtectedRoute role="participant"><ParticipantProfile /></ProtectedRoute>} />
          <Route path="/participant/register-team" element={<ProtectedRoute role="participant"><TeamRegistration /></ProtectedRoute>} />
          <Route path="/participant/register-individual" element={<ProtectedRoute role="participant"><IndividualRegistration /></ProtectedRoute>} />
          <Route path="/participant/registration-success" element={<ProtectedRoute role="participant"><RegistrationSuccess /></ProtectedRoute>} />

          {/* Legacy / Common Routes */}
          <Route path="/brackets" element={<ProtectedRoute><BracketsPage /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />

          <Route path="/dashboard" element={<DashboardRedirect />} />
          <Route path="*" element={<AppNotFound />} />
          </Routes>
        </Suspense>
      </AppErrorBoundary>
      <AIChatbot />
      <ToastContainer />
    </Router>
  );
}

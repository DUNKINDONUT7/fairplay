import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { getPostAuthPath } from '../../utils/navigation';
import AuthModal from './AuthModal';

export default function GlobalAuthModal() {
  const { user, token, loading, initialized, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const hasModal = searchParams.has('modal');
  const signedIn = Boolean(user && token);
  const blockedOrganizer = signedIn && user.role === 'organizer' && user.status !== 'active';

  // A signed-in user sent to ?modal=login would otherwise see the landing page
  // with no modal (it hides while signed in) and look stuck: send an active
  // user to their dashboard, and sign a blocked organizer out so the login
  // modal can actually show.
  useEffect(() => {
    if (!initialized || loading || !hasModal || !signedIn) return;
    if (blockedOrganizer) {
      logout();
      return;
    }
    navigate(getPostAuthPath(user, searchParams.get('returnTo') || ''), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, loading, hasModal, signedIn, blockedOrganizer]);

  if (loading || !initialized) {
    // initAuth() is bounded (worst case a handful of seconds, if a stale
    // browser session lock makes getSession() hang), but this component
    // rendered nothing at all during that wait — someone landing directly
    // on ?modal=login just saw a static page with no sign the click did
    // anything, which reads as "the login button is broken" even though
    // it was actually just about to work.
    if (hasModal) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(1, 6, 20, 0.55)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: '#26D6FF',
              borderRadius: '50%',
              animation: 'fp-auth-modal-spin 0.8s linear infinite',
            }}
          />
          <style>{`@keyframes fp-auth-modal-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }
    return null;
  }

  if (signedIn) {
    return null;
  }

  if (hasModal) {
    const handleClose = () => {
      searchParams.delete('modal');
      searchParams.delete('returnTo');
      navigate({ search: searchParams.toString() }, { replace: true });
    };
    return <AuthModal onClose={handleClose} />;
  }

  return null;
}

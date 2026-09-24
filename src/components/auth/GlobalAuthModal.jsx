import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import AuthModal from './AuthModal';

export default function GlobalAuthModal() {
  const { user, token, loading, initialized } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  if (loading || !initialized) {
    // initAuth() is bounded (worst case a handful of seconds, if a stale
    // browser session lock makes getSession() hang), but this component
    // rendered nothing at all during that wait — someone landing directly
    // on ?modal=login just saw a static page with no sign the click did
    // anything, which reads as "the login button is broken" even though
    // it was actually just about to work.
    if (searchParams.has('modal')) {
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

  if (user && token) {
    return null;
  }

  if (searchParams.has('modal')) {
    const handleClose = () => {
      searchParams.delete('modal');
      searchParams.delete('returnTo');
      navigate({ search: searchParams.toString() }, { replace: true });
    };
    return <AuthModal onClose={handleClose} />;
  }
  
  return null;
}

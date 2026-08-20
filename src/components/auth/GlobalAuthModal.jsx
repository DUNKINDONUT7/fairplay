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

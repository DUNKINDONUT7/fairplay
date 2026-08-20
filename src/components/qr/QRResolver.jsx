import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { buildAuthModalPath, roleHomePath } from '../../utils/navigation';

export default function QRResolver() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, token: authToken } = useAuthStore();

  useEffect(() => {
    if (!authToken || !user) {
      navigate(buildAuthModalPath('login', `/scan/${token}`), { replace: true });
      return;
    }

    switch (user.role) {
      case 'organizer':
      case 'admin':
        navigate(`/organizer/verify/${token}`, { replace: true });
        break;
      case 'judge':
        navigate(`/judge/score/${token}`, { replace: true });
        break;
      case 'participant':
        navigate('/participant/events', { replace: true });
        break;
      default:
        navigate(roleHomePath(user.role), { replace: true });
    }
  }, [token, user, authToken, navigate]);

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div className="spinner" style={{ width: '48px', height: '48px', borderWidth: '4px', borderColor: 'var(--accent-cyan)', borderTopColor: 'transparent' }}></div>
        <p style={{ color: 'var(--accent-cyan)', fontWeight: '600', animation: 'pulse 2s infinite' }}>Resolving QR Data...</p>
      </div>
    </div>
  );
}

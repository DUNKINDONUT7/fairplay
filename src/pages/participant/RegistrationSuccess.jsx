import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useRegistrationStore from '../../store/registrationStore';

export default function RegistrationSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const reset = useRegistrationStore((state) => state.reset);
  const lastSubmitted = useRegistrationStore((state) => state.lastSubmitted);
  const submittedName = lastSubmitted?.teamName || lastSubmitted?.individualDetails?.name || 'Your registration';
  const submittedType = lastSubmitted?.registrationType || 'participant';
  const registrationId = location.state?.registrationId || lastSubmitted?.id || 'Pending';

  useEffect(() => {
    // Clean up the store registration payload once we mount the success page
    return () => reset();
  }, [reset]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', borderTop: '4px solid var(--accent-green)', maxWidth: '600px', width: '100%' }}>
        <h1 style={{ color: 'var(--accent-green)', fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--spacing-md)' }}>&#10003; Success!</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xl)' }}>Your registration is complete. Your smart QR code(s) have been generated and will appear in your dashboard.</p>
        <div style={{ marginBottom: 'var(--spacing-xl)', padding: '14px 18px', borderRadius: 14, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', textAlign: 'left' }}>
          <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: 13 }}>Registrant</p>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700 }}>{submittedName}</p>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Type: {submittedType} | Reference: {registrationId}</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/participant')} 
          style={{ 
            padding: '12px 32px', 
            boxShadow: 'var(--shadow-neon)' 
          }}>
          Go to My Dashboard
        </button>
      </div>
    </div>
  );
}

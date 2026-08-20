import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useRegistrationStore from '../../store/registrationStore';

export default function IndividualRegistration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setEvent, individualDetails, setIndividualDetails, submitIndividualRegistration, status } = useRegistrationStore();

  useEffect(() => {
    const eventId = searchParams.get('eventId');
    if (eventId) {
      setEvent(eventId, 'individual');
    }
  }, [searchParams, setEvent]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!individualDetails.name?.trim()) return alert('Participant name is required.');
    if (individualDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(individualDetails.email)) {
      return alert('Please enter a valid email address.');
    }
    try {
      const registration = await submitIndividualRegistration();
      navigate('/participant/registration-success', { state: { registrationId: registration?.id } });
    } catch {
      // Store status/error already updated for UI consumers.
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', padding: 'var(--spacing-xl)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <button
          onClick={() => navigate('/participant')}
          style={{ background: 'transparent', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          Back to Dashboard
        </button>

        <h1 style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--spacing-lg)', color: 'var(--text-primary)' }}>Event Registration</h1>

        <div className="card" style={{ marginBottom: 'var(--spacing-xl)', padding: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Full Name</label>
              <input type="text" value={individualDetails.name} onChange={(event) => setIndividualDetails({ name: event.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Email Address</label>
              <input type="email" value={individualDetails.email} onChange={(event) => setIndividualDetails({ email: event.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Phone Number</label>
              <input type="tel" value={individualDetails.phone} onChange={(event) => setIndividualDetails({ phone: event.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-full-width btn-lg" onClick={handleSubmit} disabled={status === 'loading'} style={{ boxShadow: 'var(--shadow-neon)' }}>
          {status === 'loading' ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px' }}></div> Registering...
            </span>
          ) : (
            'Submit Registration'
          )}
        </button>
      </div>
    </div>
  );
}

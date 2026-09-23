import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useEventStore from '../../store/eventStore';

export default function ParticipantEvents() {
  const navigate = useNavigate();
  const { events, fetchEvents } = useEventStore();

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const availableEvents = events.map((event) => {
    const max = Number(event.maxParticipants || 0);
    const current = Array.isArray(event.contestants) ? event.contestants.length : Number(event.participants || 0);
    const isTeam = ['team', 'sports', 'esports', 'tournament', 'sportsfest'].includes(String(event.type).toLowerCase());
    const status = event.status === 'completed'
      ? 'closed'
      : max && current >= max
        ? 'full'
        : event.status === 'draft'
          ? 'closed'
          : 'open';

    return {
      id: event.id,
      title: event.title,
      type: event.type,
      format: isTeam ? 'team' : 'individual',
      date: event.startDate || event.scheduledDate || 'Schedule pending',
      slots: max ? `${current}/${max}` : `${current}/Open`,
      status,
      prize: event.prize || 'Recognition',
    };
  });

  const handleRegister = (event) => {
    if (event.status !== 'open') return;
    if (event.format === 'team') {
      navigate(`/participant/register-team?eventId=${event.id}`);
    } else {
      navigate(`/participant/register-individual?eventId=${event.id}`);
    }
  };

  const statusStyle = (status) => {
    if (status === 'open') return { background: '#dcfce7', color: '#15803d' };
    if (status === 'full') return { background: '#fee2e2', color: '#dc2626' };
    return { background: '#f1f5f9', color: '#64748b' };
  };

  return (
    <DashboardLayout title="Event Registration" subtitle="Browse live events and submit registrations through the system data flow">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
        {availableEvents.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{event.title}</h3>
              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...statusStyle(event.status) }}>
                {event.status}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8, textTransform: 'capitalize' }}>{event.type}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <span>Date: {event.date}</span>
              <span>Slots: {event.slots}</span>
              <span>Award: {event.prize}</span>
            </div>
            <button
              onClick={() => handleRegister(event)}
              disabled={event.status !== 'open'}
              style={{
                width: '100%', padding: '10px', borderRadius: 8,
                background: event.status === 'open' ? 'linear-gradient(135deg, #2563eb, #0ea5e9)' : '#f1f5f9',
                color: event.status === 'open' ? '#fff' : '#94a3b8',
                border: 'none', fontWeight: 700, fontSize: 13,
                cursor: event.status === 'open' ? 'pointer' : 'not-allowed',
              }}
            >
              {event.status === 'open' ? `Register ${event.format === 'team' ? 'Team' : 'Individually'}` : event.status === 'full' ? 'Registration Full' : 'Registration Closed'}
            </button>
          </motion.div>
        ))}
      </div>
    </DashboardLayout>
  );
}

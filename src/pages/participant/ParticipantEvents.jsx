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

  return (
    <DashboardLayout title="Event Registration" subtitle="Browse live events and submit registrations through the system data flow">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
        {availableEvents.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{ background: 'rgba(15,20,25,0.6)', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 16, padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{event.title}</h3>
              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: event.status === 'open' ? 'rgba(16,185,129,0.15)' : event.status === 'full' ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.15)', color: event.status === 'open' ? '#10b981' : event.status === 'full' ? '#ef4444' : '#6b7280' }}>
                {event.status}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#a0aec0', marginBottom: 8 }}>{event.type}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#a0aec0', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <span>Date: {event.date}</span>
              <span>Slots: {event.slots}</span>
              <span>Award: {event.prize}</span>
            </div>
            <button
              onClick={() => handleRegister(event)}
              disabled={event.status !== 'open'}
              style={{ width: '100%', padding: '10px', borderRadius: 8, background: event.status === 'open' ? 'linear-gradient(135deg, #06b6d4, #0084ff)' : 'rgba(255,255,255,0.04)', color: event.status === 'open' ? '#000' : '#666', border: 'none', fontWeight: 700, fontSize: 13, cursor: event.status === 'open' ? 'pointer' : 'not-allowed' }}
            >
              {event.status === 'open' ? `Register ${event.format === 'team' ? 'Team' : 'Individually'}` : event.status === 'full' ? 'Registration Full' : 'Registration Closed'}
            </button>
          </motion.div>
        ))}
      </div>
    </DashboardLayout>
  );
}

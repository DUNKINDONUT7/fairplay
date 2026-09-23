import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useEventStore from '../../store/eventStore';

const EVENT_TYPE_ICON = {
  esports: 'bi-controller',
  singing: 'bi-mic-fill',
  dance: 'bi-music-note-beamed',
  sportsfest: 'bi-award-fill',
  academic: 'bi-mortarboard-fill',
  hackathon: 'bi-laptop-fill',
  pageant: 'bi-gem',
  sports: 'bi-award-fill',
  tournament: 'bi-trophy-fill',
};

function eventTypeIcon(type) {
  return EVENT_TYPE_ICON[String(type).toLowerCase()] || 'bi-trophy-fill';
}

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
      {availableEvents.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-calendar-x" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No events to register for yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Check back later for newly published events</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
          {availableEvents.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4, boxShadow: '0 18px 40px rgba(37,99,235,0.12)' }}
              transition={{ delay: index * 0.05 }}
              style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 14, gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: '#dbeafe', color: '#2563eb', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`bi ${eventTypeIcon(event.type)}`} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</h3>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', textTransform: 'capitalize' }}>{event.type}</p>
                  </div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', ...statusStyle(event.status) }}>
                  {event.status}
                </span>
              </div>

              <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#64748b', marginBottom: 18, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #eef2f7' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-calendar3" style={{ color: '#94a3b8' }} /> {event.date}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-people-fill" style={{ color: '#94a3b8' }} /> {event.slots} slots filled
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-trophy" style={{ color: '#94a3b8' }} /> {event.prize}
                </span>
              </div>

              <motion.button
                whileHover={event.status === 'open' ? { scale: 1.015 } : undefined}
                whileTap={event.status === 'open' ? { scale: 0.98 } : undefined}
                onClick={() => handleRegister(event)}
                disabled={event.status !== 'open'}
                style={{
                  width: '100%', padding: '11px', borderRadius: 10,
                  background: event.status === 'open' ? 'linear-gradient(135deg, #2563eb, #0ea5e9)' : '#f1f5f9',
                  color: event.status === 'open' ? '#fff' : '#94a3b8',
                  border: 'none', fontWeight: 700, fontSize: 13,
                  cursor: event.status === 'open' ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {event.status === 'open' && <i className={event.format === 'team' ? 'bi bi-people-fill' : 'bi bi-person-fill'} />}
                {event.status === 'open' ? `Register ${event.format === 'team' ? 'Team' : 'Individually'}` : event.status === 'full' ? 'Registration Full' : 'Registration Closed'}
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

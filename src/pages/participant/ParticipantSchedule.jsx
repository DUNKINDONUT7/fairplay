import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';

const TYPE_ICON = {
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
  return TYPE_ICON[String(type).toLowerCase()] || 'bi-trophy-fill';
}

function statusMeta(event) {
  const status = String(event?.status || '').toLowerCase();
  if (status === 'completed') return { label: 'Completed', color: '#64748b', background: '#f1f5f9' };
  if (status === 'active' || status === 'ongoing') return { label: 'Ongoing', color: '#15803d', background: '#dcfce7' };
  return { label: 'Upcoming', color: '#2563eb', background: '#dbeafe' };
}

export default function ParticipantSchedule() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();

  useEffect(() => {
    fetchEvents();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations]);

  const schedule = useMemo(() => {
    if (!user?.email) return [];
    const myEventIds = new Set(
      registrations
        .filter((registration) => (registration.email || '').toLowerCase() === user.email.toLowerCase())
        .map((registration) => String(registration.eventId))
    );

    return events
      .filter((event) => myEventIds.has(String(event.id)))
      .sort((a, b) => new Date(a.startDate || a.scheduledDate || 0) - new Date(b.startDate || b.scheduledDate || 0));
  }, [events, registrations, user?.email]);

  return (
    <DashboardLayout title="My Schedule" subtitle="View your upcoming events and matches">
      {schedule.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-calendar-x" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No events on your schedule yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Register for an event to see it show up here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {schedule.map((event, i) => {
            const status = statusMeta(event);
            const dateValue = event.startDate || event.scheduledDate;
            const timeLabel = event.startTime
              ? (event.endTime ? `${event.startTime} - ${event.endTime}` : event.startTime)
              : 'Time TBD';

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2, boxShadow: '0 16px 34px rgba(37,99,235,0.1)' }}
                transition={{ delay: i * 0.05 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 14,
                  padding: '16px 20px', boxShadow: '0 10px 30px rgba(37,99,235,0.06)',
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  background: '#eff6ff', border: '1px solid #dbeafe',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  {dateValue ? (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', lineHeight: 1 }}>
                        {new Date(dateValue).toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                        {new Date(dateValue).getDate()}
                      </span>
                    </>
                  ) : (
                    <i className={`bi ${eventTypeIcon(event.type)}`} style={{ color: '#2563eb', fontSize: 18 }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{event.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 12.5, color: '#64748b', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="bi bi-clock" style={{ color: '#94a3b8' }} /> {timeLabel}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="bi bi-geo-alt" style={{ color: '#94a3b8' }} /> {event.location || 'Venue TBD'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#2563eb', textTransform: 'capitalize' }}>
                    <i className={`bi ${eventTypeIcon(event.type)}`} /> {event.type || 'Event'}
                  </span>
                  <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: status.background, color: status.color }}>
                    {status.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

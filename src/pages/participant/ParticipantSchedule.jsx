import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';

const STATUS_TABS = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'live', label: 'Ongoing', statuses: ['active', 'ongoing'] },
  { value: 'upcoming', label: 'Upcoming', statuses: ['approved', 'upcoming', 'draft', 'pending'] },
  { value: 'completed', label: 'Completed', statuses: ['completed'] },
];

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

// Email is the primary match (and now pre-filled from the account at
// registration time), but a registration submitted before that fix — or
// typed with a slightly different email — would otherwise be invisible
// here forever despite having gone through fine. Falling back to an exact
// name match rescues those without requiring anyone to re-register.
function isMyRegistration(registration, user) {
  if (!user) return false;
  const email = String(registration.email || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  if (email && userEmail && email === userEmail) return true;

  const participantName = String(registration.participantName || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();
  return Boolean(participantName && userName && participantName === userName);
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
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchEvents();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations]);

  const fullSchedule = useMemo(() => {
    if (!user) return [];
    const myEventIds = new Set(
      registrations
        .filter((registration) => isMyRegistration(registration, user))
        .map((registration) => String(registration.eventId))
    );

    return events
      .filter((event) => myEventIds.has(String(event.id)))
      .sort((a, b) => new Date(a.startDate || a.scheduledDate || 0) - new Date(b.startDate || b.scheduledDate || 0));
  }, [events, registrations, user?.email]);

  const statusTabs = STATUS_TABS.map((tab) => ({
    ...tab,
    count: tab.value === 'all' ? fullSchedule.length : fullSchedule.filter((event) => tab.statuses.includes(event.status)).length,
  })).filter((tab) => tab.value === 'all' || tab.count > 0 || tab.value === statusFilter);

  const schedule = useMemo(() => {
    const tab = STATUS_TABS.find((t) => t.value === statusFilter);
    if (!tab?.statuses) return fullSchedule;
    return fullSchedule.filter((event) => tab.statuses.includes(event.status));
  }, [fullSchedule, statusFilter]);

  return (
    <DashboardLayout title="My Schedule" subtitle="View your upcoming events and matches">
      {fullSchedule.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-calendar-x" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No events on your schedule yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Register for an event to see it show up here.</p>
        </div>
      ) : (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}>
          <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {statusTabs.map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(tab.value)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, border: active ? '1px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {tab.label}
                  <span style={{ padding: '0 7px', borderRadius: 999, fontSize: 12, background: active ? '#dbeafe' : '#f1f5f9', color: active ? '#1d4ed8' : '#64748b' }}>{tab.count}</span>
                </button>
              );
            })}
          </div>

          {schedule.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <i className="bi bi-search" style={{ fontSize: 34, color: '#cbd5e1', display: 'block', marginBottom: 10 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>No events in this filter</p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Try another status tab.</p>
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
        </div>
      )}
    </DashboardLayout>
  );
}

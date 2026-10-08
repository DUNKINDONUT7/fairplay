import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useEventStore from '../../store/eventStore';
import useAuthStore from '../../store/authStore';
import useRegistrationStore from '../../store/registrationStore';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'registered', label: 'Registered' },
  { value: 'full', label: 'Full' },
  { value: 'closed', label: 'Closed' },
];

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

// Email is the primary match (pre-filled from the account at registration
// time), with an exact name fallback for registrations submitted before
// that fix, or from the mobile app with a slightly different typed email.
// Mirrors the same check in ParticipantSchedule and ParticipantDashboard.
function isMyRegistration(registration, user) {
  if (!user) return false;
  const email = String(registration.email || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  if (email && userEmail && email === userEmail) return true;

  const participantName = String(registration.participantName || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();
  return Boolean(participantName && userName && participantName === userName);
}

export default function ParticipantEvents() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchEvents();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations]);

  const registeredEventIds = useMemo(() => {
    if (!user) return new Set();
    return new Set(
      registrations
        .filter((registration) => isMyRegistration(registration, user))
        .map((registration) => String(registration.eventId))
    );
  }, [registrations, user]);

  const availableEvents = events.map((event) => {
    const max = Number(event.maxParticipants || 0);
    const current = Array.isArray(event.contestants) ? event.contestants.length : Number(event.participants || 0);
    const isTeam = ['team', 'sports', 'esports', 'tournament', 'sportsfest'].includes(String(event.type).toLowerCase());
    const registered = registeredEventIds.has(String(event.id));
    const status = registered
      ? 'registered'
      : event.status === 'completed'
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

  const term = search.trim().toLowerCase();
  const statusTabs = STATUS_TABS.map((tab) => ({
    ...tab,
    count: tab.value === 'all' ? availableEvents.length : availableEvents.filter((event) => event.status === tab.value).length,
  })).filter((tab) => tab.value === 'all' || tab.count > 0 || tab.value === statusFilter);

  const filteredEvents = availableEvents.filter((event) => {
    if (statusFilter !== 'all' && event.status !== statusFilter) return false;
    if (!term) return true;
    return [event.title, event.type].some((value) => String(value || '').toLowerCase().includes(term));
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
    if (status === 'registered') return { background: '#dbeafe', color: '#2563eb' };
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
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}>
          <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or type"
              aria-label="Search events"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 34px', borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, outline: 'none' }}
            />
          </div>

          <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
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

          {filteredEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <i className="bi bi-search" style={{ fontSize: 34, color: '#cbd5e1', display: 'block', marginBottom: 10 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>No events match your search or filter</p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Try another status or clear the search.</p>
              <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 14 }}>
                <i className="bi bi-x-lg" /> Clear filters
              </button>
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
          {filteredEvents.map((event, index) => (
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
                  background: event.status === 'open'
                    ? 'linear-gradient(135deg, #2563eb, #0ea5e9)'
                    : event.status === 'registered' ? '#dbeafe' : '#f1f5f9',
                  color: event.status === 'open' ? '#fff' : event.status === 'registered' ? '#2563eb' : '#94a3b8',
                  border: 'none', fontWeight: 700, fontSize: 13,
                  cursor: event.status === 'open' ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <i className={event.status === 'open'
                  ? (event.format === 'team' ? 'bi bi-people-fill' : 'bi bi-person-fill')
                  : event.status === 'registered' ? 'bi bi-check-circle-fill' : ''}
                />
                {event.status === 'open'
                  ? `Register ${event.format === 'team' ? 'Team' : 'Individually'}`
                  : event.status === 'registered'
                    ? 'Already Registered'
                    : event.status === 'full'
                      ? 'Registration Full'
                      : 'Registration Closed'}
              </motion.button>
            </motion.div>
          ))}
          </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import { getBusinessActorId, matchesActorIdentity } from '../../utils/identity';

function formatSchedule(event) {
  const startRaw = event.startDate || event.start_date || event.scheduledDate || event.scheduled_date;
  if (!startRaw) return 'Schedule pending';

  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return 'Schedule pending';

  return format(start, 'MMM d, yyyy');
}

function normalizeVenueName(location) {
  return String(location || '').trim();
}

function deriveVenueStatus(events) {
  if (events.some((event) => event.status === 'active' || event.status === 'ongoing')) {
    return 'Active';
  }

  if (events.some((event) => event.status === 'upcoming')) {
    return 'Upcoming';
  }

  if (events.every((event) => event.status === 'completed')) {
    return 'Completed';
  }

  return 'Draft';
}

function statusTone(status) {
  if (status === 'Active') {
    return { bg: 'rgba(16,185,129,0.12)', color: '#059669' };
  }
  if (status === 'Upcoming') {
    return { bg: 'rgba(37,99,235,0.10)', color: '#2563eb' };
  }
  if (status === 'Completed') {
    return { bg: 'rgba(100,116,139,0.12)', color: '#475569' };
  }
  return { bg: 'rgba(245,158,11,0.12)', color: '#d97706' };
}

function summarizeVenue(location, events) {
  const sortedEvents = [...events].sort((left, right) => {
    const leftTime = new Date(left.startDate || left.scheduledDate || left.createdAt || 0).getTime();
    const rightTime = new Date(right.startDate || right.scheduledDate || right.createdAt || 0).getTime();
    return leftTime - rightTime;
  });

  const nextEvent = sortedEvents.find((event) => event.status !== 'completed') || sortedEvents[0] || null;
  const participantTotal = sortedEvents.reduce((sum, event) => sum + Number(event.participants || event.contestants?.length || 0), 0);
  const categories = [...new Set(sortedEvents.map((event) => event.eventType || event.type).filter(Boolean))];
  const status = deriveVenueStatus(sortedEvents);

  return {
    id: location,
    name: location,
    status,
    statusTone: statusTone(status),
    totalEvents: sortedEvents.length,
    participantTotal,
    nextEvent,
    categories,
    recentEvents: sortedEvents.slice(0, 3),
  };
}

function StatCard({ label, value, helper, color = '#2563eb' }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, padding: 20, boxShadow: '0 14px 32px rgba(37,99,235,0.06)' }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{helper}</div>
    </div>
  );
}

export default function OrganizerVenues() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents, loading, error } = useEventStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const organizerBusinessId = getBusinessActorId(user);

  useEffect(() => {
    if (user?.id) {
      fetchEvents(user.id);
    }
  }, [fetchEvents, user?.id]);

  const organizerEvents = useMemo(
    () =>
      events.filter((event) =>
        String(event.organizer_id) === String(organizerBusinessId) ||
        matchesActorIdentity(event.organizerAuthProfileId, user) ||
        matchesActorIdentity(event.organizerEmail, user)
      ),
    [events, organizerBusinessId, user]
  );

  const venues = useMemo(() => {
    const grouped = new Map();

    organizerEvents.forEach((event) => {
      const location = normalizeVenueName(event.location);
      if (!location) return;

      if (!grouped.has(location)) {
        grouped.set(location, []);
      }

      grouped.get(location).push(event);
    });

    return Array.from(grouped.entries())
      .map(([location, venueEvents]) => summarizeVenue(location, venueEvents))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [organizerEvents]);

  const filteredVenues = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return venues.filter((venue) => {
      if (statusFilter !== 'all' && venue.status.toLowerCase() !== statusFilter) return false;
      if (!normalizedSearch) return true;

      return [
        venue.name,
        venue.nextEvent?.title,
        ...venue.categories,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [search, statusFilter, venues]);

  const stats = useMemo(() => {
    const missingLocationEvents = organizerEvents.filter((event) => !normalizeVenueName(event.location)).length;
    const activeVenues = venues.filter((venue) => venue.status === 'Active' || venue.status === 'Upcoming').length;
    const scheduledEvents = organizerEvents.filter((event) => normalizeVenueName(event.location)).length;

    return {
      totalVenues: venues.length,
      activeVenues,
      scheduledEvents,
      missingLocationEvents,
    };
  }, [organizerEvents, venues]);

  return (
    <DashboardLayout title="Venue Management" subtitle="View real venues based on the locations currently used by your events">
      <div style={{ display: 'grid', gap: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          <StatCard label="Total Venues" value={stats.totalVenues} helper="Unique event locations" />
          <StatCard label="Active Venues" value={stats.activeVenues} helper="With ongoing or upcoming events" color="#059669" />
          <StatCard label="Scheduled Events" value={stats.scheduledEvents} helper="Events already assigned to a venue" color="#2563eb" />
          <StatCard label="Location Pending" value={stats.missingLocationEvents} helper="Events that still need a venue" color="#d97706" />
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #dbeafe',
            borderRadius: 22,
            padding: 18,
            boxShadow: '0 16px 36px rgba(37,99,235,0.06)',
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search venue, event, or category"
              style={{
                flex: 1,
                minWidth: 240,
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                outline: 'none',
              }}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{
                minWidth: 180,
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <button
            onClick={() => navigate('/organizer/create-event')}
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
              color: '#ffffff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Add Via Event
          </button>
        </div>

        {error ? (
          <div style={{ background: '#ffffff', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 20, padding: 18, color: '#dc2626' }}>
            {error}
          </div>
        ) : null}

        {stats.missingLocationEvents > 0 ? (
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 18, padding: 16, color: '#9a3412' }}>
            {stats.missingLocationEvents} event{stats.missingLocationEvents === 1 ? '' : 's'} still have no location. Add venue details in the event form so they appear here.
          </div>
        ) : null}

        {loading ? (
          <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, padding: 28, color: '#64748b', textAlign: 'center' }}>
            Loading venue data from your events...
          </div>
        ) : filteredVenues.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px dashed #bfdbfe', borderRadius: 20, padding: 34, color: '#64748b', textAlign: 'center' }}>
            {venues.length === 0
              ? 'No venue data found yet. Add locations to your events and they will automatically appear here.'
              : 'No venue matches your current search or status filter.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
            {filteredVenues.map((venue, index) => (
              <motion.div
                key={venue.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                style={{
                  background: '#ffffff',
                  border: '1px solid #dbeafe',
                  borderRadius: 22,
                  padding: 22,
                  boxShadow: '0 18px 40px rgba(37,99,235,0.06)',
                  display: 'grid',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{venue.name}</h3>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
                      {venue.totalEvents} event{venue.totalEvents === 1 ? '' : 's'} scheduled here
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: venue.statusTone.bg,
                      color: venue.statusTone.color,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {venue.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <div style={miniPanelStyle}>
                    <div style={miniLabelStyle}>Participants</div>
                    <div style={miniValueStyle}>{venue.participantTotal}</div>
                  </div>
                  <div style={miniPanelStyle}>
                    <div style={miniLabelStyle}>Next Event</div>
                    <div style={{ ...miniValueStyle, fontSize: 16 }}>{venue.nextEvent ? formatSchedule(venue.nextEvent) : 'TBD'}</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                    Event Categories
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {venue.categories.map((category) => (
                      <span
                        key={category}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: 'rgba(37,99,235,0.08)',
                          color: '#2563eb',
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {String(category).replace(/[-_]/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                    Recent Events
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {venue.recentEvents.map((event) => (
                      <div
                        key={event.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 14,
                          background: '#f8fbff',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{event.title}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{formatSchedule(event)}</div>
                        </div>
                        <button
                          onClick={() => navigate(`/organizer/events/${event.id}`)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1px solid #bfdbfe',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

const miniPanelStyle = {
  background: '#f8fbff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: 14,
};

const miniLabelStyle = {
  fontSize: 11,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 8,
  fontWeight: 700,
};

const miniValueStyle = {
  fontSize: 24,
  color: '#0f172a',
  fontWeight: 900,
};

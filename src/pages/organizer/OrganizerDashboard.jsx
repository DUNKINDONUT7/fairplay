import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';

export default function OrganizerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, deleteEvent, fetchEvents } = useEventStore();
  const { success } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventToDelete, setEventToDelete] = useState(null);

  useEffect(() => {
    if (user?.id) {
      fetchEvents(user.id);
    }
  }, [fetchEvents, user?.id]);

  const myEvents = events.filter((event) => {
    if (statusFilter !== 'all' && event.status !== statusFilter) return false;
    if (search && !event.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const analytics = useMemo(() => {
    const totalEvents = events.length;
    const activeEvents = events.filter((event) => event.status === 'active').length;
    const upcomingEvents = events.filter((event) => event.status === 'upcoming').length;
    const completedEvents = events.filter((event) => event.status === 'completed').length;
    const draftEvents = events.filter((event) => event.status === 'draft').length;
    const totalParticipants = events.reduce((sum, event) => sum + Number(event.participants || 0), 0);
    const totalCapacity = events.reduce((sum, event) => sum + Number(event.maxParticipants || 0), 0);
    const fillRate = totalCapacity > 0 ? Math.round((totalParticipants / totalCapacity) * 100) : 0;
    const averageParticipants = totalEvents > 0 ? Math.round(totalParticipants / totalEvents) : 0;
    const completionRate = totalEvents > 0 ? Math.round((completedEvents / totalEvents) * 100) : 0;
    const topEvents = [...events]
      .sort((a, b) => Number(b.participants || 0) - Number(a.participants || 0))
      .slice(0, 3);

    return {
      totalEvents,
      activeEvents,
      upcomingEvents,
      completedEvents,
      draftEvents,
      totalParticipants,
      fillRate,
      averageParticipants,
      completionRate,
      topEvents,
    };
  }, [events]);

  const stats = [
    { label: 'Total Events', value: analytics.totalEvents, icon: 'bi bi-calendar-event', color: '#1d4ed8', tone: 'rgba(37,99,235,0.12)' },
    { label: 'Active Now', value: analytics.activeEvents, icon: 'bi bi-broadcast', color: '#0f766e', tone: 'rgba(20,184,166,0.14)' },
    { label: 'Upcoming', value: analytics.upcomingEvents, icon: 'bi bi-clock-history', color: '#0369a1', tone: 'rgba(14,165,233,0.14)' },
    { label: 'Participants', value: analytics.totalParticipants, icon: 'bi bi-people', color: '#b45309', tone: 'rgba(245,158,11,0.14)' },
  ];

  const quickActions = [
    {
      icon: 'bi bi-eye',
      label: 'View',
      action: (event) => navigate(`/organizer/events/${event.id}`),
    },
    {
      icon: 'bi bi-pencil-square',
      label: 'Edit',
      action: (event) => navigate(`/organizer/events/${event.id}`),
    },
    {
      icon: 'bi bi-bar-chart-line',
      label: 'Scores',
      action: (event) => navigate(`/organizer/scoring?eventId=${event.id}`),
    },
  ];

  const cardStyle = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: 24,
    boxShadow: '0 12px 32px rgba(15,23,42,0.06)',
  };

  return (
    <DashboardLayout title="Organizer Dashboard" subtitle="Manage your events and competitions">
      <ConfirmDialog
        open={Boolean(eventToDelete)}
        title="Delete this event?"
        message={eventToDelete ? `"${eventToDelete.title}" and all of its contestants, scores, and certificates will be permanently deleted. This cannot be undone.` : ''}
        confirmLabel="Delete Event"
        onCancel={() => setEventToDelete(null)}
        onConfirm={() => {
          deleteEvent(eventToDelete.id);
          success(`Deleted event: ${eventToDelete.title}`);
          setEventToDelete(null);
        }}
      />
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          marginBottom: 28,
          borderRadius: 28,
          padding: 28,
          background: 'radial-gradient(circle at top left, rgba(96,165,250,0.28), transparent 32%), linear-gradient(135deg, #eff6ff 0%, #f8fbff 48%, #ecfeff 100%)',
          border: '1px solid rgba(96,165,250,0.24)',
          boxShadow: '0 22px 60px rgba(59,130,246,0.10)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -60,
            top: -80,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'rgba(34,211,238,0.14)',
            filter: 'blur(10px)',
          }}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.95fr)',
            gap: 22,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.72)', color: '#1d4ed8', fontSize: 12, fontWeight: 800, marginBottom: 14 }}>
              <i className="bi bi-graph-up-arrow" />
              Event Analytics Snapshot
            </div>
            <h2 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 900, color: '#0f172a', marginBottom: 10 }}>
              Monitor every event from one clean dashboard hero.
            </h2>
            <p style={{ fontSize: 14, color: '#475569', maxWidth: 620, marginBottom: 20 }}>
              Track participation, live activity, draft workload, and top-performing events without leaving the organizer dashboard.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 14, marginBottom: 20 }}>
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(148,163,184,0.18)',
                    borderRadius: 18,
                    padding: 16,
                    boxShadow: '0 10px 30px rgba(148,163,184,0.08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{stat.label}</span>
                    <span style={{ width: 38, height: 38, borderRadius: 12, background: stat.tone, color: stat.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      <i className={stat.icon} />
                    </span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                </motion.div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/organizer/create-event')}
                style={{
                  padding: '14px 22px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 14px 34px rgba(37,99,235,0.24)',
                }}
              >
                <i className="bi bi-plus-circle" />
                Create Event
              </motion.button>
              <button
                onClick={() => navigate('/organizer/events')}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.9)',
                  border: '1px solid rgba(148,163,184,0.22)',
                  color: '#0f172a',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <i className="bi bi-kanban" />
                Manage Events
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 16,
              alignSelf: 'stretch',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96))',
                borderRadius: 24,
                padding: 22,
                border: '1px solid rgba(59,130,246,0.18)',
                boxShadow: '0 18px 42px rgba(15,23,42,0.18)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 18 }}>
                <div>
                  <p style={{ color: '#93c5fd', fontSize: 12, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Hero Insights
                  </p>
                  <h3 style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>
                    {analytics.fillRate}% venue fill rate
                  </h3>
                </div>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(56,189,248,0.14)', color: '#38bdf8', display: 'grid', placeItems: 'center', fontSize: 20 }}>
                  <i className="bi bi-activity" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
                {[
                  { label: 'Completion Rate', value: `${analytics.completionRate}%`, tone: '#34d399' },
                  { label: 'Avg. Participants', value: analytics.averageParticipants, tone: '#fbbf24' },
                  { label: 'Draft Queue', value: analytics.draftEvents, tone: '#fb7185' },
                  { label: 'Completed', value: analytics.completedEvents, tone: '#c084fc' },
                ].map((item) => (
                  <div key={item.label} style={{ padding: 14, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.12)' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: item.tone }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>Top Event Performance</p>
                  <span style={{ color: '#7dd3fc', fontSize: 12 }}>By participants</span>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {(analytics.topEvents.length > 0 ? analytics.topEvents : [{ id: 'empty', title: 'No events yet', participants: 0, maxParticipants: 0 }]).map((event) => {
                    const progress = event.maxParticipants ? Math.min(100, Math.round(((event.participants || 0) / event.maxParticipants) * 100)) : 0;
                    return (
                      <div key={event.id} style={{ padding: 12, borderRadius: 16, background: 'rgba(2,6,23,0.38)', border: '1px solid rgba(148,163,184,0.10)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                          <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>{event.title}</span>
                          <span style={{ color: '#67e8f9', fontSize: 12, fontWeight: 700 }}>{event.participants || 0}</span>
                        </div>
                        <div style={{ height: 7, borderRadius: 999, background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8, #22c55e)', borderRadius: 999 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <i className="bi bi-calendar-week" />
            My Events
          </h3>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                fontSize: 13,
                outline: 'none',
                width: 160,
              }}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                fontSize: 13,
                outline: 'none',
              }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {myEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <p style={{ fontSize: 40, marginBottom: 12, color: '#2563eb' }}>
                <i className="bi bi-calendar2-x" />
              </p>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#475569', marginBottom: 4 }}>No events found</p>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>Create your first event to get started</p>
            </div>
          ) : (
            myEvents.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(37,99,235,0.12)', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      <i className="bi bi-calendar-event" />
                    </span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>{event.title}</p>
                      <p style={{ fontSize: 12, color: '#64748b' }}>{event.type} | {event.location || 'No location'}</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: event.status === 'active'
                      ? 'rgba(37,99,235,0.12)'
                      : event.status === 'completed'
                        ? 'rgba(148,163,184,0.18)'
                        : event.status === 'upcoming'
                          ? 'rgba(14,165,233,0.12)'
                          : 'rgba(59,130,246,0.12)',
                    color: event.status === 'active'
                      ? '#1d4ed8'
                      : event.status === 'completed'
                        ? '#64748b'
                        : event.status === 'upcoming'
                          ? '#0284c7'
                          : '#2563eb',
                  }}>
                    {event.status}
                  </span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {quickActions.map((button) => (
                      <button
                        key={button.label}
                        onClick={() => button.action(event)}
                        aria-label={button.label}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#2563eb',
                          padding: '6px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                        title={button.label}
                      >
                        <i className={button.icon} />
                      </button>
                    ))}
                    <button
                      onClick={() => setEventToDelete(event)}
                      aria-label="Delete event"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: '#ef4444',
                        padding: '6px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                      title="Delete"
                    >
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

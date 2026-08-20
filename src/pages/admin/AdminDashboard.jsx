import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Calendar,
  Trophy,
  CheckCircle2,
  Scale,
  UserRound,
  Zap,
  BarChart3,
  Database,
  LineChart,
  Eye,
  Pencil,
  Trash2,
  ClipboardList,
  Image as ImageIcon,
  Activity,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PaginationControls from '../../components/admin/PaginationControls';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';

const FALLBACK_IMAGES = {
  tournament: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=640&h=360&fit=crop',
  sportsfest: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=640&h=360&fit=crop',
  singing: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=640&h=360&fit=crop',
  pageant: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=640&h=360&fit=crop',
  dance: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=640&h=360&fit=crop',
  academic: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=640&h=360&fit=crop',
  contest: 'https://images.unsplash.com/photo-1540575467063-178cb50230e3?w=640&h=360&fit=crop',
  default: '/placeholder.jpg',
};

function getEventImage(event) {
  return (
    event.imageUrl ||
    event.image ||
    event.coverImage ||
    event.bannerUrl ||
    event.metadata?.imageUrl ||
    event.metadata?.image ||
    FALLBACK_IMAGES[event.eventType] ||
    FALLBACK_IMAGES[event.type] ||
    FALLBACK_IMAGES.default
  );
}

function hasEventImage(event) {
  return Boolean(
    event.imageUrl ||
    event.image ||
    event.coverImage ||
    event.bannerUrl ||
    event.metadata?.imageUrl ||
    event.metadata?.image
  );
}

function formatDate(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean).map(String)).size;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { events, fetchEvents, deleteEvent } = useEventStore();
  const { users, refreshProfiles } = useAuthStore();
  const { judges, assignments, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [eventPage, setEventPage] = useState(1);
  const [eventLimit, setEventLimit] = useState(10);

  useEffect(() => {
    fetchEvents();
    fetchJudges();
    fetchRegistrations();
    fetchScores();
    fetchAttendance();
    refreshProfiles();
  }, [fetchAttendance, fetchEvents, fetchJudges, fetchRegistrations, fetchScores, refreshProfiles]);

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);

  const analytics = useMemo(() => {
    const activeEvents = events.filter((event) => ['active', 'ongoing'].includes(event.status)).length;
    const completedEvents = events.filter((event) => event.status === 'completed').length;
    const draftEvents = events.filter((event) => event.status === 'draft').length;
    const totalParticipants = events.reduce((sum, event) => {
      const contestantCount = Array.isArray(event.contestants) ? event.contestants.length : 0;
      return sum + Number(event.participants || contestantCount || 0);
    }, 0);
    const organizers = uniqueCount(events.map((event) => event.organizer_id || event.organizerAuthProfileId || event.organizerEmail));
    const checkedIn = attendance.filter((row) => row.checkInStatus === 'checked-in').length;
    const imagesConnected = events.filter(hasEventImage).length;
    const scoringEvents = uniqueCount(scoreRows.map((score) => score.eventId));
    const totalUsers = users.length;

    return {
      totalUsers,
      organizers,
      activeEvents,
      totalEvents: events.length,
      completedEvents,
      draftEvents,
      totalScores: scoreRows.length,
      activeJudges: judges.filter((judge) => judge.status !== 'inactive').length,
      judgeAssignments: assignments.length,
      totalParticipants,
      registrations: registrations.length,
      checkedIn,
      imagesConnected,
      scoringEvents,
      systemUptime: 'Live',
    };
  }, [assignments.length, attendance, events, judges, registrations.length, scoreRows, users.length]);

  const overviewStats = [
    { label: 'Total Users', value: analytics.totalUsers, icon: Users, color: '#2563eb' },
    { label: 'Active Events', value: analytics.activeEvents, icon: Calendar, color: '#1d4ed8' },
    { label: 'Total Events', value: analytics.totalEvents, icon: Trophy, color: '#3b82f6' },
    { label: 'Total Scores', value: analytics.totalScores, icon: BarChart3, color: '#2563eb' },
  ];

  const operationsStats = [
    { label: 'Completed', value: analytics.completedEvents, icon: CheckCircle2, color: '#0ea5e9' },
    { label: 'Active Judges', value: analytics.activeJudges, icon: Scale, color: '#2563eb' },
    { label: 'Participants', value: analytics.totalParticipants, icon: UserRound, color: '#1d4ed8' },
    { label: 'System Flow', value: analytics.systemUptime, icon: Zap, color: '#0ea5e9' },
  ];

  const platformAnalytics = [
    { label: 'Organizers', value: analytics.organizers },
    { label: 'Registrations', value: analytics.registrations },
    { label: 'Checked In', value: analytics.checkedIn },
    { label: 'Images Connected', value: analytics.imagesConnected },
  ];

  const flowCards = [
    { label: 'Organizer Events', value: analytics.totalEvents, helper: `${analytics.draftEvents} drafts`, icon: Calendar },
    { label: 'Registration Flow', value: analytics.registrations, helper: `${analytics.totalParticipants} participants in events`, icon: ClipboardList },
    { label: 'Judge / Scorer Flow', value: analytics.judgeAssignments, helper: `${analytics.scoringEvents} events with scores`, icon: Activity },
    { label: 'Visual Assets', value: analytics.imagesConnected, helper: 'event images visible to admin', icon: ImageIcon },
  ];

  const filteredEvents = useMemo(() => (
    events.filter((event) => {
      if (filter !== 'all' && event.status !== filter) return false;
      if (!search) return true;
      const haystack = [
        event.title,
        event.type,
        event.eventType,
        event.location,
        event.organizerEmail,
        event.description,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search.toLowerCase());
    })
  ), [events, filter, search]);
  const totalEventPages = Math.max(1, Math.ceil(filteredEvents.length / eventLimit));
  const paginatedEvents = useMemo(() => {
    const safePage = Math.min(eventPage, totalEventPages);
    const start = (safePage - 1) * eventLimit;
    return filteredEvents.slice(start, start + eventLimit);
  }, [eventLimit, eventPage, filteredEvents, totalEventPages]);

  useEffect(() => {
    setEventPage(1);
  }, [eventLimit, filter, search]);

  useEffect(() => {
    if (eventPage > totalEventPages) setEventPage(totalEventPages);
  }, [eventPage, totalEventPages]);

  const cardStyle = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: 24,
    boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
  };

  const statsCardStyle = {
    ...cardStyle,
    padding: 20,
    minHeight: 110,
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <DashboardLayout title="Super Admin Dashboard" subtitle="Complete platform oversight connected to organizer activity">
      <div style={dashboardStackStyle}>
        <div>
          <h3 style={sectionHeadingStyle}>Overview</h3>
          <div style={statsGridStyle}>
            {overviewStats.map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} style={{ ...statsCardStyle, borderLeft: `3px solid ${stat.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{stat.label}</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</p>
                  </div>
                  <span style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(37,99,235,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>
                    <stat.icon size={18} />
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={sectionHeadingStyle}>Operations</h3>
          <div style={statsGridStyle}>
            {operationsStats.map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} style={{ ...statsCardStyle, borderLeft: `3px solid ${stat.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{stat.label}</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</p>
                  </div>
                  <span style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(37,99,235,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>
                    <stat.icon size={18} />
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={mainDashboardGridStyle}>
          <div style={sidePanelStackStyle}>
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}><Database size={16} /> Database Records</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  { label: 'Users', value: analytics.totalUsers },
                  { label: 'Events', value: analytics.totalEvents },
                  { label: 'Registrations', value: analytics.registrations },
                  { label: 'Scores', value: analytics.totalScores },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>{item.label}</span>
                    <span style={{ fontSize: 18, color: '#2563eb', fontWeight: 900 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardTitleStyle}><LineChart size={16} /> Platform Analytics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {platformAnalytics.map((item) => (
                  <div key={item.label} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{item.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardTitleStyle}><Activity size={16} /> System Flow</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {flowCards.map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(37,99,235,0.10)', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                      <item.icon size={17} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{item.helper}</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#2563eb' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h3 style={cardTitleStyle}><Calendar size={16} /> All Organizer Events</h3>
              <div style={{ display: 'flex', gap: 12 }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events..." style={controlStyle} />
                <select value={filter} onChange={(e) => setFilter(e.target.value)} style={controlStyle}>
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {['Event', 'Type', 'Status', 'Participants', 'Flow', 'Date', 'Actions'].map((header) => (
                      <th key={header} style={tableHeadStyle}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((event, i) => {
                    const eventScores = scoreRows.filter((score) => String(score.eventId) === String(event.id));
                    const eventRegistrations = registrations.filter((registration) => String(registration.eventId) === String(event.id));
                    const eventAttendance = attendance.filter((row) => String(row.eventId) === String(event.id));
                    return (
                      <motion.tr key={event.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', minWidth: 260 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <img
                              src={getEventImage(event)}
                              alt={event.title || 'Event'}
                              style={{ width: 58, height: 42, borderRadius: 10, objectFit: 'cover', border: '1px solid #dbeafe', background: '#f8fafc' }}
                              onError={(imageEvent) => { imageEvent.currentTarget.src = FALLBACK_IMAGES.default; }}
                            />
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{event.title}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{event.organizerEmail || event.location || 'Organizer flow'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={tableCellStyle}>{event.type || event.eventType}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={statusPill(event.status)}>{event.status || 'draft'}</span>
                        </td>
                        <td style={tableCellStyle}>{event.participants || event.contestants?.length || 0}/{event.maxParticipants || 'unlimited'}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <span>{eventRegistrations.length} regs</span>
                            <span>{eventScores.length} scores</span>
                            <span>{eventAttendance.length} check-ins</span>
                          </div>
                        </td>
                        <td style={tableCellStyle}>{formatDate(event.startDate || event.scheduledDate)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => navigate(`/events/${event.id}`)} style={actionBtnStyle} aria-label="View public event" title="View public event">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => navigate('/admin/analytics')} style={actionBtnStyle} aria-label="View analytics" title="View analytics">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => deleteEvent(event.id)} style={{ ...actionBtnStyle, color: '#ef4444' }} aria-label="Delete event" title="Delete event">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={Math.min(eventPage, totalEventPages)}
              totalPages={totalEventPages}
              limit={eventLimit}
              totalItems={filteredEvents.length}
              onPageChange={setEventPage}
              onLimitChange={setEventLimit}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

const sectionHeadingStyle = {
  fontSize: 14,
  fontWeight: 800,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 12,
};

const dashboardStackStyle = {
  display: 'grid',
  gap: 24,
  width: '100%',
};

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 16,
  alignItems: 'stretch',
};

const mainDashboardGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 20,
  alignItems: 'start',
  width: '100%',
};

const sidePanelStackStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
  gap: 20,
  minWidth: 0,
  alignItems: 'stretch',
};

const cardTitleStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#0f172a',
};

const controlStyle = {
  padding: '8px 14px',
  borderRadius: 10,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
  minWidth: 160,
};

const tableHeadStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 12,
  color: '#64748b',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const tableCellStyle = {
  padding: '12px 16px',
  fontSize: 13,
  color: '#64748b',
  verticalAlign: 'top',
};

function statusPill(status = 'draft') {
  return {
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: status === 'active' ? 'rgba(37,99,235,0.12)' :
      status === 'completed' ? 'rgba(148,163,184,0.18)' :
      status === 'upcoming' ? 'rgba(14,165,233,0.12)' :
      status === 'approved' ? 'rgba(34,197,94,0.12)' :
      'rgba(59,130,246,0.12)',
    color: status === 'active' ? '#1d4ed8' :
      status === 'completed' ? '#64748b' :
      status === 'upcoming' ? '#0284c7' :
      status === 'approved' ? '#15803d' :
      '#2563eb',
  };
}

const actionBtnStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#2563eb',
  padding: '6px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
};

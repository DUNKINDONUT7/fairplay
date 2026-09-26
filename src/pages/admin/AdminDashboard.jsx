import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PaginationControls from '../../components/admin/PaginationControls';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useNotificationStore from '../../store/notificationStore';
import usePlatformSettingsStore from '../../store/platformSettingsStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { deriveAiDetections, fetchStoredAiDetections } from '../../services/adminDataService';
import { supabase } from '../../utils/supabaseClient';

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

const EVENT_STATUS = {
  draft: { label: 'Draft', bg: '#f1f5f9', fg: '#64748b' },
  pending: { label: 'Waiting for approval', bg: '#fef3c7', fg: '#b45309' },
  upcoming: { label: 'Upcoming', bg: '#e0f2fe', fg: '#075985' },
  approved: { label: 'Approved', bg: '#dcfce7', fg: '#15803d' },
  active: { label: 'Live now', bg: '#dcfce7', fg: '#15803d' },
  ongoing: { label: 'Live now', bg: '#dcfce7', fg: '#15803d' },
  completed: { label: 'Completed', bg: '#f1f5f9', fg: '#334155' },
  rejected: { label: 'Rejected', bg: '#fee2e2', fg: '#b91c1c' },
};

const STATUS_FILTERS = [
  ['all', 'All'],
  ['live', 'Live now'],
  ['upcoming', 'Upcoming'],
  ['approved', 'Approved'],
  ['completed', 'Completed'],
  ['draft', 'Draft'],
];

const AUDIT_TABLE_LABELS = {
  profiles: 'user',
  events: 'event',
  teams: 'team',
  registrations: 'registration',
  scores: 'score',
  judges: 'judge',
  judge_assignments: 'judge assignment',
  attendance: 'check-in',
  certificates: 'certificate',
  tournaments: 'tournament',
  brackets: 'bracket',
  matches: 'match',
  rubric_templates: 'rubric template',
  platform_settings: 'platform settings',
};

const AUDIT_VERBS = { insert: 'created', update: 'updated', delete: 'deleted' };
const AUDIT_ICONS = {
  insert: { icon: 'bi bi-plus-lg', bg: '#dcfce7', fg: '#15803d' },
  update: { icon: 'bi bi-pencil', bg: '#dbeafe', fg: '#1d4ed8' },
  delete: { icon: 'bi bi-trash', bg: '#fee2e2', fg: '#b91c1c' },
};

const TREND_DAYS = 14;

function getEventImage(event) {
  return (
    event.imageUrl || event.image || event.coverImage || event.bannerUrl ||
    event.metadata?.imageUrl || event.metadata?.image ||
    FALLBACK_IMAGES[event.eventType] || FALLBACK_IMAGES[event.type] || FALLBACK_IMAGES.default
  );
}

function formatDate(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Counts per local calendar day for the last TREND_DAYS days, oldest first.
function dailyCounts(dates) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: TREND_DAYS }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (TREND_DAYS - 1 - i));
    return { day, count: 0 };
  });
  const start = buckets[0].day.getTime();
  dates.forEach((value) => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time) || time < start) return;
    const index = Math.floor((time - start) / 86400000);
    if (index >= 0 && index < TREND_DAYS) buckets[index].count += 1;
  });
  return buckets;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function groupByEvent(rows, key = 'eventId') {
  const map = new Map();
  rows.forEach((row) => {
    const id = String(row[key]);
    map.set(id, (map.get(id) || 0) + 1);
  });
  return map;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, users, organizerApplications, refreshProfiles } = useAuthStore();
  const { events, fetchEvents, deleteEvent } = useEventStore();
  const { judges, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const { maintenanceEnabled, aiEnabled } = usePlatformSettingsStore();
  const { success, error: notifyError } = useNotificationStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [eventPage, setEventPage] = useState(1);
  const [eventLimit, setEventLimit] = useState(5);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [activity, setActivity] = useState(null);
  const [lastBackup, setLastBackup] = useState(undefined);
  const [storedFlags, setStoredFlags] = useState([]);

  useEffect(() => {
    fetchEvents();
    fetchJudges();
    fetchRegistrations();
    fetchScores();
    fetchAttendance();
    refreshProfiles();
    fetchStoredAiDetections().then((rows) => setStoredFlags(rows || []));

    if (!supabase) return;
    supabase.from('audit_log').select('id, occurred_at, action, table_name, summary, actor_email, actor_id')
      .order('occurred_at', { ascending: false }).limit(7)
      .then(({ data, error }) => setActivity(error ? [] : data || []));
    supabase.from('backups').select('created_at, kind').order('created_at', { ascending: false }).limit(1)
      .then(({ data, error }) => setLastBackup(error ? 'unavailable' : data?.[0] || null));
  }, [fetchAttendance, fetchEvents, fetchJudges, fetchRegistrations, fetchScores, refreshProfiles]);

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);
  const usersById = useMemo(() => new Map(users.map((u) => [String(u.id), u])), [users]);

  const stats = useMemo(() => {
    const byStatus = (list) => events.filter((e) => list.includes(e.status)).length;
    const participants = events.reduce((sum, e) => sum + Number(e.participants || (Array.isArray(e.contestants) ? e.contestants.length : 0) || 0), 0);
    return {
      users: users.length,
      organizers: users.filter((u) => u.role === 'organizer').length,
      judgeAccounts: users.filter((u) => u.role === 'judge').length,
      participantAccounts: users.filter((u) => u.role === 'participant').length,
      events: events.length,
      live: byStatus(['active', 'ongoing']),
      upcoming: byStatus(['upcoming', 'approved']),
      completed: byStatus(['completed']),
      drafts: byStatus(['draft']),
      registrations: registrations.length,
      participants,
      checkIns: attendance.filter((row) => row.checkInStatus === 'checked-in').length,
      scores: scoreRows.length,
      scoredEvents: new Set(scoreRows.map((s) => String(s.eventId))).size,
      judges: judges.filter((j) => j.status !== 'inactive').length,
    };
  }, [attendance, events, judges, registrations, scoreRows, users]);

  const trends = useMemo(() => ({
    users: dailyCounts(users.map((u) => u.createdAt || u.joined)),
    events: dailyCounts(events.map((e) => e.createdAt)),
    registrations: dailyCounts(registrations.map((r) => r.createdAt)),
    scores: dailyCounts(scoreRows.map((s) => s.timestamp)),
  }), [events, registrations, scoreRows, users]);

  const openFlags = useMemo(() => {
    const statusById = new Map(storedFlags.map((row) => [row.id, row.status]));
    return deriveAiDetections({ users, events, registrations, scores: scoreRows, attendance })
      .filter((item) => (statusById.get(item.id) || item.status) === 'open');
  }, [attendance, events, registrations, scoreRows, storedFlags, users]);

  const pendingApprovals = useMemo(() => events.filter((e) => {
    const flow = Array.isArray(e.approvalWorkflow) ? e.approvalWorkflow : [];
    return flow.length > 0 && !flow.some((s) => s.status === 'rejected') && flow.some((s) => s.status !== 'approved');
  }), [events]);

  // undefined = still loading, null = no backups, 'unavailable' = could not check.
  const backupKnown = Boolean(lastBackup) && lastBackup !== 'unavailable';

  const attention = [
    organizerApplications.length > 0 && {
      key: 'applications', icon: 'bi bi-person-plus', tone: 'warning',
      title: `${organizerApplications.length} organizer application${organizerApplications.length === 1 ? '' : 's'}`,
      text: 'Waiting for your approval', to: '/admin/users', cta: 'Review',
    },
    pendingApprovals.length > 0 && {
      key: 'approvals', icon: 'bi bi-diagram-3', tone: 'info',
      title: `${pendingApprovals.length} event${pendingApprovals.length === 1 ? '' : 's'} in approval`,
      text: 'Moving through Coordinator, Sports Head, OSDS', to: '/admin/roles', cta: 'Open',
    },
    openFlags.length > 0 && {
      key: 'flags', icon: 'bi bi-flag', tone: openFlags.some((f) => f.riskLevel === 'high') ? 'danger' : 'warning',
      title: `${openFlags.length} flag${openFlags.length === 1 ? '' : 's'} to review`,
      text: `${openFlags.filter((f) => f.riskLevel === 'high').length} high risk from the automatic checks`, to: '/admin/ai-monitor', cta: 'Review',
    },
    maintenanceEnabled && {
      key: 'maintenance', icon: 'bi bi-tools', tone: 'warning',
      title: 'Maintenance mode is on', text: 'Only admins can use FairPlay right now', to: '/admin/settings', cta: 'Manage',
    },
    lastBackup === null || (backupKnown && Date.now() - new Date(lastBackup.created_at).getTime() > 4 * 86400000)
      ? {
        key: 'backup', icon: 'bi bi-cloud-slash', tone: 'warning',
        title: lastBackup ? 'Last backup is getting old' : 'No backup yet',
        text: lastBackup ? `Last one ${formatRelative(lastBackup.created_at)}` : 'Protect the platform data', to: '/admin/backup', cta: 'Back up',
      }
      : null,
  ].filter(Boolean);

  const regsByEvent = useMemo(() => groupByEvent(registrations), [registrations]);
  const scoresByEvent = useMemo(() => groupByEvent(scoreRows), [scoreRows]);
  const checkInsByEvent = useMemo(() => groupByEvent(attendance), [attendance]);
  const organizerNames = useMemo(() => {
    const map = new Map();
    users.forEach((u) => { if (u.email) map.set(u.email.toLowerCase(), u.name); });
    return map;
  }, [users]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (filter === 'live' && !['active', 'ongoing'].includes(event.status)) return false;
    if (!['all', 'live'].includes(filter) && event.status !== filter) return false;
    if (!search) return true;
    return [event.title, event.type, event.eventType, event.location, event.organizerEmail, event.description]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
  }), [events, filter, search]);

  const totalEventPages = Math.max(1, Math.ceil(filteredEvents.length / eventLimit));
  const currentEventPage = Math.min(eventPage, totalEventPages);
  const paginatedEvents = filteredEvents.slice((currentEventPage - 1) * eventLimit, currentEventPage * eventLimit);

  useEffect(() => { setEventPage(1); }, [eventLimit, filter, search]);

  async function confirmDelete() {
    const event = eventToDelete;
    setEventToDelete(null);
    // deleteEvent removes the row from the list first and only records a
    // failure in the store's error, so check that and restore the list.
    useEventStore.setState({ error: null });
    await deleteEvent(event.id);
    if (useEventStore.getState().error) {
      notifyError(`Could not delete “${event.title}”. It has been restored.`);
      fetchEvents(undefined, { silent: true });
      return;
    }
    success(`Deleted “${event.title}”.`);
  }

  const firstName = String(user?.name || 'Admin').split(' ')[0];

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Everything happening on FairPlay, in one place">
      <ConfirmDialog
        open={Boolean(eventToDelete)}
        title="Delete this event?"
        message={eventToDelete ? `“${eventToDelete.title}” and everything attached to it (registrations, teams, scores, check-ins) will be permanently removed. This cannot be undone.` : ''}
        confirmLabel="Delete event"
        onCancel={() => setEventToDelete(null)}
        onConfirm={confirmDelete}
      />

      <div style={{ display: 'grid', gap: 22 }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section style={heroStyle}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px 260px at 85% -10%, rgba(56,189,248,0.35), transparent 70%), radial-gradient(500px 240px at 0% 120%, rgba(37,99,235,0.45), transparent 70%)', pointerEvents: 'none' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent)' }} />

          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 0, flex: '1 1 380px' }}>
              <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: maintenanceEnabled ? '#fbbf24' : '#34d399', boxShadow: `0 0 0 4px ${maintenanceEnabled ? 'rgba(251,191,36,0.25)' : 'rgba(52,211,153,0.25)'}` }} />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <h2 style={{ margin: '10px 0 6px', fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                {greeting()}, {firstName}
              </h2>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: 15, lineHeight: 1.5 }}>
                {stats.live > 0
                  ? <><strong style={{ color: '#ffffff' }}>{stats.live} event{stats.live === 1 ? ' is' : 's are'} live</strong> right now across FairPlay.</>
                  : <>No events are live right now. <strong style={{ color: '#ffffff' }}>{stats.upcoming}</strong> coming up.</>}
                {attention.length > 0 && <> {attention.length} thing{attention.length === 1 ? ' needs' : 's need'} your attention.</>}
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
                <HealthChip ok={!maintenanceEnabled} icon="bi bi-hdd-network" label={maintenanceEnabled ? 'Maintenance on' : 'All systems open'} to="/admin/settings" />
                <HealthChip ok={aiEnabled} icon="bi bi-stars" label={aiEnabled ? 'AI features on' : 'AI features off'} to="/admin/settings" />
                <HealthChip
                  ok={backupKnown && Date.now() - new Date(lastBackup.created_at).getTime() <= 4 * 86400000}
                  icon="bi bi-cloud-check"
                  label={lastBackup === undefined ? 'Checking backups…'
                    : lastBackup === 'unavailable' ? 'Backups'
                      : lastBackup ? `Backed up ${formatRelative(lastBackup.created_at)}` : 'No backup yet'}
                  to="/admin/backup"
                />
                <HealthChip ok={openFlags.length === 0} icon="bi bi-shield-check" label={openFlags.length ? `${openFlags.length} open flag${openFlags.length === 1 ? '' : 's'}` : 'No open flags'} to="/admin/ai-monitor" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/admin/users" style={heroButtonStyle(true)}><i className="bi bi-person-plus" /> Add organizer</Link>
              <Link to="/admin/reports" style={heroButtonStyle(false)}><i className="bi bi-file-earmark-bar-graph" /> Reports</Link>
              <Link to="/admin/backup" style={heroButtonStyle(false)}><i className="bi bi-cloud-arrow-up" /> Backup</Link>
            </div>
          </div>
        </section>

        {/* ── KPIs with 14-day trend ───────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
          <KpiCard icon="bi bi-people" label="User accounts" value={stats.users} trend={trends.users} unit="new account"
            detail={`${stats.organizers} organizers · ${stats.judgeAccounts} judges · ${stats.participantAccounts} participants`} to="/admin/users" />
          <KpiCard icon="bi bi-calendar-event" label="Events" value={stats.events} trend={trends.events} unit="event created"
            detail={`${stats.live} live · ${stats.upcoming} upcoming · ${stats.completed} completed`} to="/admin/reports" />
          <KpiCard icon="bi bi-clipboard-check" label="Registrations" value={stats.registrations} trend={trends.registrations} unit="registration"
            detail={`${stats.participants} in events · ${stats.checkIns} checked in`} to="/admin/reports" />
          <KpiCard icon="bi bi-trophy" label="Scores submitted" value={stats.scores} trend={trends.scores} unit="score"
            detail={`${stats.scoredEvents} event${stats.scoredEvents === 1 ? '' : 's'} scored · ${stats.judges} judges`} to="/admin/reports" />
        </div>

        {/* ── Attention + Activity ─────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
          <Panel style={{ flex: '1 1 380px' }} icon="bi bi-bell" title="Needs your attention"
            badge={attention.length ? <span style={{ ...pillStyle, background: '#fef3c7', color: '#b45309' }}>{attention.length}</span> : null}>
            {attention.length === 0 ? (
              <div style={{ padding: '26px 0', textAlign: 'center' }}>
                <span style={{ width: 52, height: 52, borderRadius: 16, background: '#ecfdf5', color: '#10b981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}><i className="bi bi-check2-all" /></span>
                <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 10 }}>You’re all caught up</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Nothing is waiting on you right now.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {attention.map((item) => <AttentionRow key={item.key} item={item} />)}
              </div>
            )}
          </Panel>

          <Panel style={{ flex: '1 1 380px' }} icon="bi bi-activity" title="Live activity"
            action={<Link to="/admin/audit" style={linkStyle}>Audit log <i className="bi bi-arrow-right" /></Link>}>
            {activity === null ? (
              <div style={{ padding: '26px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading activity…</div>
            ) : activity.length === 0 ? (
              <div style={{ padding: '26px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <i className="bi bi-clock-history" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                New creates, edits, and deletes will show up here.
              </div>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
                {activity.map((row) => {
                  const theme = AUDIT_ICONS[row.action] || AUDIT_ICONS.update;
                  const actor = row.actor_id ? usersById.get(String(row.actor_id))?.name || row.actor_email || 'Someone' : 'System';
                  return (
                    <li key={row.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 4px' }}>
                      <span style={{ width: 30, height: 30, borderRadius: 10, background: theme.bg, color: theme.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}><i className={theme.icon} /></span>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#475569', lineHeight: 1.45 }}>
                        <strong style={{ color: '#0f172a' }}>{actor}</strong> {AUDIT_VERBS[row.action] || 'changed'} {AUDIT_TABLE_LABELS[row.table_name] || 'a record'}
                        {row.summary ? <> <span style={{ color: '#0f172a', fontWeight: 600 }}>“{row.summary}”</span></> : null}
                      </div>
                      <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }} title={new Date(row.occurred_at).toLocaleString()}>{formatRelative(row.occurred_at)}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        {/* ── Events ───────────────────────────────────────────── */}
        <section style={cardStyle}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '18px 22px', borderBottom: '1px solid #eef2f7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={panelIconStyle}><i className="bi bi-calendar-week" /></span>
              <div>
                <h2 style={panelTitleStyle}>All events</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Every organizer’s events across the platform</p>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event, organizer, venue" aria-label="Search events" style={{ ...fieldStyle, width: 260, paddingLeft: 32 }} />
            </div>
          </header>

          <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 22px', borderBottom: '1px solid #eef2f7' }}>
            {STATUS_FILTERS.map(([value, label]) => {
              const active = filter === value;
              const count = value === 'all' ? events.length
                : value === 'live' ? stats.live
                  : events.filter((e) => e.status === value).length;
              if (value !== 'all' && count === 0 && !active) return null;
              return (
                <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setFilter(value)}
                  style={{ padding: '6px 13px', borderRadius: 999, border: active ? '1px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#2563eb' : '#ffffff', color: active ? '#ffffff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {label} · {count}
                </button>
              );
            })}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {['Event', 'Status', 'Participants', 'Activity', 'Date', ''].map((header, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: i === 5 ? 'right' : 'left' }}>{header || <span style={srOnly}>Actions</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '44px 16px', textAlign: 'center', color: '#94a3b8' }}>
                      <i className={search || filter !== 'all' ? 'bi bi-search' : 'bi bi-calendar-x'} style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                      <div style={{ fontWeight: 700, color: '#475569' }}>{search || filter !== 'all' ? 'No events match' : 'No events yet'}</div>
                    </td>
                  </tr>
                ) : paginatedEvents.map((event) => {
                  const status = EVENT_STATUS[event.status] || { label: titleCase(event.status || 'draft'), bg: '#f1f5f9', fg: '#475569' };
                  const participants = Number(event.participants || event.contestants?.length || 0);
                  const max = Number(event.maxParticipants) || 0;
                  const pct = max ? Math.min(100, Math.round((participants / max) * 100)) : null;
                  const id = String(event.id);
                  const organizer = organizerNames.get(String(event.organizerEmail || '').toLowerCase()) || event.organizerEmail;
                  return (
                    <tr key={event.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, minWidth: 280 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <img
                            src={getEventImage(event)}
                            alt=""
                            style={{ width: 64, height: 46, borderRadius: 10, objectFit: 'cover', background: '#f1f5f9', flexShrink: 0 }}
                            onError={(e) => { e.currentTarget.src = FALLBACK_IMAGES.default; }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{event.title}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {[titleCase(event.type || event.eventType), organizer ? `by ${organizer}` : null].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}><span style={{ ...pillStyle, background: status.bg, color: status.fg }}>{status.label}</span></td>
                      <td style={{ ...tdStyle, minWidth: 150 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><strong style={{ color: '#0f172a' }}>{participants}</strong>{max ? ` / ${max}` : ''}</span>
                          <span style={{ color: '#94a3b8' }}>{pct === null ? 'no limit' : `${pct}%`}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: '#eef2f7', overflow: 'hidden' }}>
                          <div style={{ width: `${pct === null ? (participants ? 100 : 0) : pct}%`, height: '100%', borderRadius: 999, background: pct === null ? '#93c5fd' : '#2563eb' }} />
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <MiniStat icon="bi bi-clipboard-check" value={regsByEvent.get(id) || 0} label="registrations" />
                          <MiniStat icon="bi bi-trophy" value={scoresByEvent.get(id) || 0} label="scores" />
                          <MiniStat icon="bi bi-qr-code-scan" value={checkInsByEvent.get(id) || 0} label="check-ins" />
                        </div>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(event.startDate || event.scheduledDate)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" onClick={() => navigate(`/events/${event.id}`)} style={iconButtonStyle} aria-label={`View ${event.title}`} title="View public page"><i className="bi bi-box-arrow-up-right" /></button>
                          <button type="button" onClick={() => navigate(`/events/${event.id}/leaderboard`)} style={iconButtonStyle} aria-label={`${event.title} leaderboard`} title="Leaderboard"><i className="bi bi-bar-chart" /></button>
                          <button type="button" onClick={() => setEventToDelete(event)} style={{ ...iconButtonStyle, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }} aria-label={`Delete ${event.title}`} title="Delete event"><i className="bi bi-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredEvents.length > 0 && (
            <div style={{ padding: '0 22px 16px' }}>
              <PaginationControls
                page={currentEventPage}
                totalPages={totalEventPages}
                limit={eventLimit}
                totalItems={filteredEvents.length}
                onPageChange={setEventPage}
                onLimitChange={setEventLimit}
                pageSizes={[5, 10, 20]}
              />
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function HealthChip({ ok, icon, label, to }) {
  return (
    <Link to={to} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#e2e8f0', fontSize: 12, fontWeight: 600, textDecoration: 'none', backdropFilter: 'blur(6px)' }}>
      <i className={icon} style={{ color: ok ? '#34d399' : '#fbbf24' }} />
      {label}
    </Link>
  );
}

// 14 thin daily bars; the value and date of each bar show on hover.
function KpiCard({ icon, label, value, trend, unit, detail, to }) {
  const max = Math.max(1, ...trend.map((d) => d.count));
  const recent = trend.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const previous = trend.slice(0, 7).reduce((sum, d) => sum + d.count, 0);
  const delta = recent - previous;
  return (
    <Link to={to} style={{ ...cardStyle, padding: 18, display: 'grid', gap: 12, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{label}</span>
        <span style={panelIconStyle}><i className={icon} /></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em' }}>{value.toLocaleString()}</div>
          <div style={{ fontSize: 12, marginTop: 6, fontWeight: 700, color: recent === 0 ? '#94a3b8' : delta >= 0 ? '#15803d' : '#b45309' }}>
            {recent === 0 ? 'None this week' : <><i className={delta >= 0 ? 'bi bi-arrow-up-right' : 'bi bi-arrow-down-right'} /> {recent} this week</>}
          </div>
        </div>
        <div role="img" aria-label={`${trend.reduce((s, d) => s + d.count, 0)} in the last ${TREND_DAYS} days`} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, flex: '0 1 120px' }}>
          {trend.map((d, i) => (
            <span
              key={d.day.toISOString()}
              title={`${d.day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${d.count} ${unit}${d.count === 1 ? '' : 's'}`}
              style={{ flex: 1, minWidth: 3, height: `${Math.max(8, (d.count / max) * 100)}%`, borderRadius: 3, background: d.count === 0 ? '#e2e8f0' : i >= TREND_DAYS - 7 ? '#2563eb' : '#93c5fd' }}
            />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>{detail}</div>
    </Link>
  );
}

const ATTENTION_TONES = {
  warning: { bg: '#fffbeb', border: '#fde68a', fg: '#b45309' },
  danger: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
  info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
};

function AttentionRow({ item }) {
  const tone = ATTENTION_TONES[item.tone] || ATTENTION_TONES.info;
  return (
    <Link to={item.to} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: tone.bg, border: `1px solid ${tone.border}`, textDecoration: 'none' }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: '#ffffff', color: tone.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}><i className={item.icon} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{item.title}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{item.text}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: tone.fg, whiteSpace: 'nowrap' }}>{item.cta} <i className="bi bi-arrow-right" /></span>
    </Link>
  );
}

function Panel({ icon, title, badge, action, children, style }) {
  return (
    <section style={{ ...cardStyle, ...style }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #eef2f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={panelIconStyle}><i className={icon} /></span>
          <h2 style={panelTitleStyle}>{title}</h2>
          {badge}
        </div>
        {action}
      </header>
      <div style={{ padding: '14px 20px 18px' }}>{children}</div>
    </section>
  );
}

function MiniStat({ icon, value, label }) {
  return (
    <span title={`${value} ${label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 8, background: value ? '#f1f5f9' : '#f8fafc', color: value ? '#334155' : '#94a3b8', fontSize: 12, fontWeight: 700 }}>
      <i className={icon} /> {value}
    </span>
  );
}

const heroStyle = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: 24,
  padding: 'clamp(22px, 3vw, 34px)',
  background: 'linear-gradient(135deg, #0b1b3f 0%, #0f2a5f 55%, #1e3a8a 100%)',
  boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
};

function heroButtonStyle(primary) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '11px 16px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    background: primary ? '#ffffff' : 'rgba(255,255,255,0.08)',
    color: primary ? '#1d4ed8' : '#ffffff',
    border: primary ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.18)',
    boxShadow: primary ? '0 10px 24px rgba(0,0,0,0.2)' : 'none',
  };
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const panelIconStyle = { width: 36, height: 36, borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 };
const panelTitleStyle = { margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' };
const pillStyle = { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const linkStyle = { fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' };
const fieldStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const thStyle = { padding: '12px 16px', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #e2e8f0', background: '#fbfcfe' };
const tdStyle = { padding: '14px 16px', fontSize: 13, color: '#475569', verticalAlign: 'middle' };
const iconButtonStyle = { width: 34, height: 34, borderRadius: 9, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

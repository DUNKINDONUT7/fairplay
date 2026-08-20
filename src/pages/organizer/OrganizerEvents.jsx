import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import { getBusinessActorId, matchesActorIdentity } from '../../utils/identity';

const statusConfig = {
  all: { label: 'All', color: '#2563eb', tone: 'rgba(37,99,235,0.10)' },
  draft: { label: 'Draft', color: '#b45309', tone: 'rgba(245,158,11,0.14)' },
  active: { label: 'Ongoing', color: '#0f766e', tone: 'rgba(20,184,166,0.14)' },
  ongoing: { label: 'Ongoing', color: '#0f766e', tone: 'rgba(20,184,166,0.14)' },
  upcoming: { label: 'Upcoming', color: '#0369a1', tone: 'rgba(14,165,233,0.14)' },
  completed: { label: 'Completed', color: '#475569', tone: 'rgba(148,163,184,0.18)' },
  approved: { label: 'Approved', color: '#2563eb', tone: 'rgba(37,99,235,0.10)' },
  archived: { label: 'Archived', color: '#7c3aed', tone: 'rgba(124,58,237,0.12)' },
  rejected: { label: 'Rejected', color: '#b91c1c', tone: 'rgba(239,68,68,0.12)' },
};

const filterTabs = [
  { key: 'all', label: 'All Events' },
  { key: 'draft', label: 'Drafts' },
  { key: 'active', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'soonest', label: 'Soonest date' },
  { value: 'title', label: 'Title A-Z' },
  { value: 'participants', label: 'Most participants' },
  { value: 'status', label: 'Status' },
];

function getStatusMeta(status) {
  return statusConfig[status] || { label: status || 'Unknown', color: '#334155', tone: 'rgba(148,163,184,0.18)' };
}

function formatEventDate(event) {
  const startRaw = event.startDate || event.start_date;
  const endRaw = event.endDate || event.end_date;
  if (!startRaw) return 'Schedule to be announced';

  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return 'Schedule to be announced';

  const end = endRaw ? new Date(endRaw) : null;
  const hasValidEnd = end && !Number.isNaN(end.getTime());
  const sameDay = hasValidEnd && start.toDateString() === end.toDateString();
  const startHasTime = /T|\d{1,2}:\d{2}/.test(String(startRaw));
  const endHasTime = /T|\d{1,2}:\d{2}/.test(String(endRaw || ''));

  if (hasValidEnd && sameDay && startHasTime && endHasTime) {
    return `${format(start, 'MMMM d, yyyy')} \u2022 ${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  }

  if (hasValidEnd && sameDay) {
    return `${format(start, 'MMMM d, yyyy')} \u2022 All day`;
  }

  if (hasValidEnd) {
    return `${format(start, 'MMMM d, yyyy')} - ${format(end, 'MMMM d, yyyy')}`;
  }

  if (startHasTime) {
    return `${format(start, 'MMMM d, yyyy')} \u2022 ${format(start, 'h:mm a')}`;
  }

  return `${format(start, 'MMMM d, yyyy')} \u2022 All day`;
}

function deriveCategory(event) {
  return event.category || event.eventType || event.type || 'general';
}

function hasBracket(event) {
  return (
    event.competitionMode === 'tournament' ||
    event.type === 'tournament' ||
    event.eventType === 'tournament' ||
    Boolean(event.bracketId) ||
    Boolean(event.bracketGenerated) ||
    (Array.isArray(event.subEvents) && event.subEvents.some((item) => item?.tournamentFormat || item?.format === 'tournament'))
  );
}

function bracketLabel(event) {
  if (hasBracket(event)) {
    return event.bracketType ? `${event.bracketType} bracket` : 'Bracket ready';
  }
  return 'No bracket';
}

function eventParticipantCount(event) {
  const contestantCount = Array.isArray(event.contestants) ? event.contestants.length : 0;
  return Number(event.participants || contestantCount || 0);
}

function computeSetupProgress(event) {
  const checks = [
    Boolean(event.title),
    Boolean(event.description),
    Boolean(event.startDate || event.start_date),
    Boolean(event.endDate || event.end_date),
    Boolean(event.location),
    Boolean(deriveCategory(event)),
    eventParticipantCount(event) > 0,
    Array.isArray(event.judges) ? event.judges.length > 0 : false,
  ];

  if (hasBracket(event)) {
    checks.push(Boolean(event.bracketType || event.tournamentFormat));
  }

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function clampDescription(text) {
  if (!text) return 'No description available yet. Add a brief overview to help your team prepare.';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function summarizeEvent(event) {
  const status = event.status || 'draft';
  const normalizedStatus = status === 'ongoing' ? 'active' : status;
  return {
    ...event,
    categoryLabel: String(deriveCategory(event)).replace(/[-_]/g, ' '),
    participantCount: eventParticipantCount(event),
    hasBracket: hasBracket(event),
    bracketStatus: bracketLabel(event),
    scheduleText: formatEventDate(event),
    progress: computeSetupProgress(event),
    shortDescription: clampDescription(event.description),
    statusKey: normalizedStatus,
    statusMeta: getStatusMeta(normalizedStatus),
    venueText: event.location || 'Venue to be confirmed',
    updatedAtValue: new Date(event.createdAt || event.created_at || event.startDate || 0).getTime() || 0,
    startValue: new Date(event.startDate || event.start_date || event.createdAt || 0).getTime() || 0,
  };
}

function FieldChip({ children, color = '#2563eb', tone = 'rgba(37,99,235,0.10)', icon }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        background: tone,
        color,
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'capitalize',
      }}
    >
      {icon ? <i className={icon} style={{ fontSize: 12 }} /> : null}
      {children}
    </span>
  );
}

function StatCard({ label, value, icon, color, tone, helper }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid rgba(191,219,254,0.72)',
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 18px 40px rgba(37,99,235,0.08)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>{label}</span>
        <span
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: tone,
            color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
          }}
        >
          <i className={icon} />
        </span>
      </div>
      <div style={{ fontSize: 32, color: '#0f172a', fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{helper}</div>
    </div>
  );
}

function LoadingSkeleton() {
  const pulse = {
    background: 'linear-gradient(90deg, rgba(226,232,240,0.72) 25%, rgba(241,245,249,1) 50%, rgba(226,232,240,0.72) 75%)',
    backgroundSize: '220% 100%',
    animation: 'organizerEventsSkeleton 1.5s ease-in-out infinite',
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} style={{ background: '#ffffff', borderRadius: 20, border: '1px solid #dbeafe', padding: 20, boxShadow: '0 18px 40px rgba(37,99,235,0.08)' }}>
            <div style={{ ...pulse, height: 14, width: '48%', borderRadius: 999, marginBottom: 18 }} />
            <div style={{ ...pulse, height: 32, width: '38%', borderRadius: 10, marginBottom: 12 }} />
            <div style={{ ...pulse, height: 12, width: '76%', borderRadius: 999 }} />
          </div>
        ))}
      </div>

      <div style={{ background: '#ffffff', borderRadius: 24, border: '1px solid #dbeafe', padding: 22, boxShadow: '0 18px 40px rgba(37,99,235,0.08)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) repeat(3, minmax(150px, 1fr)) minmax(120px, 0.8fr)', gap: 12, marginBottom: 18 }}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} style={{ ...pulse, height: 42, borderRadius: 14 }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} style={{ background: '#f8fbff', borderRadius: 22, border: '1px solid #dbeafe', padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...pulse, height: 20, width: '68%', borderRadius: 10, marginBottom: 10 }} />
                  <div style={{ ...pulse, height: 12, width: '92%', borderRadius: 999, marginBottom: 8 }} />
                  <div style={{ ...pulse, height: 12, width: '74%', borderRadius: 999 }} />
                </div>
                <div style={{ ...pulse, width: 42, height: 42, borderRadius: 14, flex: '0 0 auto' }} />
              </div>
              <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                {Array.from({ length: 4 }).map((__, lineIndex) => (
                  <div key={lineIndex} style={{ ...pulse, height: 14, width: `${90 - lineIndex * 10}%`, borderRadius: 999 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ ...pulse, width: 86, height: 28, borderRadius: 999 }} />
                <div style={{ ...pulse, width: 96, height: 28, borderRadius: 999 }} />
              </div>
              <div style={{ ...pulse, height: 10, width: '100%', borderRadius: 999, marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ ...pulse, height: 42, flex: 1, borderRadius: 14 }} />
                <div style={{ ...pulse, height: 42, flex: 1, borderRadius: 14 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes organizerEventsSkeleton {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid rgba(239,68,68,0.20)',
        borderRadius: 24,
        padding: '44px 28px',
        textAlign: 'center',
        boxShadow: '0 22px 44px rgba(239,68,68,0.08)',
      }}
    >
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'rgba(239,68,68,0.10)', color: '#dc2626', display: 'grid', placeItems: 'center', margin: '0 auto 18px', fontSize: 30 }}>
        <i className="bi bi-database-exclamation" />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>We could not load your events</h2>
      <p style={{ color: '#64748b', maxWidth: 560, margin: '0 auto 20px' }}>
        {error || 'A database issue interrupted the dashboard. Please try again to re-sync your event records.'}
      </p>
      <button
        onClick={onRetry}
        style={{
          padding: '12px 18px',
          borderRadius: 14,
          border: 'none',
          background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 14px 32px rgba(37,99,235,0.20)',
        }}
      >
        Retry Loading
      </button>
    </div>
  );
}

function EmptyState({ filtered, onCreate, onClear }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px dashed #bfdbfe',
        borderRadius: 24,
        padding: '52px 24px',
        textAlign: 'center',
        boxShadow: '0 20px 44px rgba(37,99,235,0.06)',
      }}
    >
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'rgba(37,99,235,0.10)', color: '#2563eb', display: 'grid', placeItems: 'center', margin: '0 auto 18px', fontSize: 30 }}>
        <i className={`bi ${filtered ? 'bi bi-search' : 'bi bi-calendar2-plus'}`} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
        {filtered ? 'No events match your filters' : 'No events created yet'}
      </h2>
      <p style={{ color: '#64748b', maxWidth: 580, margin: '0 auto 20px' }}>
        {filtered
          ? 'Try a different search, status tab, category, or sort option to surface the event you need.'
          : 'Create your first academic event to start managing schedules, participants, scoring, and brackets from one dashboard.'}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onCreate}
          style={{
            padding: '12px 18px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Create New Event
        </button>
        {filtered ? (
          <button
            onClick={onClear}
            style={{
              padding: '12px 18px',
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function OrganizerEvents() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents, createEvent, updateEvent, deleteEvent, loading, error } = useEventStore();
  const { success, error: showError, info } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('card');
  const [activeMenuId, setActiveMenuId] = useState(null);

  useEffect(() => {
    if (!activeMenuId) return undefined;
    const onDocClick = (e) => {
      if (!e.target.closest('[data-event-menu]')) setActiveMenuId(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setActiveMenuId(null); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [activeMenuId]);
  const [busyAction, setBusyAction] = useState('');
  const [eventToDelete, setEventToDelete] = useState(null);
  const organizerBusinessId = getBusinessActorId(user);

  useEffect(() => {
    if (user?.id) {
      fetchEvents(user.id);
    }
  }, [fetchEvents, user?.id]);

  const organizerEvents = useMemo(
    () =>
      events
        .filter((event) =>
          String(event.organizer_id) === String(organizerBusinessId) ||
          matchesActorIdentity(event.organizerAuthProfileId, user) ||
          matchesActorIdentity(event.organizerEmail, user)
        )
        .map(summarizeEvent),
    [events, organizerBusinessId, user]
  );

  const categoryOptions = useMemo(() => {
    const unique = [...new Set(organizerEvents.map((event) => event.categoryLabel).filter(Boolean))];
    return ['all', ...unique.sort((a, b) => a.localeCompare(b))];
  }, [organizerEvents]);

  const stats = useMemo(() => {
    const total = organizerEvents.length;
    const drafts = organizerEvents.filter((event) => event.statusKey === 'draft').length;
    const ongoing = organizerEvents.filter((event) => event.statusKey === 'active').length;
    const completed = organizerEvents.filter((event) => event.statusKey === 'completed').length;
    const brackets = organizerEvents.filter((event) => event.hasBracket).length;

    return { total, drafts, ongoing, completed, brackets };
  }, [organizerEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const statusOrder = {
      draft: 1,
      upcoming: 2,
      active: 3,
      completed: 4,
      archived: 5,
      rejected: 6,
      approved: 7,
    };

    return organizerEvents
      .filter((event) => {
        if (statusFilter !== 'all' && event.statusKey !== statusFilter) return false;
        if (categoryFilter !== 'all' && event.categoryLabel !== categoryFilter) return false;

        if (!normalizedSearch) return true;

        return [event.title, event.shortDescription, event.venueText, event.categoryLabel, event.statusMeta.label]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'soonest':
            return a.startValue - b.startValue;
          case 'title':
            return a.title.localeCompare(b.title);
          case 'participants':
            return b.participantCount - a.participantCount;
          case 'status':
            return (statusOrder[a.statusKey] || 99) - (statusOrder[b.statusKey] || 99);
          case 'newest':
          default:
            return b.updatedAtValue - a.updatedAtValue;
        }
      });
  }, [organizerEvents, search, statusFilter, categoryFilter, sortBy]);

  const hasFilters = search.trim() || statusFilter !== 'all' || categoryFilter !== 'all' || sortBy !== 'newest';

  async function handleDuplicate(event) {
    try {
      setBusyAction(`duplicate-${event.id}`);
      const payload = {
        ...event,
        id: Date.now(),
        title: `${event.title} Copy`,
        status: 'draft',
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      delete payload.updatedAtValue;
      delete payload.startValue;
      delete payload.statusMeta;
      delete payload.statusKey;
      delete payload.categoryLabel;
      delete payload.shortDescription;
      delete payload.scheduleText;
      delete payload.venueText;
      delete payload.progress;
      delete payload.participantCount;
      delete payload.hasBracket;
      delete payload.bracketStatus;
      // A duplicated event is a fresh draft — it must not carry over the
      // old event's roster or access tokens (old judge/scorer QR links
      // would otherwise still work against the "new" event).
      payload.contestants = [];
      payload.judges = [];
      payload.scorerAssignments = [];
      payload.externalJudgeInvites = [];
      payload.judgeSessions = [];
      payload.participants = 0;
      payload.scoringActive = false;
      payload.audienceVotingOpen = false;
      payload.audienceQrToken = null;
      await createEvent(payload);
      success(`Duplicated "${event.title}" as a new draft.`);
    } catch (duplicateError) {
      showError(duplicateError.message || 'Unable to duplicate this event right now.');
    } finally {
      setBusyAction('');
      setActiveMenuId(null);
    }
  }

  async function handleTogglePublish(event) {
    try {
      setBusyAction(`publish-${event.id}`);
      const nextStatus = event.statusKey === 'draft' ? 'upcoming' : 'draft';
      await updateEvent(event.id, { status: nextStatus });
      success(nextStatus === 'upcoming' ? `Published "${event.title}".` : `Moved "${event.title}" back to draft.`);
    } catch (publishError) {
      showError(publishError.message || 'Unable to update publish status.');
    } finally {
      setBusyAction('');
      setActiveMenuId(null);
    }
  }

  async function handleArchive(event) {
    try {
      setBusyAction(`archive-${event.id}`);
      await updateEvent(event.id, { status: 'archived' });
      info(`Archived "${event.title}".`);
    } catch (archiveError) {
      showError(archiveError.message || 'Unable to archive this event.');
    } finally {
      setBusyAction('');
      setActiveMenuId(null);
    }
  }

  async function handleDelete(event) {
    try {
      setBusyAction(`delete-${event.id}`);
      await deleteEvent(event.id);
      success(`Deleted "${event.title}".`);
    } catch (deleteError) {
      showError(deleteError.message || 'Unable to delete this event.');
    } finally {
      setBusyAction('');
      setActiveMenuId(null);
    }
  }

  async function handleRetry() {
    if (user?.id) {
      await fetchEvents(user.id);
    }
  }

  function resetFilters() {
    setSearch('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setSortBy('newest');
  }

  const pageShellStyle = {
    display: 'grid',
    gap: 22,
  };

  const panelStyle = {
    background: '#ffffff',
    border: '1px solid #dbeafe',
    borderRadius: 24,
    boxShadow: '0 20px 44px rgba(37,99,235,0.08)',
  };

  const iconButtonStyle = {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: '1px solid #dbeafe',
    background: '#ffffff',
    color: '#334155',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
  };

  const secondaryButtonStyle = {
    padding: '11px 16px',
    borderRadius: 14,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#334155',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  };

  const primaryButtonStyle = {
    padding: '11px 16px',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 14px 32px rgba(37,99,235,0.20)',
  };

  return (
    <DashboardLayout title="My Events" subtitle="Manage all your created events">
      <ConfirmDialog
        open={Boolean(eventToDelete)}
        title="Delete this event?"
        message={eventToDelete ? `"${eventToDelete.title}" and all of its contestants, scores, and certificates will be permanently deleted. This cannot be undone.` : ''}
        confirmLabel="Delete Event"
        onCancel={() => setEventToDelete(null)}
        onConfirm={() => {
          const target = eventToDelete;
          setEventToDelete(null);
          handleDelete(target);
        }}
      />
      <div style={pageShellStyle}>
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={handleRetry} />
        ) : (
          <>
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                ...panelStyle,
                padding: 24,
                background: 'radial-gradient(circle at top right, rgba(125,211,252,0.20), transparent 28%), linear-gradient(135deg, #f8fbff 0%, #eff6ff 56%, #f7fbff 100%)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ maxWidth: 700 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.82)', color: '#2563eb', fontSize: 12, fontWeight: 800, marginBottom: 14 }}>
                    <i className="bi bi-kanban" />
                    Event Management Dashboard
                  </div>
                  <h2 style={{ fontSize: 30, lineHeight: 1.1, color: '#0f172a', fontWeight: 900, marginBottom: 10 }}>
                    Oversee academic events with a cleaner, more actionable workspace.
                  </h2>
                  <p style={{ color: '#475569', fontSize: 14, maxWidth: 620, marginBottom: 0 }}>
                    Review event health, track setup completion, jump into brackets, and manage every lifecycle stage from one professional dashboard view.
                  </p>
                </div>

                <button
                  onClick={() => navigate('/organizer/create-event')}
                  style={{
                    ...primaryButtonStyle,
                    padding: '14px 20px',
                    alignSelf: 'center',
                  }}
                >
                  <i className="bi bi-plus-circle" />
                  Create New Event
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <StatCard label="Total Events" value={stats.total} icon="bi bi-calendar-event" color="#1d4ed8" tone="rgba(37,99,235,0.12)" helper="All events under your account" />
                <StatCard label="Draft Events" value={stats.drafts} icon="bi bi-pencil-square" color="#b45309" tone="rgba(245,158,11,0.14)" helper="Still being prepared" />
                <StatCard label="Ongoing Events" value={stats.ongoing} icon="bi bi-broadcast" color="#0f766e" tone="rgba(20,184,166,0.14)" helper="Currently active or live" />
                <StatCard label="Completed Events" value={stats.completed} icon="bi bi-check2-circle" color="#475569" tone="rgba(148,163,184,0.18)" helper="Closed and finalized" />
                <StatCard label="Events with Bracket" value={stats.brackets} icon="bi bi-diagram-3" color="#0369a1" tone="rgba(14,165,233,0.14)" helper="Tournament-ready events" />
              </div>
            </motion.section>

            <section style={{ ...panelStyle, padding: 22 }}>
              <div style={{ display: 'grid', gap: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0, position: 'relative' }}>
                    <i className="bi bi-search" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search event title, category, venue, or description"
                      style={{
                        width: '100%',
                        padding: '13px 16px 13px 42px',
                        borderRadius: 16,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
                      <button
                        onClick={() => setViewMode('card')}
                        style={{
                          ...iconButtonStyle,
                          width: 44,
                          height: 36,
                          border: 'none',
                          background: viewMode === 'card' ? '#2563eb' : 'transparent',
                          color: viewMode === 'card' ? '#ffffff' : '#475569',
                        }}
                        title="Card View"
                      >
                        <i className="bi bi-grid-3x3-gap-fill" />
                      </button>
                      <button
                        onClick={() => setViewMode('table')}
                        style={{
                          ...iconButtonStyle,
                          width: 44,
                          height: 36,
                          border: 'none',
                          background: viewMode === 'table' ? '#2563eb' : 'transparent',
                          color: viewMode === 'table' ? '#ffffff' : '#475569',
                        }}
                        title="Table View"
                      >
                        <i className="bi bi-table" />
                      </button>
                    </div>

                    {hasFilters ? (
                      <button onClick={resetFilters} style={secondaryButtonStyle}>
                        <i className="bi bi-arrow-counterclockwise" />
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {filterTabs.map((tab) => {
                      const active = statusFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setStatusFilter(tab.key)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 999,
                            border: active ? '1px solid transparent' : '1px solid #dbeafe',
                            background: active ? 'linear-gradient(135deg, #2563eb, #0ea5e9)' : '#ffffff',
                            color: active ? '#ffffff' : '#334155',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: active ? '0 10px 24px rgba(37,99,235,0.16)' : 'none',
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                      style={{
                        padding: '11px 14px',
                        borderRadius: 14,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: 14,
                        outline: 'none',
                        minWidth: 170,
                      }}
                    >
                      {categoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === 'all' ? 'All Categories' : option}
                        </option>
                      ))}
                    </select>

                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value)}
                      style={{
                        padding: '11px 14px',
                        borderRadius: 14,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: 14,
                        outline: 'none',
                        minWidth: 160,
                      }}
                    >
                      {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {filteredEvents.length === 0 ? (
              <EmptyState
                filtered={Boolean(hasFilters)}
                onCreate={() => navigate('/organizer/create-event')}
                onClear={resetFilters}
              />
            ) : viewMode === 'card' ? (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
                {filteredEvents.map((event, index) => (
                  <motion.article
                    key={event.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #dbeafe',
                      borderRadius: 24,
                      padding: 22,
                      boxShadow: '0 20px 44px rgba(37,99,235,0.08)',
                      display: 'grid',
                      gap: 18,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                          <FieldChip color="#1d4ed8" tone="rgba(37,99,235,0.10)" icon="bi bi-tag">
                            {event.categoryLabel}
                          </FieldChip>
                          <FieldChip color={event.statusMeta.color} tone={event.statusMeta.tone} icon="bi bi-circle-fill">
                            {event.statusMeta.label}
                          </FieldChip>
                        </div>
                        <h3 style={{ fontSize: 22, lineHeight: 1.15, color: '#0f172a', fontWeight: 800, marginBottom: 8 }}>
                          {event.title}
                        </h3>
                        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 0 }}>{event.shortDescription}</p>
                      </div>

                      <div style={{ position: 'relative', flex: '0 0 auto' }} data-event-menu>
                        <button
                          onClick={() => setActiveMenuId((current) => (current === event.id ? null : event.id))}
                          style={iconButtonStyle}
                          title="More actions"
                        >
                          <i className="bi bi-three-dots" />
                        </button>

                        {activeMenuId === event.id ? (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 50,
                              width: 188,
                              borderRadius: 16,
                              background: '#ffffff',
                              border: '1px solid #dbeafe',
                              boxShadow: '0 20px 40px rgba(15,23,42,0.14)',
                              padding: 8,
                              zIndex: 20,
                            }}
                          >
                            {[
                              { label: 'Edit', icon: 'bi bi-pencil-square', action: () => navigate(`/organizer/events/${event.id}`) },
                              { label: 'Duplicate', icon: 'bi bi-copy', action: () => handleDuplicate(event) },
                              { label: event.statusKey === 'draft' ? 'Publish' : 'Unpublish', icon: 'bi bi-send-check', action: () => handleTogglePublish(event) },
                              { label: 'Archive', icon: 'bi bi-archive', action: () => handleArchive(event) },
                              { label: 'Delete', icon: 'bi bi-trash3', action: () => { setActiveMenuId(null); setEventToDelete(event); }, danger: true },
                            ].map((item) => (
                              <button
                                key={item.label}
                                onClick={item.action}
                                disabled={Boolean(busyAction)}
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  background: 'transparent',
                                  borderRadius: 12,
                                  padding: '10px 12px',
                                  cursor: busyAction ? 'not-allowed' : 'pointer',
                                  color: item.danger ? '#dc2626' : '#334155',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  opacity: busyAction ? 0.6 : 1,
                                }}
                              >
                                <i className={item.icon} />
                                {item.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(37,99,235,0.10)', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                          <i className="bi bi-calendar2-week" />
                        </span>
                        <div>
                          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Date and time</div>
                          <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{event.scheduleText}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(14,165,233,0.10)', color: '#0284c7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                          <i className="bi bi-geo-alt" />
                        </span>
                        <div>
                          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Venue</div>
                          <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{event.venueText}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                      <div style={{ padding: 14, borderRadius: 18, background: '#f8fbff', border: '1px solid #e0ecff' }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Participants / Teams</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{event.participantCount}</div>
                      </div>
                      <div style={{ padding: 14, borderRadius: 18, background: '#f8fbff', border: '1px solid #e0ecff' }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Bracket Status</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: event.hasBracket ? '#0369a1' : '#64748b', textTransform: 'capitalize' }}>{event.bracketStatus}</div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>Setup progress</span>
                        <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 800 }}>{event.progress}%</span>
                      </div>
                      <div style={{ height: 10, borderRadius: 999, background: '#dbeafe', overflow: 'hidden' }}>
                        <div style={{ width: `${event.progress}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #38bdf8)', borderRadius: 999 }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => navigate(`/organizer/events/${event.id}`)} style={{ ...primaryButtonStyle, flex: '1 1 160px' }}>
                        <i className="bi bi-gear" />
                        Manage Event
                      </button>
                      <button onClick={() => navigate(`/organizer/scoring?eventId=${event.id}`)} style={{ ...secondaryButtonStyle, flex: '1 1 150px' }}>
                        <i className="bi bi-bar-chart-line" />
                        View Ranking
                      </button>
                      {event.hasBracket ? (
                        <button onClick={() => navigate(`/organizer/brackets?eventId=${event.id}`)} style={{ ...secondaryButtonStyle, flex: '1 1 150px', borderColor: '#bfdbfe', color: '#1d4ed8', background: '#eff6ff' }}>
                          <i className="bi bi-diagram-3" />
                          Open Bracket
                        </button>
                      ) : null}
                    </div>
                  </motion.article>
                ))}
              </section>
            ) : (
              <section style={{ ...panelStyle, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                    <thead>
                      <tr style={{ background: '#f8fbff' }}>
                        {['Event', 'Schedule', 'Venue', 'Category', 'Status', 'Participants', 'Bracket', 'Setup', 'Actions'].map((header) => (
                          <th
                            key={header}
                            style={{
                              textAlign: 'left',
                              padding: '16px 18px',
                              fontSize: 12,
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              borderBottom: '1px solid #dbeafe',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((event) => (
                        <tr key={event.id} style={{ borderBottom: '1px solid #eef2ff' }}>
                          <td style={{ padding: 18, verticalAlign: 'top' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{event.title}</div>
                            <div style={{ fontSize: 13, color: '#64748b', maxWidth: 280 }}>{event.shortDescription}</div>
                          </td>
                          <td style={{ padding: 18, verticalAlign: 'top', fontSize: 13, color: '#334155', minWidth: 180 }}>{event.scheduleText}</td>
                          <td style={{ padding: 18, verticalAlign: 'top', fontSize: 13, color: '#334155', minWidth: 160 }}>{event.venueText}</td>
                          <td style={{ padding: 18, verticalAlign: 'top' }}>
                            <FieldChip color="#1d4ed8" tone="rgba(37,99,235,0.10)">{event.categoryLabel}</FieldChip>
                          </td>
                          <td style={{ padding: 18, verticalAlign: 'top' }}>
                            <FieldChip color={event.statusMeta.color} tone={event.statusMeta.tone}>{event.statusMeta.label}</FieldChip>
                          </td>
                          <td style={{ padding: 18, verticalAlign: 'top', fontSize: 14, color: '#0f172a', fontWeight: 800 }}>{event.participantCount}</td>
                          <td style={{ padding: 18, verticalAlign: 'top', fontSize: 13, color: event.hasBracket ? '#0369a1' : '#64748b', fontWeight: 700, textTransform: 'capitalize' }}>{event.bracketStatus}</td>
                          <td style={{ padding: 18, verticalAlign: 'top', minWidth: 140 }}>
                            <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 800, marginBottom: 8 }}>{event.progress}%</div>
                            <div style={{ height: 8, borderRadius: 999, background: '#dbeafe', overflow: 'hidden' }}>
                              <div style={{ width: `${event.progress}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #38bdf8)' }} />
                            </div>
                          </td>
                          <td style={{ padding: 18, verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button onClick={() => navigate(`/organizer/events/${event.id}`)} style={{ ...primaryButtonStyle, padding: '10px 12px', borderRadius: 12, fontSize: 13 }}>
                                Manage
                              </button>
                              <button onClick={() => navigate(`/organizer/scoring?eventId=${event.id}`)} style={{ ...secondaryButtonStyle, padding: '10px 12px', borderRadius: 12, fontSize: 13 }}>
                                Ranking
                              </button>
                              {event.hasBracket ? (
                                <button onClick={() => navigate(`/organizer/brackets?eventId=${event.id}`)} style={{ ...secondaryButtonStyle, padding: '10px 12px', borderRadius: 12, fontSize: 13, borderColor: '#bfdbfe', color: '#1d4ed8', background: '#eff6ff' }}>
                                  Bracket
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

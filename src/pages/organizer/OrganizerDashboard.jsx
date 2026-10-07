import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import useTournamentStore from '../../store/tournamentStore';
import { composeEventReport } from '../../hooks/useEventReport';
import useTourStore from '../../store/tourStore';
import OrganizerGettingStarted from '../../components/onboarding/OrganizerGettingStarted';
import PaginationControls from '../../components/admin/PaginationControls';
import { EventStatusBadge } from '../../components/reports/reportShared';

// Per-account onboarding flags. Browser storage is fine here: losing them only
// means a new organizer sees the tour again, and the tour only ever starts for
// an account that has no events yet.
function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — onboarding just won't be remembered */
  }
}

export default function OrganizerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, deleteEvent, fetchEvents } = useEventStore();
  const { assignments: judgeAssignments, fetchJudges } = useJudgeStore();
  const { success } = useNotificationStore();
  const scores = useScoreStore((state) => state.scores);
  const fetchScores = useScoreStore((state) => state.fetchScores);
  const tournaments = useTournamentStore((state) => state.tournaments);
  const fetchTournaments = useTournamentStore((state) => state.fetchTournaments);
  const listRef = useRef(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const startTour = useTourStore((state) => state.start);
  const [onboarding, setOnboarding] = useState(false);

  const flagKey = (name) => `fairplay_org_${name}_${user?.id}`;

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setEventsLoaded(false);
    // Only a load that actually succeeded counts — a failed one also leaves
    // the list empty, which must not make an existing organizer look new.
    Promise.resolve(fetchEvents(user.id)).then(() => {
      if (!cancelled && !useEventStore.getState().error) setEventsLoaded(true);
    });
    fetchJudges({ silent: true });
    // The results card reads champions from these.
    fetchScores(undefined, { silent: true });
    fetchTournaments(undefined, { silent: true });
    return () => { cancelled = true; };
  }, [fetchEvents, fetchJudges, fetchScores, fetchTournaments, user?.id]);

  // A brand-new organizer (no events yet) gets the welcome tour once, and the
  // getting-started checklist until they hide it. Organizers who already had
  // events before this existed never see either.
  useEffect(() => {
    if (!eventsLoaded || !user?.id) return;
    const started = readFlag(flagKey('onboarding'));
    if (!started && events.length === 0) {
      writeFlag(flagKey('onboarding'), true);
      setOnboarding(true);
      if (!readFlag(flagKey('tour_seen'))) {
        writeFlag(flagKey('tour_seen'), true);
        startTour();
      }
      return;
    }
    setOnboarding(started && !readFlag(flagKey('checklist_hidden')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLoaded, user?.id]);

  const hideChecklist = () => {
    writeFlag(flagKey('checklist_hidden'), true);
    setOnboarding(false);
  };

  const analytics = useMemo(() => {
    const count = (...statuses) => events.filter((event) => statuses.includes(event.status)).length;
    const participants = events.reduce((sum, event) => sum + Number(event.participants || 0), 0);
    const capacity = events.reduce((sum, event) => sum + Number(event.maxParticipants || 0), 0);
    return {
      total: events.length,
      live: count('active'),
      upcoming: count('approved', 'upcoming'),
      completed: count('completed'),
      participants,
      capacity,
      fillRate: capacity > 0 ? Math.round((participants / capacity) * 100) : 0,
      busiest: [...events]
        .filter((event) => Number(event.participants || 0) > 0)
        .sort((a, b) => Number(b.participants || 0) - Number(a.participants || 0))
        .slice(0, 4),
    };
  }, [events]);

  // The event the organizer has to get ready for: one that is live right now,
  // otherwise the approved one with the nearest start date.
  const nextEvent = useMemo(() => {
    const byDate = (a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0);
    const live = events.filter((event) => event.status === 'active').sort(byDate)[0];
    if (live) return live;
    return events.filter((event) => ['approved', 'upcoming'].includes(event.status) && event.startDate).sort(byDate)[0] || null;
  }, [events]);

  // Only the statuses this organizer actually has events in get a tab.
  const statusTabs = useMemo(() => {
    const tabs = STATUS_TABS.map((tab) => ({
      ...tab,
      count: tab.value === 'all' ? events.length : events.filter((event) => tab.statuses.includes(event.status)).length,
    }));
    return tabs.filter((tab) => tab.value === 'all' || tab.count > 0 || tab.value === statusFilter);
  }, [events, statusFilter]);

  const term = search.trim().toLowerCase();
  const myEvents = useMemo(() => {
    const statuses = STATUS_TABS.find((tab) => tab.value === statusFilter)?.statuses;
    return events.filter((event) => {
      if (statuses && !statuses.includes(event.status)) return false;
      if (!term) return true;
      return [event.title, event.type, event.location].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [events, statusFilter, term]);

  // One slice per status that has events, always in the same colour.
  const statusBreakdown = useMemo(() => STATUS_TABS
    .filter((tab) => tab.statuses)
    .map((tab) => ({ value: tab.value, label: tab.label, color: tab.color, count: events.filter((event) => tab.statuses.includes(event.status)).length }))
    .filter((entry) => entry.count > 0), [events]);

  // Champions of the most recently finished events, from the same report the
  // Ranking page uses. A sports fest has one champion per sport, so it shows a count.
  const latestResults = useMemo(() => events
    .filter((event) => event.status === 'completed')
    .sort((a, b) => new Date(b.endDate || b.startDate || 0) - new Date(a.endDate || a.startDate || 0))
    .slice(0, 3)
    .map((event) => {
      const report = composeEventReport(event);
      const champions = report.tournament.brackets.filter((bracket) => bracket.champion);
      const champion = champions.length > 1
        ? `${champions.length} champions crowned`
        : champions[0]?.champion || report.ranked.find((participant) => participant.rank === 1)?.name || 'Results recorded';
      return { id: event.id, title: event.title, champion };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, scores, tournaments]);

  // Picking a status up top filters the list and brings it into view.
  const showInList = (filter) => {
    setStatusFilter(filter);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const headline = analytics.total === 0
    ? 'Create your first event to start collecting registrations and scores.'
    : analytics.live > 0
      ? `${analytics.live} event${analytics.live === 1 ? ' is' : 's are'} live right now, with ${analytics.participants} participants registered across your events.`
      : `You have ${analytics.upcoming} upcoming event${analytics.upcoming === 1 ? '' : 's'} and ${analytics.participants} participants registered across your events.`;

  const totalPages = Math.max(1, Math.ceil(myEvents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedEvents = myEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [statusFilter, term, pageSize]);

  const stats = [
    { label: 'Total events', value: analytics.total, icon: 'bi bi-calendar-event', filter: 'all', tone: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
    { label: 'Live now', value: analytics.live, icon: 'bi bi-broadcast', filter: 'active', tone: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
    { label: 'Upcoming', value: analytics.upcoming, icon: 'bi bi-clock-history', filter: 'approved', tone: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
    { label: 'Completed', value: analytics.completed, icon: 'bi bi-patch-check', filter: 'completed', tone: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  ];

  const firstName = String(user?.name || '').trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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
      {onboarding && (
        <OrganizerGettingStarted
          events={events}
          judgeAssignments={judgeAssignments}
          onReplayTour={startTour}
          onDismiss={hideChecklist}
        />
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        {/* Hero: greeting, the main actions, the next event, and the headline counts */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={heroStyle} data-tour="dash-hero">
          <div aria-hidden="true" style={{ position: 'absolute', right: -90, top: -110, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.35), transparent 65%)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', left: -70, bottom: -140, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,140,248,0.28), transparent 65%)' }} />

          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 24, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', color: '#bae6fd', fontSize: 12, fontWeight: 700 }}>
                <i className="bi bi-calendar3" /> {today}
              </span>
              <h2 style={{ margin: '14px 0 8px', fontSize: 'clamp(26px, 3vw, 36px)', lineHeight: 1.1, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
              </h2>
              <p style={{ margin: 0, fontSize: 15, color: '#cbd5e1', maxWidth: 520, lineHeight: 1.5 }}>{headline}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={() => navigate('/organizer/create-event')} style={heroPrimaryButtonStyle}>
                  <i className="bi bi-plus-circle-fill" /> Create Event
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={() => navigate('/organizer/events')} style={heroGhostButtonStyle}>
                  <i className="bi bi-kanban" /> Manage Events
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={startTour} style={{ ...heroGhostButtonStyle, borderColor: 'rgba(125,211,252,0.6)', color: '#bae6fd' }}>
                  <i className="bi bi-play-circle" /> Take the tour
                </motion.button>
              </div>
            </div>

            {/* Next event */}
            <div style={glassCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7dd3fc' }}>
                  {nextEvent?.status === 'active' ? 'Happening now' : 'Next event'}
                </span>
                {nextEvent && (
                  <span style={{ ...pillStyle, background: nextEvent.status === 'active' ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.12)', color: nextEvent.status === 'active' ? '#6ee7b7' : '#e0f2fe' }}>
                    {nextEvent.status === 'active' && <span style={liveDotStyle} />}
                    {nextEvent.status === 'active' ? 'Live' : describeCountdown(nextEvent.startDate)}
                  </span>
                )}
              </div>
              {nextEvent ? (
                <>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <DateTile value={nextEvent.startDate} large />
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#ffffff', overflowWrap: 'anywhere', minWidth: 0 }}>{nextEvent.title}</h3>
                  </div>
                  <div style={{ display: 'grid', gap: 7, fontSize: 13, color: '#cbd5e1' }}>
                    <div style={metaRowStyle}><i className="bi bi-geo-alt" style={heroMetaIconStyle} />{nextEvent.location || 'No venue set'}</div>
                    <div style={metaRowStyle}><i className="bi bi-people" style={heroMetaIconStyle} />{Number(nextEvent.participants || 0)}{nextEvent.maxParticipants ? ` of ${nextEvent.maxParticipants}` : ''} participants registered</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
                    <button type="button" onClick={() => navigate(`/organizer/events/${nextEvent.id}`)} style={{ ...heroPrimaryButtonStyle, padding: '10px 16px', fontSize: 13, boxShadow: 'none' }}>
                      Open event <i className="bi bi-arrow-right" />
                    </button>
                    <button type="button" onClick={() => navigate(`/organizer/scoring?eventId=${nextEvent.id}`)} style={{ ...heroGhostButtonStyle, padding: '10px 16px', fontSize: 13 }}>
                      <i className="bi bi-bar-chart-line" /> Scoring
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ margin: 'auto 0', color: '#cbd5e1', fontSize: 14, lineHeight: 1.5 }}>
                  <i className="bi bi-calendar2-plus" style={{ fontSize: 26, color: '#7dd3fc', display: 'block', marginBottom: 8 }} />
                  No upcoming event. An approved event will show up here with its date and venue.
                </div>
              )}
            </div>
          </div>

          {/* Counts — each one filters the list below */}
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12, marginTop: 24 }}>
            {stats.map((stat, index) => {
              const active = statusFilter === stat.filter;
              return (
                <motion.button
                  key={stat.label}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + index * 0.05 }}
                  whileHover={{ y: -3 }}
                  onClick={() => showInList(stat.filter)}
                  aria-pressed={active}
                  title={`Show ${stat.label.toLowerCase()} in the list`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, textAlign: 'left', cursor: 'pointer', background: active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)', border: active ? '1px solid #7dd3fc' : '1px solid rgba(255,255,255,0.12)' }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18, background: stat.tone, color: '#ffffff' }}>
                    <i className={stat.icon} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 26, fontWeight: 900, color: '#ffffff', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{stat.value}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{stat.label}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        <div data-tour="dash-insights" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20 }}>
          {/* Events by status */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel icon="bi bi-pie-chart">Events by status</SectionLabel>
            {statusBreakdown.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Your events will be counted here.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0, margin: '0 auto' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusBreakdown} dataKey="count" nameKey="label" innerRadius={52} outerRadius={76} paddingAngle={statusBreakdown.length > 1 ? 3 : 0} cornerRadius={4} stroke="#ffffff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                        {statusBreakdown.map((entry) => <Cell key={entry.value} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [`${value} event${value === 1 ? '' : 's'}`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{analytics.total}</span>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>events</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4, flex: '1 1 130px', minWidth: 0 }}>
                  {statusBreakdown.map((entry) => (
                    <button key={entry.value} type="button" onClick={() => showInList(entry.value)} title={`Show ${entry.label.toLowerCase()} events in the list`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, border: 'none', background: statusFilter === entry.value ? '#f1f5f9' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#334155' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: entry.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>{entry.label}</span>
                      <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{entry.count}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.section>

          {/* Registrations */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel icon="bi bi-people">Registrations</SectionLabel>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{analytics.participants}</span>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {analytics.capacity ? `of ${analytics.capacity} slots filled (${analytics.fillRate}%)` : 'participants registered'}
                </span>
              </div>
              {analytics.capacity > 0 && <ProgressBar percent={analytics.fillRate} label="All slots filled" />}
            </div>
            {analytics.busiest.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Nobody has registered yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {analytics.busiest.map((event) => {
                  const joined = Number(event.participants || 0);
                  const percent = event.maxParticipants ? Math.min(100, Math.round((joined / event.maxParticipants) * 100)) : 0;
                  return (
                    <div key={event.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                        <span style={{ color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                        <span style={{ color: '#475569', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{joined}{event.maxParticipants ? ` / ${event.maxParticipants}` : ''}</span>
                      </div>
                      {event.maxParticipants ? <ProgressBar percent={percent} label={`${event.title} slots filled`} thin /> : null}
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" onClick={() => navigate('/organizer/contestants')} style={{ ...secondaryButtonStyle, alignSelf: 'flex-start', marginTop: 'auto' }}>
              <i className="bi bi-people" /> Manage participants
            </button>
          </motion.section>

          {/* Latest results */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel icon="bi bi-trophy">Latest results</SectionLabel>
            {latestResults.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Champions of your finished events will be listed here.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {latestResults.map((result) => (
                  <button key={result.id} type="button" onClick={() => navigate(`/organizer/events/${result.id}/ranking`)} title="View the full ranking" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, border: '1px solid #fde68a', background: 'linear-gradient(135deg, #fffbeb, #ffffff)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18, background: '#fef3c7', color: '#b45309' }}>
                      <i className="bi bi-trophy-fill" />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.champion}</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</span>
                    </span>
                    <i className="bi bi-chevron-right" style={{ color: '#94a3b8', fontSize: 12 }} />
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => navigate('/organizer/reports')} style={{ ...secondaryButtonStyle, alignSelf: 'flex-start', marginTop: 'auto' }}>
              <i className="bi bi-file-earmark-text" /> All reports
            </button>
          </motion.section>
        </div>

        {/* My events */}
        <section ref={listRef} data-tour="dash-events" style={{ ...cardStyle, scrollMarginTop: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <SectionLabel icon="bi bi-calendar-week">My Events</SectionLabel>
            <div style={{ position: 'relative', flex: '0 1 280px', minWidth: 180 }}>
              <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, type, or venue"
                aria-label="Search events"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 34px', borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, outline: 'none' }}
              />
            </div>
          </div>

          <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
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

          {pagedEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <i className={events.length === 0 ? 'bi bi-calendar2-plus' : 'bi bi-search'} style={{ fontSize: 34, color: '#cbd5e1', display: 'block', marginBottom: 10 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>
                {events.length === 0 ? 'No events yet' : 'No events match your search or filter'}
              </p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                {events.length === 0 ? 'Create your first event to get started.' : 'Try another status or clear the search.'}
              </p>
              {events.length > 0 && (
                <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); }} style={{ ...secondaryButtonStyle, marginTop: 14 }}>
                  <i className="bi bi-x-lg" /> Clear filters
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {pagedEvents.map((event) => {
                const editable = EDITABLE_STATUSES.has(event.status);
                // A finished event keeps its locked results, so it can't be deleted from here.
                const deletable = event.status !== 'completed';
                return (
                  <motion.div
                    key={event.id}
                    whileHover={{ y: -2, boxShadow: '0 10px 24px rgba(37,99,235,0.10)', borderColor: '#bfdbfe' }}
                    transition={{ duration: 0.15 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 320px', minWidth: 0 }}>
                      <DateTile value={event.startDate} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', overflowWrap: 'anywhere' }}>{event.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 3 }}>
                          <span style={{ textTransform: 'capitalize' }}>{event.type || 'Event'}</span>
                          <span><i className="bi bi-geo-alt" /> {event.location || 'No venue set'}</span>
                          <span><i className="bi bi-people" /> {Number(event.participants || 0)}{event.maxParticipants ? ` / ${event.maxParticipants}` : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <EventStatusBadge status={event.status} />
                      <button type="button" onClick={() => navigate(`/organizer/events/${event.id}`)} style={{ ...secondaryButtonStyle, padding: '8px 14px' }}>
                        Open
                      </button>
                      <button type="button" onClick={() => navigate(`/organizer/scoring?eventId=${event.id}`)} aria-label={`Scoring for ${event.title}`} title="Scoring" style={iconButtonStyle}>
                        <i className="bi bi-bar-chart-line" />
                      </button>
                      {editable && (
                        <button type="button" onClick={() => navigate(`/organizer/events/${event.id}/edit`)} aria-label={`Edit ${event.title}`} title="Edit details" style={iconButtonStyle}>
                          <i className="bi bi-pencil-square" />
                        </button>
                      )}
                      {deletable && (
                        <button type="button" onClick={() => setEventToDelete(event)} aria-label={`Delete ${event.title}`} title="Delete" style={{ ...iconButtonStyle, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>
                          <i className="bi bi-trash3" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {myEvents.length > 0 && (
            <PaginationControls
              page={currentPage}
              totalPages={totalPages}
              limit={pageSize}
              totalItems={myEvents.length}
              onPageChange={setPage}
              onLimitChange={setPageSize}
              pageSizes={[5, 10, 25]}
            />
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

// Same statuses the Edit Details page accepts; after approval the details are locked.
const EDITABLE_STATUSES = new Set(['draft', 'upcoming', 'pending', 'rejected']);

const STATUS_TABS = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'active', label: 'Live', statuses: ['active'], color: '#0d9488' },
  { value: 'approved', label: 'Upcoming', statuses: ['approved', 'upcoming'], color: '#2563eb' },
  { value: 'completed', label: 'Completed', statuses: ['completed'], color: '#7c3aed' },
  { value: 'pending', label: 'Waiting for approval', statuses: ['pending'], color: '#d97706' },
  { value: 'draft', label: 'Draft', statuses: ['draft'], color: '#0284c7' },
  { value: 'rejected', label: 'Rejected', statuses: ['rejected'], color: '#e11d48' },
];

function describeCountdown(value) {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 'Date not set';
  const dayOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((dayOf(start) - dayOf(new Date())) / 86400000);
  if (days < 0) return 'Start date has passed';
  if (days === 0) return 'Starts today';
  if (days === 1) return 'Starts tomorrow';
  return `Starts in ${days} days`;
}

function SectionLabel({ icon, children }) {
  return (
    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
      <i className={icon} style={{ color: '#2563eb' }} />
      {children}
    </h3>
  );
}

// The event's start date as a small calendar leaf, so a list of events can be scanned by date.
function DateTile({ value, large = false }) {
  const date = value ? new Date(value) : null;
  const valid = date && !Number.isNaN(date.getTime());
  const size = large ? 64 : 50;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', border: '1px solid #dbeafe', color: '#1d4ed8', lineHeight: 1.1 }}>
      {valid ? (
        <>
          <span style={{ fontSize: large ? 11 : 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{date.toLocaleDateString('en-US', { month: 'short' })}</span>
          <span style={{ fontSize: large ? 24 : 18, fontWeight: 800, color: '#0f172a' }}>{date.getDate()}</span>
        </>
      ) : (
        <i className="bi bi-calendar-event" style={{ fontSize: large ? 22 : 18 }} />
      )}
    </span>
  );
}

function ProgressBar({ percent, label, thin = false }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} style={{ height: thin ? 6 : 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', marginTop: thin ? 6 : 10 }}>
      <div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: '#2563eb' }} />
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(15,23,42,0.05)' };
const secondaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const iconButtonStyle = { width: 36, height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#2563eb', cursor: 'pointer', fontSize: 14, display: 'inline-grid', placeItems: 'center' };
const pillStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 };
const metaRowStyle = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };
const heroStyle = { position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 'clamp(20px, 3vw, 32px)', background: 'linear-gradient(135deg, #0b1b3f 0%, #0f2a5f 55%, #1e3a8a 100%)', boxShadow: '0 24px 60px rgba(15,23,42,0.25)' };
const glassCardStyle = { display: 'flex', flexDirection: 'column', gap: 14, padding: 20, borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', minWidth: 0 };
const heroPrimaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, border: 'none', background: '#ffffff', color: '#1e3a8a', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 10px 26px rgba(2,6,23,0.3)' };
const heroGhostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.08)', color: '#ffffff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const heroMetaIconStyle = { color: '#7dd3fc', flexShrink: 0 };
const liveDotStyle = { width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 0 4px rgba(52,211,153,0.25)' };
const chartTooltipStyle = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' };

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useScoreStore from '../../store/scoreStore';
import useRegistrationStore from '../../store/registrationStore';
import useParticipantTourStore from '../../store/participantTourStore';

// Per-account onboarding flag. Browser storage is fine here: losing it only
// means a participant sees the tour again, and it only ever auto-starts for
// an account that has no registrations yet.
function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* storage unavailable — onboarding just won't be remembered */
  }
}

const EVENT_TYPE_ICON = {
  esports: 'bi-controller',
  singing: 'bi-mic-fill',
  dance: 'bi-music-note-beamed',
  sportsfest: 'bi-award-fill',
  academic: 'bi-mortarboard-fill',
  hackathon: 'bi-laptop-fill',
  pageant: 'bi-gem',
};

function eventTypeIcon(type) {
  return EVENT_TYPE_ICON[type] || 'bi-trophy-fill';
}

// Email is the primary match (now pre-filled from the account at
// registration time), but falls back to an exact name match so a
// registration submitted before that fix, or with a slightly different
// typed email, still shows up here instead of looking like it never went
// through.
function isMyRegistration(registration, user) {
  if (!user) return false;
  const email = String(registration.email || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  if (email && userEmail && email === userEmail) return true;

  const participantName = String(registration.participantName || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();
  return Boolean(participantName && userName && participantName === userName);
}

function IconChip({ icon, color, size = 44 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: size >= 40 ? 12 : 10,
      background: `${color}16`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color, fontSize: size >= 40 ? 20 : 16, flexShrink: 0,
    }}>
      <i className={`bi ${icon}`} />
    </span>
  );
}

export default function ParticipantDashboard() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { calculateLeaderboard } = useScoreStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const startTour = useParticipantTourStore((state) => state.start);
  const [registrationsLoaded, setRegistrationsLoaded] = useState(false);

  useEffect(() => {
    fetchEvents();
    Promise.resolve(fetchRegistrations()).then(() => setRegistrationsLoaded(true));
  }, [fetchEvents, fetchRegistrations]);

  // Hide only unpublished/finished events (draft, completed, rejected,
  // archived) instead of hardcoding an allow-list of "visible" statuses —
  // an allow-list silently hid events left in states like 'approved' or
  // 'ongoing' that other parts of the app already treat as published.
  const HIDDEN_STATUSES = ['draft', 'completed', 'rejected', 'archived'];
  const openEvents = events.filter((e) => !HIDDEN_STATUSES.includes(e.status));

  const filteredEvents = openEvents.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  const myRegistrations = useMemo(() => {
    if (!user) return [];
    return registrations.filter((r) => isMyRegistration(r, user));
  }, [registrations, user]);

  // A brand-new participant (no registrations yet) sees the welcome tour once.
  useEffect(() => {
    if (!registrationsLoaded || !user?.id) return;
    const key = `fairplay_participant_tour_seen_${user.id}`;
    if (readFlag(key)) return;
    writeFlag(key);
    if (myRegistrations.length === 0) startTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationsLoaded, user?.id]);

  const myRegisteredEventIds = useMemo(
    () => new Set(myRegistrations.map((r) => String(r.eventId))),
    [myRegistrations]
  );

  const myPrimaryEvent = useMemo(() => {
    const active = myRegistrations.find((r) => {
      const event = events.find((e) => String(e.id) === String(r.eventId));
      return event && (event.status === 'active' || event.status === 'ongoing');
    });
    if (!active) return null;
    return events.find((e) => String(e.id) === String(active.eventId)) || null;
  }, [events, myRegistrations]);

  const myLeaderboard = useMemo(() => {
    if (!myPrimaryEvent) return [];
    return calculateLeaderboard(myPrimaryEvent.id, myPrimaryEvent.criteria || []).slice(0, 5);
  }, [calculateLeaderboard, myPrimaryEvent]);

  const myRank = myLeaderboard.length > 0
    ? myLeaderboard.find((entry) => (entry.contestantName || '').toLowerCase() === (user?.name || '').toLowerCase())?.rank
    : null;

  const completedCount = new Set(
    myRegistrations
      .map((r) => events.find((e) => String(e.id) === String(r.eventId)))
      .filter((e) => e?.status === 'completed')
      .map((e) => e.id)
  ).size;

  // The registered event the participant should pay attention to next:
  // whichever one is live, otherwise the soonest upcoming one with a date.
  const nextEvent = useMemo(() => {
    const myEvents = events.filter((e) => myRegisteredEventIds.has(String(e.id)));
    const byDate = (a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0);
    const live = myEvents.filter((e) => e.status === 'active' || e.status === 'ongoing').sort(byDate)[0];
    if (live) return live;
    return myEvents.filter((e) => ['approved', 'upcoming'].includes(e.status) && e.startDate).sort(byDate)[0] || null;
  }, [events, myRegisteredEventIds]);

  const cardStyle = {
    background: '#ffffff', border: '1px solid #e2e8f0',
    borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(15,23,42,0.05)',
  };

  const firstName = String(user?.name || '').trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const headline = myRegistrations.length === 0
    ? 'Browse open events and register to get started.'
    : `You're registered for ${myRegistrations.length} event${myRegistrations.length === 1 ? '' : 's'}${myRank ? `, currently ranked #${myRank}` : ''}.`;

  return (
    <DashboardLayout title="Participant Dashboard" subtitle="Browse events, register, and view your scores">
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Hero: greeting, quick actions, and the next registered event */}
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
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={() => navigate('/participant/events')} style={heroPrimaryButtonStyle}>
                  <i className="bi bi-calendar-plus-fill" /> Browse Events
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={() => navigate('/participant/schedule')} style={heroGhostButtonStyle}>
                  <i className="bi bi-calendar-week" /> My Schedule
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
                  {nextEvent?.status === 'active' || nextEvent?.status === 'ongoing' ? 'Happening now' : 'Next event'}
                </span>
                {nextEvent && (nextEvent.status === 'active' || nextEvent.status === 'ongoing') && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'rgba(52,211,153,0.18)', color: '#6ee7b7' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 0 4px rgba(52,211,153,0.25)' }} />
                    Live
                  </span>
                )}
              </div>
              {nextEvent ? (
                <>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <DateTile value={nextEvent.startDate} />
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#ffffff', overflowWrap: 'anywhere' }}>{nextEvent.title}</h3>
                  </div>
                  <div style={{ display: 'grid', gap: 7, fontSize: 13, color: '#cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i className="bi bi-geo-alt" style={{ color: '#7dd3fc', flexShrink: 0 }} />{nextEvent.location || 'No venue set'}</div>
                  </div>
                  <button type="button" onClick={() => navigate('/participant/schedule')} style={{ ...heroPrimaryButtonStyle, padding: '10px 16px', fontSize: 13, boxShadow: 'none', marginTop: 'auto' }}>
                    View schedule <i className="bi bi-arrow-right" />
                  </button>
                </>
              ) : (
                <div style={{ margin: 'auto 0', color: '#cbd5e1', fontSize: 14, lineHeight: 1.5 }}>
                  <i className="bi bi-calendar2-plus" style={{ fontSize: 26, color: '#7dd3fc', display: 'block', marginBottom: 8 }} />
                  No upcoming event yet. Register for one to see it here.
                </div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div data-tour="dash-stats" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12, marginTop: 24 }}>
            {[
              { label: 'Open events', value: openEvents.length, icon: 'bi bi-calendar-event', tone: 'linear-gradient(135deg, #6366f1, #4f46e5)', onClick: () => navigate('/participant/events') },
              { label: 'My registrations', value: myRegistrations.length, icon: 'bi bi-check-circle', tone: 'linear-gradient(135deg, #14b8a6, #0d9488)', onClick: () => navigate('/participant/schedule') },
              { label: 'Completed events', value: completedCount, icon: 'bi bi-patch-check', tone: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', onClick: () => navigate('/participant/scores') },
              { label: 'Your ranking', value: myRank ? `#${myRank}` : '—', icon: 'bi bi-bar-chart-line', tone: 'linear-gradient(135deg, #f59e0b, #d97706)', onClick: () => navigate('/participant/scores') },
            ].map((stat, index) => (
              <motion.button
                key={stat.label}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + index * 0.05 }}
                whileHover={{ y: -3 }}
                onClick={stat.onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, textAlign: 'left', cursor: 'pointer', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18, background: stat.tone, color: '#ffffff' }}>
                  <i className={stat.icon} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 26, fontWeight: 900, color: '#ffffff', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{stat.value}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{stat.label}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </motion.section>

      {/* Search */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <i className="bi bi-search" style={{ fontSize: 16, color: '#94a3b8' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events to join..."
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#0f172a', fontSize: 14, outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Available Events */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: '#0f172a' }}>
          <IconChip icon="bi-calendar-event-fill" color="#2563eb" size={32} />
          Available Events
        </h3>

        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            <i className="bi bi-calendar-x" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No events available</p>
            <p style={{ fontSize: 13, margin: 0 }}>Check back later for new events</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredEvents.map((event, i) => {
              const registered = myRegisteredEventIds.has(String(event.id));
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ borderColor: '#93c5fd', background: '#f0f7ff' }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12, flexWrap: 'wrap', gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <IconChip icon={eventTypeIcon(event.type)} color="#2563eb" size={38} />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', margin: 0 }}>{event.title}</p>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                          {event.startDate || 'TBD'} · {event.location || 'Online'}
                          · {event.participants}/{event.maxParticipants || '∞'} participants
                        </p>
                      </div>
                    </div>
                  </div>

                  {registered ? (
                    <span style={{
                      padding: '10px 20px', borderRadius: 10,
                      background: '#dbeafe', color: '#2563eb', fontWeight: 700, fontSize: 13,
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}>
                      <i className="bi bi-check-circle-fill" />
                      Already Registered
                    </span>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        const route = event.type === 'tournament' || event.type === 'esports' || event.type === 'sportsfest'
                          ? 'team'
                          : 'individual';
                        navigate(`/participant/register-${route}?eventId=${event.id}`);
                      }}
                      style={{
                        padding: '10px 20px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                        border: 'none', color: '#fff', fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      Register Now
                      <i className="bi bi-arrow-right" />
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leaderboard Preview */}
      <div style={{ ...cardStyle, marginTop: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: '#0f172a' }}>
          <IconChip icon="bi-trophy-fill" color="#d97706" size={32} />
          Live Leaderboard{myPrimaryEvent ? ` — ${myPrimaryEvent.title}` : ''}
        </h3>
        {myLeaderboard.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748b', fontSize: 14 }}>
            <i className="bi bi-bar-chart" style={{ fontSize: 32, marginBottom: 10, display: 'block', color: '#cbd5e1' }} />
            {myPrimaryEvent ? 'No scores submitted yet for this event.' : 'Register for an ongoing event to see live rankings here.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {myLeaderboard.map((entry, i) => (
              <motion.div
                key={entry.contestantId || entry.rank}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: entry.rank <= 3 ? '#eff6ff' : '#f8fafc',
                  border: entry.rank <= 3 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  borderRadius: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: entry.rank <= 3 ? '#dbeafe' : '#eef2f7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: entry.rank <= 3 ? '#1d4ed8' : '#64748b',
                  }}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{entry.contestantName}</span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                  {entry.averageScore !== null ? entry.averageScore.toFixed(2) : '--'}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      </div>
    </DashboardLayout>
  );
}

const heroStyle = { position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 'clamp(20px, 3vw, 32px)', background: 'linear-gradient(135deg, #0b1b3f 0%, #0f2a5f 55%, #1e3a8a 100%)', boxShadow: '0 24px 60px rgba(15,23,42,0.25)' };
const glassCardStyle = { display: 'flex', flexDirection: 'column', gap: 14, padding: 20, borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', minWidth: 0 };
const heroPrimaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, border: 'none', background: '#ffffff', color: '#1e3a8a', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 10px 26px rgba(2,6,23,0.3)' };
const heroGhostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.08)', color: '#ffffff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };

// The event's start date as a small calendar leaf, matching the organizer dashboard.
function DateTile({ value }) {
  const date = value ? new Date(value) : null;
  const valid = date && !Number.isNaN(date.getTime());
  return (
    <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', border: '1px solid #dbeafe', color: '#1d4ed8', lineHeight: 1.1 }}>
      {valid ? (
        <>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{date.toLocaleDateString('en-US', { month: 'short' })}</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{date.getDate()}</span>
        </>
      ) : (
        <i className="bi bi-calendar-event" style={{ fontSize: 22 }} />
      )}
    </span>
  );
}

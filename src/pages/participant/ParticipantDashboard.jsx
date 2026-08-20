import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useScoreStore from '../../store/scoreStore';
import useRegistrationStore from '../../store/registrationStore';
import SmartQRCode from '../../components/qr/SmartQRCode';

export default function ParticipantDashboard() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { calculateLeaderboard } = useScoreStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchEvents();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations]);

  const openEvents = events.filter(e => e.status === 'active' || e.status === 'upcoming');

  const filteredEvents = openEvents.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  const myRegistrations = useMemo(() => {
    if (!user?.email) return [];
    return registrations.filter((r) => (r.email || '').toLowerCase() === user.email.toLowerCase());
  }, [registrations, user?.email]);

  const myQrToken = myRegistrations[0]?.individualDetails?.qrToken || myRegistrations[0]?.id || null;

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

  const cardStyle = {
    background: '#ffffff', border: '1px solid #dbeafe',
    borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(37,99,235,0.06)',
  };

  return (
    <DashboardLayout title="Participant Dashboard" subtitle="Browse events, register, and view your scores">
      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Open Events', value: openEvents.length, icon: '📅', color: '#2563eb' },
          { label: 'Active Registrations', value: myRegistrations.length, icon: '✅', color: '#10b981' },
          { label: 'Completed Events', value: completedCount, icon: '🏆', color: '#9333ea' },
          { label: 'Your Ranking', value: myRank ? `#${myRank}` : '—', icon: '📊', color: '#d97706' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            style={{ ...cardStyle, padding: 20, borderLeft: `3px solid ${stat.color}` }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{stat.label}</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</p>
              </div>
              <span style={{ fontSize: 24 }}>{stat.icon}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* My Smart QR Pass */}
      <div style={{ ...cardStyle, marginBottom: 28, display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', border: '1px solid #bfdbfe' }}>
        {myQrToken ? (
          <>
            <div>
              <SmartQRCode token={myQrToken} size={140} />
            </div>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>My Event Pass</h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: '16px' }}>
                Show this QR code to organizers for fast check-in, or to judges when it's your turn to perform.
              </p>
              <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 700 }}>Active Pass</span>
            </div>
          </>
        ) : (
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>No Event Pass Yet</h3>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
              Register for an event below to get your personal check-in QR code.
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🔍</span>
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
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          📅 Available Events
        </h3>

        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>📅</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No events available</p>
            <p style={{ fontSize: 13 }}>Check back later for new events</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredEvents.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>
                      {event.type === 'esports' ? '🎮' :
                       event.type === 'singing' ? '🎤' :
                       event.type === 'dance' ? '💃' :
                       event.type === 'sportsfest' ? '🏅' :
                       event.type === 'academic' ? '📚' :
                       event.type === 'hackathon' ? '💻' :
                       event.type === 'pageant' ? '👑' : '🏆'}
                    </span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>{event.title}</p>
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        {event.startDate || 'TBD'} · {event.location || 'Online'}
                        · {event.participants}/{event.maxParticipants || '∞'} participants
                      </p>
                    </div>
                  </div>
                </div>

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
                    cursor: 'pointer',
                  }}
                >
                  Register Now
                </motion.button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard Preview */}
      <div style={{ ...cardStyle, marginTop: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
          🏆 Live Leaderboard{myPrimaryEvent ? ` — ${myPrimaryEvent.title}` : ''}
        </h3>
        {myLeaderboard.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748b', fontSize: 14 }}>
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
    </DashboardLayout>
  );
}

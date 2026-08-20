import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Calendar, BarChart3, Scale, Target, CheckCircle2, TrendingUp, UserRound, Trophy } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';

function isWithin(value, days) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && Date.now() - time <= days * 86400000;
}

function average(values) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value));
  return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10 : 0;
}

function scoreTotal(score) {
  const values = Object.values(score.criteriaScores || {});
  return values.length ? average(values) : 0;
}

export default function AdminAnalytics() {
  const [timeframe, setTimeframe] = useState('7d');
  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
  const { users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();

  useEffect(() => {
    refreshProfiles();
    fetchEvents();
    fetchJudges();
    fetchRegistrations();
    fetchScores();
  }, [fetchEvents, fetchJudges, fetchRegistrations, fetchScores, refreshProfiles]);

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);
  const filteredEvents = useMemo(() => events.filter((event) => isWithin(event.createdAt || event.created_at || event.startDate, days)), [days, events]);
  const filteredScores = useMemo(() => scoreRows.filter((score) => isWithin(score.timestamp, days)), [days, scoreRows]);
  const filteredRegistrations = useMemo(() => registrations.filter((registration) => isWithin(registration.createdAt, days)), [days, registrations]);
  const filteredUsers = useMemo(() => users.filter((user) => isWithin(user.joined, days)), [days, users]);
  const completedEvents = filteredEvents.filter((event) => event.status === 'completed').length;
  const avgScore = average(filteredScores.map(scoreTotal));
  const completion = filteredEvents.length ? Math.round((completedEvents / filteredEvents.length) * 100) : 0;

  const monthBuckets = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => ({ label: new Date(2026, index, 1).toLocaleString(undefined, { month: 'short' }), events: 0, users: 0 }));
    events.forEach((event) => {
      const date = new Date(event.createdAt || event.created_at || event.startDate || 0);
      if (!Number.isNaN(date.getTime())) months[date.getMonth()].events += 1;
    });
    users.forEach((user) => {
      const date = new Date(user.joined || 0);
      if (!Number.isNaN(date.getTime())) months[date.getMonth()].users += 1;
    });
    return months;
  }, [events, users]);

  const topEvents = useMemo(() => [...events]
    .map((event) => ({
      id: event.id,
      name: event.title,
      participants: Number(event.participants || event.contestants?.length || 0),
      scores: scoreRows.filter((score) => String(score.eventId) === String(event.id)).length,
      judges: judges.filter((judge) => (event.judges || []).some((entry) => String(entry.id || entry) === String(judge.id))).length,
    }))
    .sort((left, right) => (right.participants + right.scores) - (left.participants + left.scores))
    .slice(0, 5), [events, judges, scoreRows]);

  const metrics = [
    { label: 'New Users', value: filteredUsers.length, icon: Users, color: '#2563eb' },
    { label: 'Events Created', value: filteredEvents.length, icon: Calendar, color: '#1d4ed8' },
    { label: 'Scores Submitted', value: filteredScores.length, icon: BarChart3, color: '#0ea5e9' },
    { label: 'Active Judges', value: judges.filter((judge) => judge.status !== 'inactive').length, icon: Scale, color: '#2563eb' },
    { label: 'Avg Score', value: `${avgScore}%`, icon: Target, color: '#1d4ed8' },
    { label: 'Completion Rate', value: `${completion}%`, icon: CheckCircle2, color: '#0ea5e9' },
  ];

  return (
    <DashboardLayout title="System Analytics" subtitle="Live analytics from events, users, registrations, judges, and scores">
      <div style={toolbarStyle}>
        <div style={eyebrowStyle}>Timeframe</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['7d', '30d', '90d'].map((item) => (
            <button key={item} onClick={() => setTimeframe(item)} style={timeButtonStyle(timeframe === item)}>
              {item === '7d' ? '7 Days' : item === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {metrics.map((metric, index) => (
          <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} style={{ ...cardStyle, padding: 20, borderLeft: `3px solid ${metric.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{metric.label}</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: metric.color }}>{metric.value}</p>
              </div>
              <span style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(37,99,235,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: metric.color }}>
                <metric.icon size={18} />
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>
        <ChartCard title="Event Creation Trend" icon={TrendingUp} values={monthBuckets.map((bucket) => bucket.events)} labels={monthBuckets.map((bucket) => bucket.label)} />
        <ChartCard title="User Growth" icon={UserRound} values={monthBuckets.map((bucket) => bucket.users)} labels={monthBuckets.map((bucket) => bucket.label)} />
      </div>

      <div style={cardStyle}>
        <h3 style={cardTitleStyle}><Trophy size={16} /> Top Performing Events</h3>
        {topEvents.length === 0 ? (
          <div style={emptyStyle}>No event activity found in the database yet.</div>
        ) : topEvents.map((event, index) => (
          <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: index < topEvents.length - 1 ? '1px solid #f1f5f9' : 'none', background: index % 2 === 0 ? '#f8fafc' : 'transparent', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={rankStyle}>#{index + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{event.name}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
              <span>{event.participants} participants</span>
              <span>{event.scores} scores</span>
              <span>{event.judges} judges</span>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

function ChartCard({ title, icon: Icon, values, labels }) {
  const max = Math.max(...values, 1);
  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}><Icon size={16} /> {title}</h3>
      <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '20px 0', borderBottom: '1px solid #e2e8f0' }}>
        {values.map((value, index) => (
          <div key={`${labels[index]}-${index}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(4, (value / max) * 170)}px` }} style={{ width: '100%', maxWidth: 30, background: 'linear-gradient(180deg, #60a5fa, #2563eb)', borderRadius: '4px 4px 0 0' }} />
            <span style={{ fontSize: 9, color: '#64748b' }}>{labels[index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 10px 30px rgba(15,23,42,0.06)' };
const toolbarStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 24px rgba(15,23,42,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 };
const eyebrowStyle = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8' };
const cardTitleStyle = { fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' };
const emptyStyle = { padding: 32, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 14, border: '1px dashed #cbd5e1' };
const rankStyle = { width: 28, height: 28, borderRadius: 8, background: 'rgba(37,99,235,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#2563eb' };
const timeButtonStyle = (active) => ({ padding: '8px 16px', borderRadius: 10, border: '1px solid', borderColor: active ? '#2563eb' : '#e2e8f0', background: active ? 'rgba(37,99,235,0.12)' : '#ffffff', color: active ? '#2563eb' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' });

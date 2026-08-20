import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import useEventStore from '../store/eventStore';
import useScoreStore from '../store/scoreStore';

function buildGlobalLeaderboard(events, calculateLeaderboard) {
  const aggregate = new Map();

  events.forEach((event) => {
    const leaderboard = calculateLeaderboard(event.id, event.criteria || []);
    leaderboard.forEach((entry) => {
      const existing = aggregate.get(String(entry.contestantId)) || {
        contestantId: entry.contestantId,
        name: entry.contestantName,
        totalScore: 0,
        appearances: 0,
        totalSubmissions: 0,
        events: [],
      };

      existing.totalScore += Number(entry.averageScore || 0);
      existing.appearances += 1;
      existing.totalSubmissions += Number(entry.totalScores || 0);
      existing.events.push({
        eventId: event.id,
        eventTitle: event.title,
        score: entry.averageScore,
        rank: entry.rank,
      });

      aggregate.set(String(entry.contestantId), existing);
    });
  });

  return Array.from(aggregate.values())
    .map((entry) => ({
      ...entry,
      averageScore: entry.appearances > 0 ? Math.round((entry.totalScore / entry.appearances) * 100) / 100 : 0,
    }))
    .sort((left, right) => right.averageScore - left.averageScore || right.totalSubmissions - left.totalSubmissions)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export default function LeaderboardPage() {
  const { events, fetchEvents } = useEventStore();
  const { fetchScores, calculateLeaderboard } = useScoreStore();
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  useEffect(() => {
    fetchEvents();
    fetchScores();
  }, [fetchEvents, fetchScores]);

  const scorableEvents = useMemo(
    () => events.filter((event) => Array.isArray(event.criteria) && event.criteria.length > 0),
    [events]
  );

  const leaderboardRows = useMemo(() => {
    if (eventFilter !== 'all') {
      const selectedEvent = scorableEvents.find((event) => String(event.id) === String(eventFilter));
      if (!selectedEvent) return [];
      return calculateLeaderboard(selectedEvent.id, selectedEvent.criteria || []).map((entry) => ({
        contestantId: entry.contestantId,
        name: entry.contestantName,
        averageScore: entry.averageScore,
        totalSubmissions: entry.totalScores,
        appearances: 1,
        events: [{ eventId: selectedEvent.id, eventTitle: selectedEvent.title, score: entry.averageScore, rank: entry.rank }],
        rank: entry.rank,
      }));
    }

    return buildGlobalLeaderboard(scorableEvents, calculateLeaderboard);
  }, [calculateLeaderboard, eventFilter, scorableEvents]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const rows = leaderboardRows.filter((row) => {
      if (!normalizedSearch) return true;
      return row.name.toLowerCase().includes(normalizedSearch);
    });

    const sorted = [...rows].sort((left, right) => {
      switch (sortBy) {
        case 'name':
          return left.name.localeCompare(right.name);
        case 'events':
          return right.appearances - left.appearances;
        case 'submissions':
          return right.totalSubmissions - left.totalSubmissions;
        case 'score':
        default:
          return right.averageScore - left.averageScore;
      }
    });

    return sorted.map((row, index) => ({ ...row, displayRank: index + 1 }));
  }, [leaderboardRows, search, sortBy]);

  return (
    <DashboardLayout title="Overall Leaderboard" subtitle="Review real rankings generated from the current scoring dataset">
      <div style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search contestants or teams..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={fieldStyle}
          />
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} style={{ ...fieldStyle, minWidth: 240 }}>
            <option value="all">All scored events</option>
            {scorableEvents.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={{ ...fieldStyle, minWidth: 200 }}>
            <option value="score">Sort by average score</option>
            <option value="submissions">Sort by submissions</option>
            <option value="events">Sort by event appearances</option>
            <option value="name">Sort by name</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
          {[
            ['Ranked Entries', filteredRows.length],
            ['Scored Events', eventFilter === 'all' ? scorableEvents.length : 1],
            ['Top Score', filteredRows[0]?.averageScore ?? 'N/A'],
            ['Top Entry', filteredRows[0]?.name || 'TBD'],
          ].map(([label, value]) => (
            <div key={label} style={statCardStyle}>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
              <h2 style={{ margin: '10px 0 0', color: '#0f172a', fontSize: 28 }}>{value}</h2>
            </div>
          ))}
        </div>

        <div style={tableShellStyle}>
          {filteredRows.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
              No leaderboard data is available yet. Submit judge scores to populate this page.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {['Rank', 'Contestant / Team', 'Average Score', 'Submissions', 'Events', 'Latest Event Result'].map((heading) => (
                      <th key={heading} style={headerCellStyle}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const latestEvent = row.events[row.events.length - 1];
                    return (
                      <motion.tr
                        key={`${row.contestantId}-${row.name}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        style={{ borderBottom: '1px solid #f1f5f9' }}
                      >
                        <td style={cellStyle}>
                          <span style={rankBadgeStyle(row.displayRank)}>{row.displayRank}</span>
                        </td>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.name}</div>
                        </td>
                        <td style={{ ...cellStyle, fontWeight: 800, color: '#2563eb' }}>{row.averageScore}</td>
                        <td style={cellStyle}>{row.totalSubmissions}</td>
                        <td style={cellStyle}>{row.appearances}</td>
                        <td style={cellStyle}>
                          {latestEvent ? `${latestEvent.eventTitle} (#${latestEvent.rank})` : 'No event data'}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

const fieldStyle = {
  flex: 1,
  minWidth: 220,
  padding: '12px 14px',
  borderRadius: 14,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  outline: 'none',
};

const statCardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 18,
  padding: 20,
  boxShadow: '0 10px 28px rgba(15,23,42,0.05)',
};

const tableShellStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 18,
  boxShadow: '0 10px 28px rgba(15,23,42,0.05)',
  overflow: 'hidden',
};

const headerCellStyle = {
  padding: '14px 16px',
  textAlign: 'left',
  fontSize: 12,
  color: '#64748b',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const cellStyle = {
  padding: '14px 16px',
  fontSize: 14,
  color: '#475569',
};

function rankBadgeStyle(rank) {
  const tone = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#2563eb';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 34,
    borderRadius: 10,
    background: `${tone}18`,
    color: tone,
    fontWeight: 800,
  };
}

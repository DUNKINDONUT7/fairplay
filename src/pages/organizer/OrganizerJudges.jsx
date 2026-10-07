import EventPicker from '../../components/common/EventPicker';
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PaginationControls from '../../components/admin/PaginationControls';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import useAuthStore from '../../store/authStore';

// ─── Score Detail Modal ───────────────────────────────────────────────────────
// One event at a time, as a table: contestants down the side, criteria across.
// Only the table scrolls — the header, the event tabs and the page behind stay put.
function JudgeScoreModal({ judge, allScores, events, onClose }) {
  const [activeEventId, setActiveEventId] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const eventGroups = useMemo(() => {
    // A score names its judge by id or by email; `keys` holds every form this judge goes by.
    const judgeScores = allScores.filter((s) => judge.keys.includes(String(s.judgeId).toLowerCase()));
    const byEvent = new Map();
    judgeScores.forEach((score) => {
      const key = String(score.eventId);
      if (!byEvent.has(key)) {
        const event = events.find((entry) => String(entry.id) === key);
        byEvent.set(key, { id: key, title: event?.title || score.eventTitle || `Event ${key}`, criteria: event?.criteria || [], rows: [] });
      }
      const group = byEvent.get(key);
      const values = score.criteriaScores || {};
      const entered = Object.values(values).map(Number).filter((value) => Number.isFinite(value));
      // The same weighted total the leaderboard uses; a plain average only when the event has no criteria.
      const total = group.criteria.length
        ? useScoreStore.getState().calculateWeightedTotal(group.criteria, values).totalScore
        : entered.length ? entered.reduce((sum, value) => sum + value, 0) / entered.length : null;
      group.rows.push({ id: score.id, name: score.contestantName || `Contestant ${score.contestantId}`, values, total, remarks: score.remarks || '', timestamp: score.timestamp });
    });
    byEvent.forEach((group) => {
      // Criteria the event no longer lists still get a column, so no score is hidden.
      const known = new Set(group.criteria.map((criterion) => String(criterion.id)));
      const extra = [...new Set(group.rows.flatMap((row) => Object.keys(row.values)))].filter((id) => !known.has(id));
      group.columns = [
        ...group.criteria.map((criterion) => ({ id: String(criterion.id), name: criterion.name, weight: criterion.weight, max: Number(String(criterion.scoringRange || '').split('-').pop()) || 10 })),
        ...extra.map((id) => ({ id, name: id, weight: null, max: 10 })),
      ];
      group.rows.sort((left, right) => (right.total ?? -1) - (left.total ?? -1));
      const totals = group.rows.map((row) => row.total).filter((value) => value !== null);
      group.average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
    });
    return [...byEvent.values()];
  }, [allScores, events, judge]);

  const active = eventGroups.find((group) => group.id === activeEventId) || eventGroups[0] || null;
  const fmt = (value) => (value === null || value === undefined ? '—' : Number(value).toFixed(2));

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Scores given by ${judge.name}`}
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 860, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: 18 }}>
              {String(judge.name || 'J').replace(/^(judge|prof\.|ms\.|mr\.|mrs\.|dr\.)\s+/i, '').charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Scores given</p>
              <h2 style={{ margin: '2px 0', fontSize: 19, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{judge.name}</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', overflowWrap: 'anywhere' }}>{[judge.specialty, judge.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', color: '#64748b', fontSize: 13, flexShrink: 0 }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {!active ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
            <i className="bi bi-inbox" style={{ fontSize: 40, display: 'block', marginBottom: 10 }} />
            This judge has not submitted any scores yet.
          </div>
        ) : (
          <>
            {/* Event tabs + summary */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #eef2f7', display: 'grid', gap: 12, flexShrink: 0 }}>
              {eventGroups.length > 1 && (
                <div role="tablist" aria-label="Event" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                  {eventGroups.map((group) => {
                    const selected = group.id === active.id;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setActiveEventId(group.id)}
                        title={group.title}
                        style={{ flexShrink: 0, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, border: selected ? '1px solid #2563eb' : '1px solid #e2e8f0', background: selected ? '#eff6ff' : '#ffffff', color: selected ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                      >
                        {group.title}
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <i className="bi bi-trophy-fill" style={{ color: '#f59e0b' }} />
                  <span style={{ overflowWrap: 'anywhere' }}>{active.title}</span>
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, fontWeight: 700 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                    {active.rows.length} contestant{active.rows.length === 1 ? '' : 's'} scored
                  </span>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0' }}>
                    Average given {fmt(active.average)}
                  </span>
                </div>
              </div>
            </div>

            {/* The only part that scrolls */}
            <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...modalThStyle, textAlign: 'left', left: 0, zIndex: 3, minWidth: 190 }}>Contestant</th>
                    {active.columns.map((column) => (
                      <th key={column.id} style={{ ...modalThStyle, minWidth: 96 }} title={column.name}>
                        <div style={{ maxWidth: 130, margin: '0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.name}</div>
                        <div style={{ fontWeight: 600, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                          {column.weight !== null && column.weight !== undefined ? `${column.weight}% · ` : ''}max {column.max}
                        </div>
                      </th>
                    ))}
                    <th style={{ ...modalThStyle, right: 0, zIndex: 3, minWidth: 84 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((row, rowIndex) => (
                    <tr key={row.id}>
                      <td style={{ ...modalTdStyle, textAlign: 'left', position: 'sticky', left: 0, background: '#ffffff', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, background: rowIndex === 0 ? '#fef3c7' : '#f1f5f9', color: rowIndex === 0 ? '#b45309' : '#64748b' }}>{rowIndex + 1}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.name}</div>
                            {row.remarks && <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, maxWidth: 260 }}>“{row.remarks}”</div>}
                          </div>
                        </div>
                      </td>
                      {active.columns.map((column) => {
                        const value = row.values[column.id];
                        const number = Number(value);
                        const has = value !== undefined && value !== null && value !== '' && Number.isFinite(number);
                        return (
                          <td key={column.id} style={modalTdStyle}>
                            {has ? (
                              <>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{number}</div>
                                <div aria-hidden="true" style={{ height: 4, borderRadius: 999, background: '#e2e8f0', margin: '5px auto 0', width: 56, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, (number / column.max) * 100))}%`, background: '#2563eb', borderRadius: 999 }} />
                                </div>
                              </>
                            ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{ ...modalTdStyle, position: 'sticky', right: 0, background: '#f8fbff', zIndex: 1 }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.total)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', flexShrink: 0 }}>
              Highest total first. Total is this judge’s weighted score for the contestant, using each criterion’s weight.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const modalThStyle = { position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', verticalAlign: 'bottom' };
const modalTdStyle = { padding: '12px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZES = [5, 10, 20];

function formatRelative(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OrganizerJudges() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, assignments, loading, fetchJudges } = useJudgeStore();
  const { scores, fetchScores } = useScoreStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [viewingJudge, setViewingJudge] = useState(null);

  useEffect(() => {
    fetchJudges();
    // One request for every score; the list below keeps only this organizer's events.
    fetchScores();
    if (user?.id) fetchEvents(user.id);
  }, [fetchEvents, fetchJudges, fetchScores, user?.id]);

  const activeEvents = useMemo(() => events.filter((e) => e.status !== 'draft'), [events]);
  const myEventIds = useMemo(() => new Set(events.map((e) => String(e.id))), [events]);
  const allScores = useMemo(
    () => Object.values(scores).filter((score) => myEventIds.has(String(score.eventId))),
    [scores, myEventIds],
  );

  // The judges table is shared by every organizer — only list the ones
  // assigned to one of this organizer's events (scorers are added below).
  const myJudgeIds = useMemo(() => new Set(
    (assignments || [])
      .filter((assignment) => myEventIds.has(String(assignment.eventId)))
      .map((assignment) => String(assignment.judgeId)),
  ), [assignments, myEventIds]);

  const judgeMap = useMemo(() => {
    const map = {};
    // A score can name its judge by id or by email. Both lead to the same
    // row, so one judge never shows up twice.
    const aliases = {};

    judges.filter((j) => myJudgeIds.has(String(j.id))).forEach((j) => {
      const id = j.email?.toLowerCase() || String(j.id);
      map[id] = { id, keys: [...new Set([id, String(j.id).toLowerCase()])], name: j.name || 'Judge', email: j.email || '', specialty: j.specialty || 'General', scoredEvents: {}, lastScoredAt: null };
      aliases[String(j.id).toLowerCase()] = id;
      if (j.email) aliases[j.email.toLowerCase()] = id;
    });

    allScores.forEach((score) => {
      const rawId = String(score.judgeId).toLowerCase();
      const id = aliases[rawId] || rawId;
      if (!map[id]) {
        map[id] = { id, keys: [id], name: score.judgeName || 'Judge', email: id.includes('@') ? id : '', specialty: 'General', scoredEvents: {}, lastScoredAt: null };
      } else if ((map[id].name === 'Judge' || !map[id].name) && score.judgeName && score.judgeName !== 'Judge') {
        map[id].name = score.judgeName;
      }
      const eventId = String(score.eventId);
      if (!map[id].scoredEvents[eventId]) {
        map[id].scoredEvents[eventId] = { eventId, eventTitle: score.eventTitle || events.find((e) => String(e.id) === eventId)?.title || `Event ${eventId}`, count: 0, contestants: [] };
      }
      map[id].scoredEvents[eventId].count += 1;
      if (score.contestantName) map[id].scoredEvents[eventId].contestants.push(score.contestantName);
      if (score.timestamp && (!map[id].lastScoredAt || new Date(score.timestamp) > new Date(map[id].lastScoredAt))) {
        map[id].lastScoredAt = score.timestamp;
      }
    });

    return map;
  }, [judges, myJudgeIds, allScores, events]);

  const allJudges = useMemo(
    () => Object.values(judgeMap).sort((a, b) =>
      new Date(b.lastScoredAt || 0).getTime() - new Date(a.lastScoredAt || 0).getTime() || a.name.localeCompare(b.name)),
    [judgeMap],
  );

  const scoredCount = allJudges.filter((j) => Object.keys(j.scoredEvents).length > 0).length;
  const eventsWithScores = new Set(allScores.map((s) => String(s.eventId))).size;

  const filteredJudges = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return allJudges.filter((judge) => {
      const hasScores = Object.keys(judge.scoredEvents).length > 0;
      if (scoreFilter === 'scored' && !hasScores) return false;
      if (scoreFilter === 'unscored' && hasScores) return false;
      if (eventFilter && !Object.keys(judge.scoredEvents).includes(String(eventFilter))) return false;
      if (!term) return true;
      return [judge.name, judge.email, judge.specialty].filter(Boolean).some((v) => v.toLowerCase().includes(term));
    });
  }, [allJudges, searchTerm, eventFilter, scoreFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJudges.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedJudges = filteredJudges.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [searchTerm, eventFilter, scoreFilter, pageSize]);

  const filtersActive = Boolean(searchTerm.trim() || eventFilter || scoreFilter !== 'all');

  return (
    <DashboardLayout title="Judge Management" subtitle="See which judges have scored your events and review their scores">
      {viewingJudge && (
        <JudgeScoreModal
          judge={viewingJudge}
          allScores={allScores}
          events={events}
          onClose={() => setViewingJudge(null)}
        />
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
          <StatTile icon="bi bi-person-badge" tone="info" label="Judges" value={allJudges.length} hint="Available on FairPlay" />
          <StatTile icon="bi bi-check2-circle" tone={scoredCount ? 'success' : 'muted'} label="Have scored" value={scoredCount} hint={`${allJudges.length - scoredCount} not yet`} />
          <StatTile icon="bi bi-pencil-square" tone="info" label="Scores submitted" value={allScores.length} hint={`across ${eventsWithScores} event${eventsWithScores === 1 ? '' : 's'}`} />
          <StatTile icon="bi bi-calendar-event" tone="info" label="Active events" value={activeEvents.length} hint="Your published events" />
        </div>

        <section style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef2f7', display: 'grid', gap: 14 }}>
            <div role="tablist" aria-label="Filter judges" style={{ display: 'inline-flex', padding: 4, borderRadius: 14, background: '#f1f5f9', gap: 4, justifySelf: 'start', flexWrap: 'wrap' }}>
              {[
                ['all', 'All judges', allJudges.length],
                ['scored', 'Have scored', scoredCount],
                ['unscored', 'No scores yet', allJudges.length - scoredCount],
              ].map(([value, label, count]) => {
                const active = scoreFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setScoreFilter(value)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: 'none', background: active ? '#ffffff' : 'transparent', color: active ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: active ? '0 2px 8px rgba(15,23,42,0.08)' : 'none' }}
                  >
                    {label}
                    <span style={{ padding: '0 8px', borderRadius: 999, fontSize: 12, background: active ? '#dbeafe' : '#e2e8f0', color: active ? '#1d4ed8' : '#64748b' }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 260px' }}>
                <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name, email, or specialty"
                  aria-label="Search judges"
                  style={{ ...fieldStyle, paddingLeft: 34 }}
                />
              </div>
              <EventPicker
                events={activeEvents}
                value={eventFilter}
                onChange={setEventFilter}
                allLabel="All events"
                ariaLabel="Only judges who scored this event"
                style={{ flex: '0 1 260px', width: 'auto' }}
              />
              {filtersActive && (
                <button type="button" onClick={() => { setSearchTerm(''); setEventFilter(''); setScoreFilter('all'); }} style={ghostButtonStyle}>
                  <i className="bi bi-x-lg" /> Clear
                </button>
              )}
            </div>
          </div>

          {loading && allJudges.length === 0 ? (
            <div style={{ padding: '44px 18px', textAlign: 'center', color: '#94a3b8' }}>
              <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
              Loading judges...
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    {['Judge', 'Specialty', 'Scores submitted', 'Last scored', ''].map((col, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i === 4 ? 'right' : 'left' }}>{col || <span style={srOnly}>Actions</span>}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedJudges.length > 0 ? pagedJudges.map((judge) => {
                    const scoredEventsList = Object.values(judge.scoredEvents);
                    const totalScored = scoredEventsList.reduce((s, e) => s + e.count, 0);
                    const hasScores = scoredEventsList.length > 0;
                    const lastScored = formatRelative(judge.lastScoredAt);

                    return (
                      <tr key={judge.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ ...avatarStyle, background: hasScores ? '#eff6ff' : '#f1f5f9', color: hasScores ? '#1d4ed8' : '#64748b' }}>{String(judge.name || '?').charAt(0).toUpperCase()}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{judge.name}</div>
                              {judge.email && <div style={{ color: '#64748b', fontSize: 12 }}>{judge.email}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ ...pillStyle, background: '#f1f5f9', color: '#334155' }}>{judge.specialty}</span>
                        </td>
                        <td style={tdStyle}>
                          {!hasScores ? (
                            <span style={{ color: '#94a3b8', fontSize: 13 }}>No scores yet</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              {scoredEventsList.slice(0, 2).map((ev) => (
                                <span
                                  key={ev.eventId}
                                  title={`${ev.eventTitle} — ${ev.count} score${ev.count === 1 ? '' : 's'}${ev.contestants.length ? `. Scored: ${[...new Set(ev.contestants)].join(', ')}` : ''}`}
                                  style={{ ...pillStyle, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 600, maxWidth: 240, minWidth: 0 }}
                                >
                                  <i className="bi bi-trophy" style={{ flexShrink: 0 }} />
                                  {/* The name truncates; the icon and the count always stay whole. */}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{ev.eventTitle}</span>
                                  <span style={{ flexShrink: 0, background: '#dbeafe', borderRadius: 999, padding: '0 7px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{ev.count}</span>
                                </span>
                              ))}
                              {scoredEventsList.length > 2 && (
                                <span style={{ fontSize: 12, color: '#475569' }}>+{scoredEventsList.length - 2} more</span>
                              )}
                              <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{totalScored} total</span>
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: lastScored ? '#475569' : '#94a3b8' }} title={judge.lastScoredAt ? new Date(judge.lastScoredAt).toLocaleString() : undefined}>
                          {lastScored || '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setViewingJudge(judge)}
                            disabled={!hasScores}
                            title={hasScores ? 'View this judge’s scores' : 'This judge has not scored yet'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: `1px solid ${hasScores ? '#bfdbfe' : '#e2e8f0'}`, background: hasScores ? '#eff6ff' : '#f8fafc', color: hasScores ? '#1d4ed8' : '#94a3b8', fontWeight: 700, fontSize: 13, cursor: hasScores ? 'pointer' : 'not-allowed' }}
                          >
                            <i className="bi bi-eye" /> View scores
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="5" style={{ padding: '44px 18px', color: '#94a3b8', textAlign: 'center' }}>
                        <i className={filtersActive ? 'bi bi-search' : 'bi bi-person-x'} style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                        <div style={{ fontWeight: 700, color: '#475569' }}>{filtersActive ? 'No judges match your filters' : 'No judges yet'}</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>{filtersActive ? 'Try clearing the search or filters.' : 'Judges appear here once they are added to FairPlay.'}</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {filteredJudges.length > 0 && (
            <div style={{ padding: '0 20px 16px' }}>
              <PaginationControls
                page={currentPage}
                totalPages={totalPages}
                limit={pageSize}
                totalItems={filteredJudges.length}
                onPageChange={setPage}
                onLimitChange={setPageSize}
                pageSizes={PAGE_SIZES}
              />
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

const TONES = {
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  success: { bg: '#ecfdf5', fg: '#047857' },
  muted: { bg: '#f1f5f9', fg: '#475569' },
};

function StatTile({ icon, tone, label, value, hint }) {
  const colors = TONES[tone] || TONES.info;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, background: colors.bg, color: colors.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><i className={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const thStyle = { padding: '12px 18px', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #e2e8f0', background: '#fbfcfe' };
const tdStyle = { padding: '14px 18px', fontSize: 13, color: '#475569', verticalAlign: 'middle' };
const pillStyle = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' };
const avatarStyle = { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 };
const fieldStyle = { width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

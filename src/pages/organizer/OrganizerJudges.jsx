import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PaginationControls from '../../components/admin/PaginationControls';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useScoreStore from '../../store/scoreStore';
import useAuthStore from '../../store/authStore';

// ─── Score Detail Modal ───────────────────────────────────────────────────────
function JudgeScoreModal({ judge, allScores, events, onClose }) {
  const judgeScores = allScores.filter((s) => String(s.judgeId).toLowerCase() === judge.id);

  // Group by event
  const byEvent = {};
  judgeScores.forEach((s) => {
    const key = String(s.eventId);
    if (!byEvent[key]) byEvent[key] = { title: s.eventTitle || `Event ${key}`, scores: [] };
    byEvent[key].scores.push(s);
  });

  const eventGroups = Object.values(byEvent);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Score Details</p>
            <h2 style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{judge.name}</h2>
            {judge.email && <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{judge.email}</p>}
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 700 }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {eventGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
              <i className="bi bi-inbox" style={{ fontSize: 40, display: 'block', marginBottom: 10 }} />
              This judge has not submitted any scores yet.
            </div>
          ) : eventGroups.map((group) => (
            <div key={group.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <i className="bi bi-trophy-fill" style={{ color: '#f59e0b' }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{group.title}</h3>
                <span style={{ marginLeft: 'auto', fontSize: 12, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                  {group.scores.length} contestant{group.scores.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.scores.map((score) => {
                  const criteriaEntries = Object.entries(score.criteriaScores || {});
                  const total = criteriaEntries.reduce((sum, [, v]) => sum + Number(v), 0);
                  const avg = criteriaEntries.length > 0 ? (total / criteriaEntries.length).toFixed(1) : '—';

                  // Find criteria names from event
                  const event = events.find((e) => String(e.id) === String(score.eventId));
                  const criteriaList = event?.criteria || [];

                  return (
                    <div key={score.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px' }}>
                      {/* Contestant header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: criteriaEntries.length > 0 ? 12 : 0 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                          <i className="bi bi-person-fill" style={{ color: '#6366f1' }} />
                          {score.contestantName || `Contestant ${score.contestantId}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {score.timestamp ? new Date(score.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          <span style={{ background: '#1d4ed8', color: '#fff', fontWeight: 800, fontSize: 15, padding: '4px 12px', borderRadius: 8, fontFamily: 'monospace' }}>
                            {avg}
                          </span>
                        </div>
                      </div>

                      {/* Criteria breakdown */}
                      {criteriaEntries.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                          {criteriaEntries.map(([criterionId, val]) => {
                            const criterion = criteriaList.find((c) => String(c.id) === String(criterionId));
                            const label = criterion?.name || criterionId;
                            const max = criterion?.scoringRange
                              ? Number(String(criterion.scoringRange).split('-').pop()) || 10
                              : 10;
                            const pct = max > 0 ? (Number(val) / max) * 100 : 0;
                            return (
                              <div key={criterionId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 999 }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: 999 }} />
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'right' }}>{val}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const { judges, loading, fetchJudges } = useJudgeStore();
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

  const judgeMap = useMemo(() => {
    const map = {};

    judges.forEach((j) => {
      const id = j.email?.toLowerCase() || String(j.id);
      map[id] = { id, name: j.name || 'Judge', email: j.email || '', specialty: j.specialty || 'General', scoredEvents: {}, lastScoredAt: null };
    });

    allScores.forEach((score) => {
      const id = String(score.judgeId).toLowerCase();
      if (!map[id]) {
        map[id] = { id, name: score.judgeName || 'Judge', email: id.includes('@') ? id : '', specialty: 'General', scoredEvents: {}, lastScoredAt: null };
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
  }, [judges, allScores, events]);

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
              <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Only judges who scored this event" style={{ ...fieldStyle, flex: '0 1 240px' }}>
                <option value="">All events</option>
                {activeEvents.map((e) => (
                  <option key={e.id} value={e.id}>Scored: {e.title}</option>
                ))}
              </select>
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
                                <span key={ev.eventId} title={ev.contestants.length ? `Scored: ${[...new Set(ev.contestants)].join(', ')}` : undefined} style={{ ...pillStyle, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <i className="bi bi-trophy" /> {ev.eventTitle} · {ev.count}
                                </span>
                              ))}
                              {scoredEventsList.length > 2 && (
                                <span style={{ fontSize: 12, color: '#475569' }}>+{scoredEventsList.length - 2} more</span>
                              )}
                              <span style={{ fontSize: 12, color: '#64748b' }}>{totalScored} total</span>
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

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
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
export default function OrganizerJudges() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, loading, fetchJudges } = useJudgeStore();
  const { scores, fetchScores } = useScoreStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [viewingJudge, setViewingJudge] = useState(null);

  useEffect(() => {
    fetchJudges();
    if (user?.id) fetchEvents(user.id);
  }, [fetchEvents, fetchJudges, user?.id]);

  useEffect(() => {
    if (events.length > 0) {
      events.forEach((e) => fetchScores(e.id));
    }
  }, [events, fetchScores]);

  const activeEvents = useMemo(() => events.filter((e) => e.status !== 'draft'), [events]);
  const allScores = useMemo(() => Object.values(scores), [scores]);

  const judgeMap = useMemo(() => {
    const map = {};

    judges.forEach((j) => {
      const id = j.email?.toLowerCase() || String(j.id);
      map[id] = { id, name: j.name || 'Judge', email: j.email || '', specialty: j.specialty || 'General', scoredEvents: {} };
    });

    allScores.forEach((score) => {
      const id = String(score.judgeId).toLowerCase();
      if (!map[id]) {
        map[id] = { id, name: score.judgeName || 'Judge', email: id.includes('@') ? id : '', specialty: 'General', scoredEvents: {} };
      } else if ((map[id].name === 'Judge' || !map[id].name) && score.judgeName && score.judgeName !== 'Judge') {
        map[id].name = score.judgeName;
      }
      const eventId = String(score.eventId);
      if (!map[id].scoredEvents[eventId]) {
        map[id].scoredEvents[eventId] = { eventTitle: score.eventTitle || `Event ${eventId}`, count: 0, contestants: [] };
      }
      map[id].scoredEvents[eventId].count += 1;
      if (score.contestantName) map[id].scoredEvents[eventId].contestants.push(score.contestantName);
    });

    return map;
  }, [judges, allScores]);

  const allJudges = useMemo(() => Object.values(judgeMap), [judgeMap]);

  const filteredJudges = useMemo(() => allJudges.filter((judge) => {
    const matchesSearch = [judge.name, judge.email, judge.specialty]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesEvent = !eventFilter || Object.keys(judge.scoredEvents).includes(String(eventFilter));
    return matchesSearch && matchesEvent;
  }), [allJudges, searchTerm, eventFilter]);

  const totalScoresCount = allScores.length;
  const judgesWithScores = allJudges.filter((j) => Object.keys(j.scoredEvents).length > 0).length;

  return (
    <DashboardLayout title="Judge Management" subtitle="View judge scoring activity across all events">
      {viewingJudge && (
        <JudgeScoreModal
          judge={viewingJudge}
          allScores={allScores}
          events={events}
          onClose={() => setViewingJudge(null)}
        />
      )}

      {loading && (
        <div style={{ padding: 20, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', marginBottom: 20 }}>
          Loading judge data...
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total judges', value: allJudges.length },
          { label: 'Judges with scores', value: judgesWithScores },
          { label: 'Total scores submitted', value: totalScoresCount },
          { label: 'Active events', value: activeEvents.length },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{label}</p>
            <h2 style={{ margin: '10px 0 0', color: '#0f172a' }}>{value}</h2>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search judges, email, specialty"
          style={{ flex: 1, minWidth: 220, padding: '12px 14px', borderRadius: 14, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', outline: 'none' }}
        />
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          style={{ minWidth: 220, padding: '12px 14px', borderRadius: 14, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', outline: 'none' }}
        >
          <option value="">All events</option>
          {activeEvents.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {['Judge', 'Specialty', 'Scores Submitted', ''].map((col, i) => (
                <th key={i} style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredJudges.length > 0 ? filteredJudges.map((judge) => {
              const scoredEventsList = Object.values(judge.scoredEvents);
              const totalScored = scoredEventsList.reduce((s, e) => s + e.count, 0);
              const hasScores = scoredEventsList.length > 0;

              return (
                <tr key={judge.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{judge.name}</div>
                    {judge.email && <div style={{ color: '#64748b', fontSize: 12 }}>{judge.email}</div>}
                  </td>
                  <td style={{ padding: '16px 18px', color: '#64748b', verticalAlign: 'middle' }}>{judge.specialty}</td>
                  <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                    {!hasScores ? (
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>No scores yet</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {scoredEventsList.map((ev) => (
                          <span key={ev.eventTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
                            <i className="bi bi-trophy" />
                            {ev.eventTitle} · {ev.count} scored
                          </span>
                        ))}
                        <span style={{ fontSize: 12, color: '#475569', alignSelf: 'center' }}>
                          ({totalScored} total)
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                    <button
                      onClick={() => setViewingJudge(judge)}
                      style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid #bfdbfe', background: hasScores ? '#eff6ff' : '#f8fafc', color: hasScores ? '#2563eb' : '#94a3b8', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <i className="bi bi-eye" />
                      View
                    </button>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="4" style={{ padding: '40px 18px', color: '#94a3b8', textAlign: 'center' }}>
                  <i className="bi bi-person-x" style={{ fontSize: 36, display: 'block', marginBottom: 8 }} />
                  No judges found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

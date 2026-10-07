import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import { CriteriaBreakdown, ParticipantDialog, RankBadge } from '../../components/reports/ScoreDetails';
import { ScoreStatusBadge, getScoreStatus } from '../../components/reports/ScoreMatrix';
import {
  EventStatusBadge,
  ReportEmptyState,
  ReportLoading,
  reportStyles as s,
} from '../../components/reports/reportShared';
import useEventReport from '../../hooks/useEventReport';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import { describeBracketSchedule } from '../../utils/bracketRules';
import { formatScore } from '../../utils/eventReport';

const PODIUM = {
  1: { label: 'Champion', accent: '#1d4ed8', background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 70%)', border: '#93c5fd', icon: 'bi-trophy-fill', iconColor: '#f59e0b' },
  2: { label: '2nd Place', accent: '#475569', background: '#ffffff', border: '#cbd5e1', icon: 'bi-award-fill', iconColor: '#94a3b8' },
  3: { label: '3rd Place', accent: '#475569', background: '#ffffff', border: '#cbd5e1', icon: 'bi-award-fill', iconColor: '#b45309' },
};

function PodiumCard({ participant, judged, maxScore, onOpen }) {
  const tone = PODIUM[participant.rank];
  const first = participant.rank === 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ textAlign: 'left', cursor: 'pointer', background: tone.background, border: `1px solid ${tone.border}`, borderRadius: 18, padding: first ? 24 : 20, boxShadow: first ? '0 18px 40px rgba(37,99,235,0.14)' : '0 10px 26px rgba(15,23,42,0.05)', minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: tone.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        <i className={`bi ${tone.icon}`} style={{ color: tone.iconColor, fontSize: 16 }} />
        {tone.label}
      </div>
      <div style={{ fontSize: first ? 22 : 18, fontWeight: 800, color: '#0f172a', margin: '10px 0 2px', overflowWrap: 'anywhere', lineHeight: 1.25 }}>{participant.name}</div>
      <div style={{ fontSize: 13, color: '#64748b', minHeight: 18, overflowWrap: 'anywhere' }}>{participant.team || ' '}</div>
      <div style={{ fontSize: first ? 34 : 26, fontWeight: 800, color: '#0f172a', marginTop: 12, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {judged ? formatScore(participant.final) : participant.record}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        {judged ? `Final score${maxScore ? ` out of ${formatScore(maxScore)}` : ''}` : 'Win–loss record'}
      </div>
    </button>
  );
}

export default function OrganizerRanking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const fetchEvents = useEventStore((state) => state.fetchEvents);
  const eventsLoading = useEventStore((state) => state.loading);
  const { event, report, loading } = useEventReport(id);
  const [bracket, setBracket] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [participantId, setParticipantId] = useState(null);

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
  }, [fetchEvents, user?.id]);

  // A sports fest ranks each sport on its own; everything else is one list.
  const brackets = useMemo(
    () => (report ? Array.from(new Set(report.participants.map((participant) => participant.bracket).filter(Boolean))) : []),
    [report]
  );
  const multiBracket = brackets.length > 1;
  const activeBracket = multiBracket ? (brackets.includes(bracket) ? bracket : brackets[0]) : '';

  const pool = useMemo(
    () => (report ? report.participants.filter((participant) => !multiBracket || participant.bracket === activeBracket) : []),
    [activeBracket, multiBracket, report]
  );
  const ranked = useMemo(() => pool.filter((participant) => participant.rank).sort((left, right) => left.rank - right.rank), [pool]);
  const unranked = pool.filter((participant) => !participant.rank);
  const term = search.trim().toLowerCase();
  const visibleRanked = ranked.filter((participant) => !term || participant.name.toLowerCase().includes(term) || participant.team.toLowerCase().includes(term));

  if (!event) {
    return (
      <DashboardLayout title="Ranking" subtitle="Events">
        <div style={s.panel}>
          {loading || eventsLoading ? <ReportLoading label="Loading ranking…" /> : (
            <ReportEmptyState icon="bi bi-exclamation-circle" title="Event not found">
              This event does not exist or is not one of your events. <Link to="/organizer/events" style={{ color: '#2563eb', fontWeight: 700 }}>Back to My Events</Link>
            </ReportEmptyState>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const { info, stats } = report;
  const judged = report.isJudged;
  const schedule = describeBracketSchedule(event, null);
  const isFinal = report.reportStatus === 'final';
  const selectedParticipant = report.participants.find((participant) => participant.id === participantId) || null;
  const topScore = ranked[0]?.final || stats.maxScore || 0;
  const toggle = (rowId) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    return next;
  });

  return (
    <DashboardLayout title={isFinal ? 'Final Ranking' : 'Current Ranking'} subtitle={info.title}>
      {selectedParticipant && <ParticipantDialog report={report} participant={selectedParticipant} onClose={() => setParticipantId(null)} />}

      <Breadcrumbs items={[
        { label: 'My Events', to: '/organizer/events' },
        { label: info.title, to: `/organizer/events/${info.id}` },
        { label: 'Ranking' },
      ]} />

      {/* ---- Event header ---- */}
      <section style={{ ...s.panel, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <EventStatusBadge status={info.status} />
              <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: isFinal ? '#047857' : '#b45309', background: isFinal ? '#ecfdf5' : '#fffbeb', border: `1px solid ${isFinal ? '#a7f3d0' : '#fde68a'}` }}>
                <i className={isFinal ? 'bi bi-patch-check' : 'bi bi-hourglass-split'} style={{ marginRight: 6 }} />
                {isFinal ? 'Final results' : 'Provisional'}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{info.title}</h2>
            <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', color: '#475569', fontSize: 13, marginTop: 8 }}>
              <span><i className="bi bi-tag" style={{ marginRight: 6, color: '#64748b' }} />{info.category}</span>
              {schedule.dates && <span><i className="bi bi-calendar-event" style={{ marginRight: 6, color: '#64748b' }} />{schedule.dates}</span>}
              {schedule.venue && <span><i className="bi bi-geo-alt" style={{ marginRight: 6, color: '#64748b' }} />{schedule.venue}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => navigate(`/organizer/scoring?eventId=${info.id}`)} style={s.secondaryButton}>
              <i className="bi bi-table" /> {judged ? 'All Scores' : 'Scoring'}
            </button>
            {report.isTournament && (
              <button type="button" onClick={() => navigate(`/organizer/brackets?eventId=${info.id}`)} style={s.secondaryButton}>
                <i className="bi bi-diagram-3" /> Bracket
              </button>
            )}
            <button type="button" onClick={() => navigate(`/organizer/reports/${info.id}`)} style={s.primaryButton}>
              <i className="bi bi-file-earmark-text" /> Full Report
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 18, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          {[
            ['Participants', stats.totalParticipants],
            ['Ranked', `${report.ranked.length} of ${stats.totalParticipants}`],
            ...(judged
              ? [['Judges', stats.totalJudges], ['Evaluations', `${stats.completedEvaluations} / ${stats.expectedEvaluations}`], ['Average score', formatScore(stats.averageScore)]]
              : [['Matches played', `${report.tournament.completedMatches} / ${report.tournament.totalMatches}`]]),
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      {!isFinal && report.ranked.length > 0 && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.55 }}>
          <i className="bi bi-exclamation-triangle" style={{ marginTop: 2 }} />
          <div>
            This ranking is provisional. It updates as scores come in and becomes final when you finalize the event
            {judged && stats.pendingEvaluations > 0 ? ` — ${stats.pendingEvaluations} evaluation${stats.pendingEvaluations === 1 ? ' is' : 's are'} still pending.` : '.'}
          </div>
        </div>
      )}

      {multiBracket && (
        <div role="tablist" aria-label="Ranking for" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
          {brackets.map((entry) => {
            const active = entry === activeBracket;
            return (
              <button key={entry} type="button" role="tab" aria-selected={active} onClick={() => { setBracket(entry); setExpanded(new Set()); }} style={{ padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569' }}>
                {entry.replace(`${info.title} - `, '')}
              </button>
            );
          })}
        </div>
      )}

      {loading && ranked.length === 0 ? (
        <div style={s.panel}><ReportLoading label="Loading ranking…" /></div>
      ) : ranked.length === 0 ? (
        <div style={s.panel}>
          <ReportEmptyState icon="bi bi-trophy" title="No ranking yet">
            {pool.length === 0
              ? 'This event has no participants yet. The ranking appears once participants are added and scored.'
              : judged
                ? 'The ranking is calculated automatically as soon as judges submit their first scores.'
                : 'Placements appear once every match in the bracket has been played.'}
          </ReportEmptyState>
        </div>
      ) : (
        <>
          {/* ---- Top 3 ---- */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16, alignItems: 'end' }}>
            {ranked.slice(0, 3).map((participant) => (
              <PodiumCard key={participant.id} participant={participant} judged={judged} maxScore={stats.maxScore} onOpen={() => setParticipantId(participant.id)} />
            ))}
          </div>

          {/* ---- Full ranking ---- */}
          <section style={s.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={s.heading}>{isFinal ? 'Final ranking' : 'Current ranking'}</h2>
                <p style={{ ...s.subheading, margin: 0 }}>
                  {judged
                    ? info.audienceEnabled
                      ? `Final score = judges' average (${100 - info.audienceWeight}%) + audience average (${info.audienceWeight}%).`
                      : "Final score is the average of the judges' weighted totals. Open a row for the breakdown."
                    : 'Placement follows how far each team went. Teams out in the same round are ordered by how close their last game was.'}
                </p>
              </div>
              <div style={{ position: 'relative', flex: '0 1 260px', minWidth: 0 }}>
                <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a participant" aria-label="Find a participant" style={{ ...s.field, width: '100%', boxSizing: 'border-box', paddingLeft: 34 }} />
              </div>
            </div>

            {visibleRanked.length === 0 ? (
              <ReportEmptyState icon="bi bi-search" title="No one matches that search">Try a different name.</ReportEmptyState>
            ) : (
              <div style={s.tableWrap}>
                <table style={{ ...s.table, minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: 36 }} aria-label="Expand" />
                      <th style={{ ...s.th, width: 70 }}>Rank</th>
                      <th style={s.th}>{judged ? 'Participant' : 'Team'}</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>{judged ? 'Final score' : 'Win–loss'}</th>
                      {judged && <th style={{ ...s.th, width: '22%' }} aria-label="Score compared with the leader" />}
                      <th style={s.th}>Placement</th>
                      <th style={s.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRanked.map((participant) => {
                      const open = expanded.has(participant.id);
                      return (
                        <Fragment key={participant.id}>
                          <tr onClick={() => toggle(participant.id)} style={{ cursor: 'pointer', background: participant.rank <= 3 ? '#f8fbff' : undefined }}>
                            <td style={s.td}>
                              <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} score breakdown for ${participant.name}`} onClick={(e) => { e.stopPropagation(); toggle(participant.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                                <i className={open ? 'bi bi-chevron-down' : 'bi bi-chevron-right'} />
                              </button>
                            </td>
                            <td style={s.td}><RankBadge rank={participant.rank} /></td>
                            <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>
                              {participant.number ? <span style={{ color: '#94a3b8', fontWeight: 600, marginRight: 6 }}>#{participant.number}</span> : null}
                              {participant.name}
                              {participant.team && <div style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>{participant.team}</div>}
                            </td>
                            <td style={{ ...s.td, ...s.num, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{judged ? formatScore(participant.final) : participant.record}</td>
                            {judged && (
                              <td style={s.td}>
                                <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }} aria-hidden="true">
                                  <div style={{ width: `${topScore ? Math.max(2, Math.min(100, (participant.final / topScore) * 100)) : 0}%`, height: '100%', background: participant.rank === 1 ? '#1d4ed8' : '#60a5fa' }} />
                                </div>
                              </td>
                            )}
                            <td style={s.td}>
                              {participant.placement}
                              {participant.award && <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{participant.award}</div>}
                            </td>
                            <td style={s.td}>{judged ? <ScoreStatusBadge status={getScoreStatus(participant, report)} /> : participant.status}</td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={judged ? 7 : 6} style={{ padding: 16, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                {judged ? (
                                  <CriteriaBreakdown report={report} participant={participant} />
                                ) : (
                                  <div style={{ fontSize: 13, color: '#475569' }}>
                                    {participant.bracket ? `${participant.bracket.replace(`${info.title} - `, '')}: ` : ''}
                                    {participant.record} win–loss record, finished {participant.placement.toLowerCase()}.
                                  </div>
                                )}
                                <button type="button" onClick={() => setParticipantId(participant.id)} style={{ ...s.secondaryButton, marginTop: 12, padding: '7px 12px', fontSize: 12 }}>
                                  <i className="bi bi-box-arrow-up-right" /> Open full details
                                </button>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {unranked.length > 0 && (
              <p style={{ fontSize: 13, color: '#64748b', margin: '14px 0 0', lineHeight: 1.6 }}>
                <strong style={{ color: '#334155' }}>Not ranked yet ({unranked.length}):</strong> {unranked.map((participant) => participant.name).join(', ')}
              </p>
            )}
          </section>
        </>
      )}
    </DashboardLayout>
  );
}

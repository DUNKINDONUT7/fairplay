import { Fragment, useEffect, useMemo, useState } from 'react';
import PaginationControls from '../admin/PaginationControls';
import { formatReportDate, formatScore } from '../../utils/eventReport';
import { CriteriaBreakdown, RankBadge } from './ScoreDetails';
import { ReportEmptyState, reportStyles as s } from './reportShared';

// Where a participant's scoring stands, in the words an organizer would use.
export function getScoreStatus(participant, report) {
  if (participant.status === 'Eliminated') return 'Eliminated';
  if (participant.scoredBy === 0) return 'Pending';
  if (participant.scoredBy < report.judges.length) return 'Partial';
  const allLocked = participant.evaluations.every((evaluation) => evaluation.locked);
  return allLocked && report.info.isCompleted ? 'Finalized' : 'Complete';
}

const STATUS_TONES = {
  Finalized: { color: '#047857', background: '#ecfdf5', icon: 'bi-shield-lock-fill' },
  Complete: { color: '#1d4ed8', background: '#eff6ff', icon: 'bi-check-circle-fill' },
  Partial: { color: '#b45309', background: '#fffbeb', icon: 'bi-hourglass-split' },
  Pending: { color: '#64748b', background: '#f1f5f9', icon: 'bi-dash-circle' },
  Eliminated: { color: '#b91c1c', background: '#fef2f2', icon: 'bi-x-circle' },
};

export function ScoreStatusBadge({ status }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: tone.color, background: tone.background }}>
      <i className={`bi ${tone.icon}`} />
      {status}
    </span>
  );
}

const lastSubmitted = (participant) => participant.evaluations.reduce((latest, evaluation) => {
  const time = evaluation.timestamp ? new Date(evaluation.timestamp).getTime() : 0;
  return time > latest ? time : latest;
}, 0);

const SORTS = {
  rank: { label: 'Rank', compare: (a, b) => (a.rank || 9999) - (b.rank || 9999) },
  name: { label: 'Name (A–Z)', compare: (a, b) => a.name.localeCompare(b.name) },
  final: { label: 'Final score (highest)', compare: (a, b) => (b.final ?? -1) - (a.final ?? -1) },
  recent: { label: 'Most recently scored', compare: (a, b) => lastSubmitted(b) - lastSubmitted(a) },
};

// Every participant against every judge, with the criterion scores one click
// away. Filters live here so the table can be dropped into any page.
export default function ScoreMatrix({ report, onOpenParticipant }) {
  const [search, setSearch] = useState('');
  const [judgeFilter, setJudgeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [rankFilter, setRankFilter] = useState('all');
  const [sort, setSort] = useState('rank');
  const [expanded, setExpanded] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const rows = useMemo(
    () => report.participants.map((participant) => ({ ...participant, scoreStatus: getScoreStatus(participant, report) })),
    [report]
  );
  const teams = useMemo(() => Array.from(new Set(rows.map((row) => row.team).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => !term || row.name.toLowerCase().includes(term) || String(row.number || '').includes(term) || row.team.toLowerCase().includes(term))
      .filter((row) => statusFilter === 'all' || row.scoreStatus === statusFilter)
      .filter((row) => teamFilter === 'all' || row.team === teamFilter)
      .filter((row) => rankFilter === 'all' || (row.rank && row.rank <= Number(rankFilter)))
      // "Judge" narrows to the participants that judge has scored.
      .filter((row) => judgeFilter === 'all' || Boolean(row.byJudge[judgeFilter]))
      .sort(SORTS[sort].compare);
  }, [judgeFilter, rankFilter, rows, search, sort, statusFilter, teamFilter]);

  useEffect(() => { setPage(1); }, [search, judgeFilter, statusFilter, teamFilter, rankFilter, sort, limit]);

  const judges = judgeFilter === 'all' ? report.judges : report.judges.filter((judge) => judge.key === judgeFilter);
  const visible = filtered.slice((page - 1) * limit, page * limit);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const toggle = (id) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const hasFilters = Boolean(search) || judgeFilter !== 'all' || statusFilter !== 'all' || teamFilter !== 'all' || rankFilter !== 'all';

  if (report.participants.length === 0) {
    return (
      <ReportEmptyState icon="bi bi-people" title="No participants yet">
        Scores will appear here once participants are added to the event and judges start scoring.
      </ReportEmptyState>
    );
  }
  if (report.judges.length === 0) {
    return (
      <ReportEmptyState icon="bi bi-person-badge" title="No judges yet">
        No judges are assigned to this event and no scores have been submitted. Assign judges to start scoring.
      </ReportEmptyState>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search participant or team" aria-label="Search participants" style={{ ...s.field, width: '100%', boxSizing: 'border-box', paddingLeft: 34 }} />
        </div>
        {report.judges.length > 1 && (
          <select value={judgeFilter} onChange={(e) => setJudgeFilter(e.target.value)} aria-label="Judge" style={s.field}>
            <option value="all">All judges</option>
            {report.judges.map((judge) => <option key={judge.key} value={judge.key}>{judge.name}</option>)}
          </select>
        )}
        {teams.length > 0 && (
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Team or organization" style={s.field}>
            <option value="all">All teams / organizations</option>
            {teams.map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Score status" style={s.field}>
          <option value="all">All score statuses</option>
          {['Finalized', 'Complete', 'Partial', 'Pending', 'Eliminated'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)} aria-label="Rank" style={s.field}>
          <option value="all">All ranks</option>
          <option value="3">Top 3</option>
          <option value="5">Top 5</option>
          <option value="10">Top 10</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" style={s.field}>
          {Object.entries(SORTS).map(([key, option]) => <option key={key} value={key}>Sort: {option.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <ReportEmptyState icon="bi bi-funnel" title="No scores match these filters">
          {hasFilters ? 'Try a different search or reset the filters.' : 'Nothing to show yet.'}
        </ReportEmptyState>
      ) : (
        <>
          <div style={s.tableWrap}>
            <table style={{ ...s.table, minWidth: 720 + judges.length * 110 }}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 36 }} aria-label="Expand" />
                  <th style={s.th}>Rank</th>
                  <th style={s.th}>Participant</th>
                  {judges.map((judge) => <th key={judge.key} style={{ ...s.th, textAlign: 'right' }}>{judge.name}</th>)}
                  <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Average</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Final</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Last submitted</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((participant) => {
                  const open = expanded.has(participant.id);
                  const submitted = lastSubmitted(participant);
                  return (
                    <Fragment key={participant.id}>
                      <tr onClick={() => toggle(participant.id)} style={{ cursor: 'pointer', background: participant.rank && participant.rank <= 3 ? '#f8fbff' : undefined }}>
                        <td style={s.td}>
                          <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} criteria scores for ${participant.name}`} onClick={(e) => { e.stopPropagation(); toggle(participant.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                            <i className={open ? 'bi bi-chevron-down' : 'bi bi-chevron-right'} />
                          </button>
                        </td>
                        <td style={s.td}><RankBadge rank={participant.rank} /></td>
                        <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>
                          {participant.number ? <span style={{ color: '#94a3b8', fontWeight: 600, marginRight: 6 }}>#{participant.number}</span> : null}
                          {participant.name}
                          {participant.team && <div style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>{participant.team}</div>}
                        </td>
                        {judges.map((judge) => (
                          <td key={judge.key} style={{ ...s.td, ...s.num, color: participant.byJudge[judge.key] ? '#334155' : '#cbd5e1' }}>
                            {participant.byJudge[judge.key] ? formatScore(participant.byJudge[judge.key].total) : '—'}
                          </td>
                        ))}
                        <td style={{ ...s.td, ...s.num }}>{formatScore(participant.total)}</td>
                        <td style={{ ...s.td, ...s.num }}>{formatScore(participant.average)}</td>
                        <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(participant.final)}</td>
                        <td style={s.td}><ScoreStatusBadge status={participant.scoreStatus} /></td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap', fontSize: 12 }}>{submitted ? formatReportDate(new Date(submitted), true) : '—'}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={8 + judges.length} style={{ padding: 16, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <CriteriaBreakdown report={report} participant={participant} />
                            {participant.audienceAverage !== null && (
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                                Final score also includes the audience average of {formatScore(participant.audienceAverage)} ({report.info.audienceWeight}% weight).
                              </div>
                            )}
                            {onOpenParticipant && (
                              <button type="button" onClick={() => onOpenParticipant(participant.id)} style={{ ...s.secondaryButton, marginTop: 12, padding: '7px 12px', fontSize: 12 }}>
                                <i className="bi bi-box-arrow-up-right" /> Open full score details
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > limit || limit !== 25
            ? <PaginationControls page={page} totalPages={totalPages} limit={limit} totalItems={filtered.length} onPageChange={setPage} onLimitChange={setLimit} />
            : <div style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>Showing {filtered.length} of {report.participants.length} participants</div>}
        </>
      )}
    </>
  );
}

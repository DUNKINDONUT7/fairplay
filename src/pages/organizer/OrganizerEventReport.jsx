import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PaginationControls from '../../components/admin/PaginationControls';
import { ColumnBars, RankedBars } from '../../components/reports/ReportCharts';
import {
  EventStatusBadge,
  ReportEmptyState,
  ReportLoading,
  ReportStatusBadge,
  downloadReportCsv,
  downloadReportJson,
  generateReportPdf,
  reportStyles as s,
} from '../../components/reports/reportShared';
import {
  CriteriaBreakdown,
  Dialog,
  ParticipantDialog,
  ParticipantStatus,
  RankBadge,
  StatTile,
} from '../../components/reports/ScoreDetails';
import useEventReport from '../../hooks/useEventReport';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import { callAiProxy } from '../../services/criteriaApiService';
import { formatReportDate, formatScore } from '../../utils/eventReport';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'bi bi-grid' },
  { id: 'participants', label: 'Participants', icon: 'bi bi-people' },
  { id: 'scores', label: 'Judge Scores', icon: 'bi bi-table' },
  { id: 'rankings', label: 'Rankings', icon: 'bi bi-trophy' },
  { id: 'criteria', label: 'Criteria Analysis', icon: 'bi bi-sliders' },
  { id: 'judges', label: 'Judge Analysis', icon: 'bi bi-person-badge' },
  { id: 'pdf', label: 'PDF Report', icon: 'bi bi-file-earmark-pdf' },
];

function Section({ title, subtitle, action, children, style }) {
  return (
    <section style={{ ...s.panel, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.heading}>{title}</h2>
          {subtitle && <p style={s.subheading}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {!subtitle && <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

function JudgeDialog({ report, judge, onClose }) {
  const rows = report.participants.filter((participant) => participant.byJudge[judge.key]);
  const missing = report.participants.filter((participant) => !participant.byJudge[judge.key]);
  return (
    <Dialog title={judge.name} subtitle={[judge.email, judge.assigned ? 'Assigned judge' : 'Not on the assigned panel'].filter(Boolean).join(' · ')} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
        <StatTile label="Participants scored" value={`${judge.scored} of ${judge.expected}`} hint={`${judge.completion.toFixed(0)}% complete`} />
        <StatTile label="Average given" value={formatScore(judge.average)} />
        <StatTile label="Highest given" value={formatScore(judge.highest)} />
        <StatTile label="Lowest given" value={formatScore(judge.lowest)} />
      </div>

      {judge.criteriaAverages.length > 0 && (
        <>
          <h3 style={{ ...s.heading, fontSize: 14, marginBottom: 10 }}>Average score per criterion</h3>
          <div style={{ ...s.tableWrap, marginBottom: 18 }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Criterion</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Average</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Max</th>
                </tr>
              </thead>
              <tbody>
                {judge.criteriaAverages.map((criterion) => (
                  <tr key={criterion.criterionId}>
                    <td style={s.td}>{criterion.name}</td>
                    <td style={{ ...s.td, ...s.num, fontWeight: 700, color: '#0f172a' }}>{formatScore(criterion.average)}</td>
                    <td style={{ ...s.td, ...s.num }}>{criterion.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={{ ...s.heading, fontSize: 14, marginBottom: 10 }}>Scores submitted</h3>
      {rows.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>This judge has not submitted any scores for this event.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={{ ...s.table, minWidth: 320 + report.criteria.length * 90 }}>
            <thead>
              <tr>
                <th style={s.th}>Participant</th>
                {report.criteria.map((criterion) => <th key={criterion.id} style={{ ...s.th, textAlign: 'right' }}>{criterion.name}</th>)}
                <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((participant) => (
                <tr key={participant.id}>
                  <td style={{ ...s.td, fontWeight: 600, color: '#0f172a' }}>{participant.name}</td>
                  {participant.byJudge[judge.key].breakdown.map((item) => <td key={item.criterionId} style={{ ...s.td, ...s.num }}>{item.score}</td>)}
                  <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(participant.byJudge[judge.key].total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <p style={{ fontSize: 13, color: '#b45309', margin: '14px 0 0' }}>
          <strong>Not yet scored ({missing.length}):</strong> {missing.map((participant) => participant.name).join(', ')}
        </p>
      )}
    </Dialog>
  );
}

function SortHeader({ label, column, sort, onSort, align = 'left' }) {
  const active = sort.key === column;
  return (
    <th style={{ ...s.th, textAlign: align }} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(column)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: active ? '#1d4ed8' : 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <i className={active ? (sort.dir === 'asc' ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill') : 'bi bi-chevron-expand'} style={{ fontSize: 10, opacity: active ? 1 : 0.5 }} />
      </button>
    </th>
  );
}

export default function OrganizerEventReport() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const fetchEvents = useEventStore((state) => state.fetchEvents);
  const eventsLoading = useEventStore((state) => state.loading);
  const { success, error } = useNotificationStore();
  const { event, report, loading } = useEventReport(id);

  const tab = TABS.some((entry) => entry.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rankFilter, setRankFilter] = useState('all');
  const [judgeFilter, setJudgeFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [expanded, setExpanded] = useState(() => new Set());
  const [participantId, setParticipantId] = useState(null);
  const [judgeKey, setJudgeKey] = useState(null);
  const [judgeSearch, setJudgeSearch] = useState('');
  const [pendingPdfMode, setPendingPdfMode] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
  }, [fetchEvents, user?.id]);

  useEffect(() => { setPage(1); }, [search, teamFilter, statusFilter, rankFilter, limit, tab]);

  const teams = useMemo(
    () => (report ? Array.from(new Set(report.participants.map((participant) => participant.team).filter(Boolean))).sort() : []),
    [report]
  );

  const filtered = useMemo(() => {
    if (!report) return [];
    const term = search.trim().toLowerCase();
    const list = report.participants
      .filter((participant) => !term || participant.name.toLowerCase().includes(term) || String(participant.number || '').includes(term) || participant.team.toLowerCase().includes(term))
      .filter((participant) => teamFilter === 'all' || participant.team === teamFilter)
      .filter((participant) => statusFilter === 'all' || participant.status === statusFilter)
      .filter((participant) => rankFilter === 'all' || (participant.rank && participant.rank <= Number(rankFilter)));

    const direction = sort.dir === 'asc' ? 1 : -1;
    const value = (participant) => {
      if (sort.key === 'name') return participant.name.toLowerCase();
      if (sort.key === 'team') return participant.team.toLowerCase();
      if (sort.key === 'number') return Number(participant.number) || Number.MAX_SAFE_INTEGER;
      return participant[sort.key];
    };
    return [...list].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      // Unranked / unscored rows always sink to the bottom, whichever way the column is sorted.
      if (a === null || a === undefined) return (b === null || b === undefined) ? 0 : 1;
      if (b === null || b === undefined) return -1;
      if (typeof a === 'string') return a.localeCompare(b) * direction;
      return (a - b) * direction;
    });
  }, [rankFilter, report, search, sort, statusFilter, teamFilter]);

  const visible = filtered.slice((page - 1) * limit, page * limit);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

  if (!event) {
    return (
      <DashboardLayout title="Event Report" subtitle="Reports">
        <div style={s.panel}>
          {loading || eventsLoading ? <ReportLoading /> : (
            <ReportEmptyState icon="bi bi-exclamation-circle" title="Event not found">
              This event does not exist or is not one of your events. <Link to="/organizer/reports" style={{ color: '#2563eb', fontWeight: 700 }}>Back to all reports</Link>
            </ReportEmptyState>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const { info, stats } = report;
  const selectTab = (next) => setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  const onSort = (key) => setSort((current) => (current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'team' || key === 'rank' || key === 'number' ? 'asc' : 'desc' }));
  const toggleExpanded = (participantKey) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(participantKey)) next.delete(participantKey); else next.add(participantKey);
    return next;
  });
  const selectedParticipant = report.participants.find((participant) => participant.id === participantId) || null;
  const selectedJudge = report.judgeAnalysis.find((judge) => judge.key === judgeKey) || null;
  const matrixJudges = judgeFilter === 'all' ? report.judges : report.judges.filter((judge) => judge.key === judgeFilter);
  const hasScores = report.evaluations.length > 0;

  const runPdf = async (mode) => {
    setPdfBusy(true);
    try {
      await generateReportPdf(report, { mode, user });
      success(mode === 'print' ? 'Report opened for printing.' : `${report.reportStatus === 'final' ? 'Official' : 'Preliminary'} PDF report downloaded.`);
    } catch (pdfError) {
      console.error('Report PDF failed:', pdfError);
      error('Could not generate the PDF report. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };
  const requestPdf = (mode) => (report.reportStatus === 'final' ? runPdf(mode) : setPendingPdfMode(mode));

  const exportCsv = () => {
    if (!hasScores) { error('There are no submitted scores to export yet.'); return; }
    downloadReportCsv(report);
    success('Scoring data exported as CSV.');
  };
  const exportJson = () => {
    downloadReportJson(report);
    success('Report data exported as JSON.');
  };

  const generateNarrative = async () => {
    setAiBusy(true);
    setAiReport('');
    try {
      const json = await callAiProxy({
        model: import.meta.env.VITE_AI_CHATBOT_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You write concise, factual event result summaries for an event management system. Use only the figures provided. Write three short paragraphs: results and winners, judging and scoring statistics, and attendance. Do not invent names, numbers or opinions.' },
          { role: 'user', content: `Write the summary for: ${JSON.stringify({
            title: info.title, category: info.category, status: info.status, reportStatus: report.reportStatus,
            maxScore: stats.maxScore, participants: stats.totalParticipants, judges: stats.totalJudges,
            evaluations: `${stats.completedEvaluations} of ${stats.expectedEvaluations}`, averageScore: stats.averageScore,
            top: report.ranked.slice(0, 5).map((participant) => ({ rank: participant.rank, name: participant.name, final: participant.final })),
            tournamentChampions: report.tournament.champions, attendance: report.attendance,
          })}` },
        ],
      });
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response');
      setAiReport(content);
    } catch (aiError) {
      console.warn('AI summary failed:', aiError);
      error('The AI summary is unavailable right now. The figures on this page are unaffected.');
    } finally {
      setAiBusy(false);
    }
  };

  const filterBar = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search participant, number or team" aria-label="Search participants" style={{ ...s.field, width: '100%', boxSizing: 'border-box', paddingLeft: 34 }} />
      </div>
      {teams.length > 0 && (
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Team" style={s.field}>
          <option value="all">All teams / organizations</option>
          {teams.map((team) => <option key={team} value={team}>{team}</option>)}
        </select>
      )}
      <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)} aria-label="Rank" style={s.field}>
        <option value="all">All ranks</option>
        <option value="3">Top 3</option>
        <option value="5">Top 5</option>
        <option value="10">Top 10</option>
      </select>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Scoring status" style={s.field}>
        <option value="all">All statuses</option>
        {['Scored', 'Partially scored', 'Not scored', 'Eliminated'].map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      {tab === 'scores' && report.judges.length > 1 && (
        <select value={judgeFilter} onChange={(e) => setJudgeFilter(e.target.value)} aria-label="Judge" style={s.field}>
          <option value="all">All judges</option>
          {report.judges.map((judge) => <option key={judge.key} value={judge.key}>{judge.name}</option>)}
        </select>
      )}
    </div>
  );

  const noParticipants = (
    <ReportEmptyState icon="bi bi-people" title="No participants yet">
      This event has no participants on its roster. Results will appear here once participants are added and judges submit their scores.
    </ReportEmptyState>
  );
  const noMatches = (
    <ReportEmptyState icon="bi bi-funnel" title="No participants match these filters">
      Try a different search term or reset the filters.
    </ReportEmptyState>
  );
  const pagination = filtered.length > limit || limit !== 25
    ? <PaginationControls page={page} totalPages={totalPages} limit={limit} totalItems={filtered.length} onPageChange={setPage} onLimitChange={setLimit} />
    : <div style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>Showing {filtered.length} of {report.participants.length} participants</div>;

  return (
    <DashboardLayout title={info.title} subtitle={`Event report · ${info.category}`}>
      <ConfirmDialog
        open={Boolean(pendingPdfMode)}
        danger={false}
        title={report.reportStatus === 'pending' ? 'This event has no results yet' : 'Generate a preliminary report?'}
        message={report.reportStatus === 'pending'
          ? 'No scores or completed matches have been recorded. The PDF will contain event information only.'
          : 'This event has not been finalized, so scores and rankings may still change. The PDF will be clearly marked as preliminary.'}
        confirmLabel={pendingPdfMode === 'print' ? 'Print anyway' : 'Generate PDF'}
        onCancel={() => setPendingPdfMode(null)}
        onConfirm={() => { const mode = pendingPdfMode; setPendingPdfMode(null); runPdf(mode); }}
      />
      {selectedParticipant && <ParticipantDialog report={report} participant={selectedParticipant} onClose={() => setParticipantId(null)} />}
      {selectedJudge && <JudgeDialog report={report} judge={selectedJudge} onClose={() => setJudgeKey(null)} />}

      {/* ---- Header ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/organizer/reports" style={{ ...s.secondaryButton, background: '#ffffff', borderColor: '#e2e8f0', color: '#475569', textDecoration: 'none' }}>
            <i className="bi bi-arrow-left" /> All reports
          </Link>
          <EventStatusBadge status={info.status} />
          <ReportStatusBadge status={report.reportStatus} />
          {loading && <span style={{ fontSize: 12, color: '#64748b' }}><i className="bi bi-arrow-repeat animate-spin" /> Refreshing…</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={exportCsv} style={s.secondaryButton}><i className="bi bi-filetype-csv" /> Export CSV</button>
          <button type="button" onClick={() => requestPdf('print')} disabled={pdfBusy} style={s.secondaryButton}><i className="bi bi-printer" /> Print Report</button>
          <button type="button" onClick={() => requestPdf('download')} disabled={pdfBusy} style={{ ...s.primaryButton, opacity: pdfBusy ? 0.6 : 1 }}>
            <i className={pdfBusy ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-file-earmark-pdf'} /> Generate PDF Report
          </button>
        </div>
      </div>

      {report.reportStatus !== 'final' && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: report.reportStatus === 'pending' ? '#f8fafc' : '#fffbeb', border: `1px solid ${report.reportStatus === 'pending' ? '#e2e8f0' : '#fde68a'}`, color: report.reportStatus === 'pending' ? '#475569' : '#92400e', fontSize: 13, lineHeight: 1.55 }}>
          <i className={report.reportStatus === 'pending' ? 'bi bi-info-circle' : 'bi bi-exclamation-triangle'} style={{ marginTop: 2 }} />
          <div>
            {report.reportStatus === 'pending'
              ? 'Reports will become available once the event has been completed and all required evaluations have been submitted. No scores or match results have been recorded yet.'
              : `This is a preliminary report. The event has not been finalized${report.isJudged && stats.pendingEvaluations > 0 ? ` and ${stats.pendingEvaluations} evaluation${stats.pendingEvaluations === 1 ? ' is' : 's are'} still pending` : ''}, so scores and rankings may change. Finalize the event from Live Scoring to lock the results.`}
          </div>
        </div>
      )}

      {/* ---- Tabs ---- */}
      <div role="tablist" aria-label="Report sections" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
        {TABS.map((entry) => {
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(entry.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569' }}
            >
              <i className={entry.icon} /> {entry.label}
            </button>
          );
        })}
      </div>

      {/* =========================== OVERVIEW =========================== */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Section title={info.isCompleted ? 'Event completed' : 'Event summary'} subtitle={info.isCompleted ? 'Final results as locked when the event was finalized.' : 'Current standing based on the scores submitted so far.'}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <StatTile label="Registered participants" value={stats.totalParticipants} hint={stats.totalTeams ? `${stats.totalTeams} team${stats.totalTeams === 1 ? '' : 's'}` : undefined} />
              <StatTile label="Judges in this event" value={stats.totalJudges} />
              {report.isJudged ? (
                <>
                  <StatTile label="Evaluations completed" value={`${stats.completedEvaluations} / ${stats.expectedEvaluations}`} hint={stats.pendingEvaluations ? `${stats.pendingEvaluations} pending` : stats.expectedEvaluations ? 'All submitted' : undefined} />
                  <StatTile label="Average score" value={formatScore(stats.averageScore)} hint={stats.maxScore ? `out of ${formatScore(stats.maxScore)}` : undefined} />
                </>
              ) : (
                <>
                  <StatTile label="Matches completed" value={`${report.tournament.completedMatches} / ${report.tournament.totalMatches}`} />
                  <StatTile label="Rounds" value={report.tournament.totalRounds || '—'} />
                </>
              )}
              <StatTile label={info.isCompleted ? 'Champion' : 'Current leader'} value={report.champion || 'TBD'} hint={report.ranked[0] ? `Final score ${formatScore(report.ranked[0].final)}` : undefined} />
            </div>
          </Section>

          <Section title="Event information">
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 24px', margin: 0 }}>
              {[
                ['Event name', info.title],
                ['Category', info.category],
                ['Starts', formatReportDate(info.start, true)],
                ['Ends', formatReportDate(info.end, true)],
                ['Venue', info.venue || 'Not set'],
                ['Event status', <EventStatusBadge key="status" status={info.status} />],
                ['Completion', info.completionLabel],
                ['Scoring method', info.scoringMethod || (report.isTournament ? 'Bracket results' : '—')],
                ...(report.tournament.brackets.length ? [['Matches', `${report.tournament.completedMatches} of ${report.tournament.totalMatches} completed`], ['Rounds', report.tournament.totalRounds || '—']] : []),
                ...(info.audienceEnabled ? [['Audience impact', `${info.audienceWeight}% of the final score`]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: 0 }}>
                  <dt style={{ fontSize: 12, color: '#64748b', marginBottom: 3 }}>{label}</dt>
                  <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {report.isJudged && (
            <Section title="Event statistics" subtitle={stats.maxScore ? `All scores are on a ${formatScore(stats.maxScore)}-point scale, weighted by the event's criteria.` : undefined}>
              {!hasScores ? (
                <ReportEmptyState icon="bi bi-clipboard-data" title="No scores submitted yet">
                  Statistics will appear as soon as judges submit their first evaluations.
                </ReportEmptyState>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
                    <StatTile label="Scores submitted" value={stats.scoresSubmitted} hint={`${stats.lockedEvaluations} locked`} />
                    <StatTile label="Pending evaluations" value={stats.pendingEvaluations} />
                    <StatTile label="Highest score" value={formatScore(stats.highestScore)} hint={stats.highestParticipant?.name} />
                    <StatTile label="Lowest score" value={formatScore(stats.lowestScore)} hint={stats.lowestParticipant?.name} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ ...s.heading, fontSize: 14 }}>Final score by participant</h3>
                      <p style={{ ...s.subheading, marginBottom: 8 }}>In ranking order. Scroll to see everyone.</p>
                      <RankedBars data={report.ranked.map((participant) => ({ name: `${participant.rank}. ${participant.name}`, value: participant.final }))} valueLabel="Final score" max={stats.maxScore} formatValue={formatScore} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ ...s.heading, fontSize: 14 }}>Score distribution</h3>
                      <p style={{ ...s.subheading, marginBottom: 8 }}>Number of participants in each final-score range.</p>
                      <ColumnBars data={stats.distribution.map((bin) => ({ name: bin.label, value: bin.count }))} valueLabel="Participants" />
                    </div>
                  </div>
                </>
              )}
            </Section>
          )}

          {report.tournament.brackets.length > 0 && (
            <Section title="Bracket results" subtitle="Match results recorded in the event's brackets.">
              <div style={{ display: 'grid', gap: 16 }}>
                {report.tournament.brackets.map((bracket) => (
                  <div key={bracket.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <strong style={{ color: '#0f172a' }}>{bracket.title}</strong>
                      <span style={{ fontSize: 13, color: '#475569' }}>Champion: <strong style={{ color: '#0f172a' }}>{bracket.champion || 'TBD'}</strong></span>
                    </div>
                    {bracket.matches.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#64748b' }}>No matches have been generated for this bracket yet.</div>
                    ) : (
                      <div style={s.tableWrap}>
                        <table style={{ ...s.table, minWidth: 560 }}>
                          <thead>
                            <tr>
                              <th style={s.th}>Round</th><th style={s.th}>Match</th><th style={{ ...s.th, textAlign: 'right' }}>Score</th><th style={s.th}>Winner</th><th style={s.th}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bracket.matches.map((match) => (
                              <tr key={match.id}>
                                <td style={s.td}>{match.round || '—'}</td>
                                <td style={{ ...s.td, color: '#0f172a' }}>{match.team1} vs {match.team2}</td>
                                <td style={{ ...s.td, ...s.num }}>{match.status === 'completed' ? `${match.score1 ?? 0} – ${match.score2 ?? 0}` : '—'}</td>
                                <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>{match.winner || '—'}</td>
                                <td style={{ ...s.td, textTransform: 'capitalize' }}>{match.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Section title="Attendance" subtitle={report.attendance?.total ? 'People who checked in at the venue by scanning their QR code.' : 'No one has checked in yet. These numbers go up as people scan their QR code at the venue.'}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <StatTile label="Everyone checked in" value={report.attendance?.total || 0} />
                <StatTile label="Participants checked in" value={report.attendance?.participants || 0} />
                <StatTile label="Audience checked in" value={report.attendance?.audience || 0} />
                <StatTile label="Judges checked in" value={report.attendance?.judges || 0} />
              </div>
            </Section>
            <Section title="Approval workflow">
              {(event.approvalWorkflow || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b' }}>No approval steps are recorded for this event.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {event.approvalWorkflow.map((step) => (
                    <div key={step.role} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{step.label}</span>
                      <span style={{ color: '#475569', textTransform: 'capitalize', textAlign: 'right' }}>{step.status}{step.actedByName ? ` · ${step.actedByName}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <Section
            title="AI summary"
            subtitle="A written summary generated from the figures on this page. Review it before sharing."
            action={(
              <button type="button" onClick={generateNarrative} disabled={aiBusy || report.reportStatus === 'pending'} style={{ ...s.secondaryButton, opacity: aiBusy || report.reportStatus === 'pending' ? 0.6 : 1 }}>
                <i className={aiBusy ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-stars'} /> {aiBusy ? 'Writing…' : aiReport ? 'Regenerate' : 'Generate summary'}
              </button>
            )}
          >
            {aiReport
              ? <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', color: '#334155', fontSize: 14, lineHeight: 1.65 }}>{aiReport}</div>
              : <div style={{ fontSize: 13, color: '#64748b' }}>{report.reportStatus === 'pending' ? 'Available once the event has results.' : 'No summary generated yet.'}</div>}
          </Section>
        </div>
      )}

      {/* =========================== PARTICIPANTS =========================== */}
      {tab === 'participants' && (
        <Section title="Participant results" subtitle="Select a participant to see their complete scoring history.">
          {report.participants.length === 0 ? noParticipants : (
            <>
              {filterBar}
              {filtered.length === 0 ? noMatches : (
                <>
                  <div style={s.tableWrap}>
                    <table style={{ ...s.table, minWidth: 940 }}>
                      <thead>
                        <tr>
                          <SortHeader label="Rank" column="rank" sort={sort} onSort={onSort} />
                          <SortHeader label="No." column="number" sort={sort} onSort={onSort} />
                          <SortHeader label="Participant" column="name" sort={sort} onSort={onSort} />
                          <SortHeader label="Team / organization" column="team" sort={sort} onSort={onSort} />
                          {report.isJudged ? (
                            <>
                              <SortHeader label="Total" column="total" sort={sort} onSort={onSort} align="right" />
                              <SortHeader label="Average" column="average" sort={sort} onSort={onSort} align="right" />
                              <SortHeader label="Final" column="final" sort={sort} onSort={onSort} align="right" />
                            </>
                          ) : (
                            <>
                              <th style={s.th}>Bracket</th>
                              <th style={{ ...s.th, textAlign: 'right' }}>Win–loss</th>
                            </>
                          )}
                          <th style={s.th}>Placement / award</th>
                          <th style={s.th}>Status</th>
                          <th style={s.th} aria-label="Details" />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((participant) => (
                          <tr key={participant.id} onClick={() => setParticipantId(participant.id)} style={{ cursor: 'pointer', background: participant.rank && participant.rank <= 3 ? '#f8fbff' : undefined }}>
                            <td style={s.td}><RankBadge rank={participant.rank} /></td>
                            <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{participant.number || '—'}</td>
                            <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>{participant.name}</td>
                            <td style={s.td}>{participant.team || '—'}</td>
                            {report.isJudged ? (
                              <>
                                <td style={{ ...s.td, ...s.num }}>{formatScore(participant.total)}</td>
                                <td style={{ ...s.td, ...s.num }}>{formatScore(participant.average)}</td>
                                <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(participant.final)}</td>
                              </>
                            ) : (
                              <>
                                <td style={s.td}>{participant.bracket || '—'}</td>
                                <td style={{ ...s.td, ...s.num }}>{participant.record || '—'}</td>
                              </>
                            )}
                            <td style={s.td}>{participant.rank ? [participant.placement, participant.award].filter(Boolean).join(' · ') : '—'}</td>
                            <td style={s.td}><ParticipantStatus status={participant.status} /></td>
                            <td style={{ ...s.td, textAlign: 'right' }}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setParticipantId(participant.id); }} style={{ ...s.secondaryButton, padding: '6px 10px', fontSize: 12 }}>View details</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pagination}
                </>
              )}
            </>
          )}
        </Section>
      )}

      {/* =========================== JUDGE SCORES =========================== */}
      {tab === 'scores' && (
        <Section title="Judge score breakdown" subtitle="Each judge's weighted total for every participant. Expand a row to see the criterion scores behind it.">
          {report.participants.length === 0 ? noParticipants : report.judges.length === 0 ? (
            <ReportEmptyState icon="bi bi-person-badge" title="No judges yet">
              No judges are assigned to this event and no scores have been submitted. Assign judges from the Judges page to start scoring.
            </ReportEmptyState>
          ) : (
            <>
              {filterBar}
              {filtered.length === 0 ? noMatches : (
                <>
                  <div style={s.tableWrap}>
                    <table style={{ ...s.table, minWidth: 520 + matrixJudges.length * 120 }}>
                      <thead>
                        <tr>
                          <th style={{ ...s.th, width: 36 }} aria-label="Expand" />
                          <SortHeader label="Rank" column="rank" sort={sort} onSort={onSort} />
                          <SortHeader label="Participant" column="name" sort={sort} onSort={onSort} />
                          {matrixJudges.map((judge) => <th key={judge.key} style={{ ...s.th, textAlign: 'right' }}>{judge.name}</th>)}
                          <SortHeader label="Total" column="total" sort={sort} onSort={onSort} align="right" />
                          <SortHeader label="Average" column="average" sort={sort} onSort={onSort} align="right" />
                          <SortHeader label="Final" column="final" sort={sort} onSort={onSort} align="right" />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((participant) => {
                          const open = expanded.has(participant.id);
                          return (
                            <Fragment key={participant.id}>
                              <tr onClick={() => toggleExpanded(participant.id)} style={{ cursor: 'pointer' }}>
                                <td style={s.td}>
                                  <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} criteria scores for ${participant.name}`} onClick={(e) => { e.stopPropagation(); toggleExpanded(participant.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                                    <i className={open ? 'bi bi-chevron-down' : 'bi bi-chevron-right'} />
                                  </button>
                                </td>
                                <td style={s.td}><RankBadge rank={participant.rank} /></td>
                                <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>
                                  {participant.name}
                                  {participant.team && <div style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>{participant.team}</div>}
                                </td>
                                {matrixJudges.map((judge) => (
                                  <td key={judge.key} style={{ ...s.td, ...s.num, color: participant.byJudge[judge.key] ? '#334155' : '#cbd5e1' }}>
                                    {participant.byJudge[judge.key] ? formatScore(participant.byJudge[judge.key].total) : '—'}
                                  </td>
                                ))}
                                <td style={{ ...s.td, ...s.num }}>{formatScore(participant.total)}</td>
                                <td style={{ ...s.td, ...s.num }}>{formatScore(participant.average)}</td>
                                <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(participant.final)}</td>
                              </tr>
                              {open && (
                                <tr>
                                  <td colSpan={6 + matrixJudges.length} style={{ padding: 16, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <CriteriaBreakdown report={report} participant={participant} />
                                    {participant.audienceAverage !== null && (
                                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                                        Final score also includes the audience average of {formatScore(participant.audienceAverage)} ({report.info.audienceWeight}% weight).
                                      </div>
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
                  {pagination}
                </>
              )}
            </>
          )}
        </Section>
      )}

      {/* =========================== RANKINGS =========================== */}
      {tab === 'rankings' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {report.ranked.length > 0 && report.tournament.brackets.length <= 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {[...report.ranked].sort((left, right) => left.rank - right.rank).slice(0, 3).map((participant) => (
                <button key={participant.id} type="button" onClick={() => setParticipantId(participant.id)} style={{ ...s.panel, textAlign: 'left', cursor: 'pointer', borderColor: participant.rank === 1 ? '#93c5fd' : '#dbeafe', borderTop: `4px solid ${participant.rank === 1 ? '#1d4ed8' : participant.rank === 2 ? '#60a5fa' : '#bfdbfe'}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{participant.placement}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '6px 0 2px', overflowWrap: 'anywhere' }}>{participant.name}</div>
                  <div style={{ fontSize: 13, color: '#64748b', minHeight: 18 }}>{[participant.award, participant.team].filter(Boolean).join(' · ')}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{participant.final !== null ? formatScore(participant.final) : participant.record}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{participant.final !== null ? `Final score${stats.maxScore ? ` out of ${formatScore(stats.maxScore)}` : ''}` : 'Win–loss record'}</div>
                </button>
              ))}
            </div>
          )}

          <Section
            title={info.isCompleted ? 'Final rankings' : 'Current rankings'}
            subtitle={!report.isJudged
              ? 'Placement follows how far each team went in its bracket. Teams knocked out in the same round are ordered by how close their last game was.'
              : info.audienceEnabled
                ? `Final score = judges' average (${100 - info.audienceWeight}%) + audience average (${info.audienceWeight}%). Ranked highest to lowest.`
                : "Final score is the average of the judges' weighted totals. Ranked highest to lowest."}
          >
            {report.participants.length === 0 ? noParticipants : report.ranked.length === 0 ? (
              <ReportEmptyState icon="bi bi-trophy" title="No rankings yet">
                {report.isJudged
                  ? 'Rankings are calculated automatically once judges submit scores for this event.'
                  : 'Placements appear once every match in the bracket has been played.'}
              </ReportEmptyState>
            ) : (
              <>
                {filterBar}
                {filtered.length === 0 ? noMatches : (
                  <>
                    <div style={s.tableWrap}>
                      <table style={{ ...s.table, minWidth: 820 }}>
                        <thead>
                          <tr>
                            <SortHeader label="Rank" column="rank" sort={sort} onSort={onSort} />
                            <SortHeader label="Participant" column="name" sort={sort} onSort={onSort} />
                            <SortHeader label="Team" column="team" sort={sort} onSort={onSort} />
                            {report.isJudged ? (
                              <>
                                <SortHeader label="Total" column="total" sort={sort} onSort={onSort} align="right" />
                                <SortHeader label="Average" column="average" sort={sort} onSort={onSort} align="right" />
                                <SortHeader label="Final" column="final" sort={sort} onSort={onSort} align="right" />
                              </>
                            ) : (
                              <>
                                <th style={s.th}>Bracket</th>
                                <th style={{ ...s.th, textAlign: 'right' }}>Win–loss</th>
                              </>
                            )}
                            <th style={s.th}>Placement</th>
                            <th style={s.th}>Award</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((participant) => (
                            <tr key={participant.id} onClick={() => setParticipantId(participant.id)} style={{ cursor: 'pointer', background: participant.rank && participant.rank <= 3 ? '#f8fbff' : undefined }}>
                              <td style={s.td}><RankBadge rank={participant.rank} /></td>
                              <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>{participant.name}</td>
                              <td style={s.td}>{participant.team || '—'}</td>
                              {report.isJudged ? (
                                <>
                                  <td style={{ ...s.td, ...s.num }}>{formatScore(participant.total)}</td>
                                  <td style={{ ...s.td, ...s.num }}>{formatScore(participant.average)}</td>
                                  <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(participant.final)}</td>
                                </>
                              ) : (
                                <>
                                  <td style={s.td}>{participant.bracket || '—'}</td>
                                  <td style={{ ...s.td, ...s.num }}>{participant.record || '—'}</td>
                                </>
                              )}
                              <td style={s.td}>{participant.placement}</td>
                              <td style={{ ...s.td, fontWeight: participant.award ? 700 : 400, color: participant.award ? '#1d4ed8' : '#94a3b8' }}>{participant.award || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {pagination}
                  </>
                )}
              </>
            )}
          </Section>
        </div>
      )}

      {/* =========================== CRITERIA =========================== */}
      {tab === 'criteria' && (
        <Section title="Criteria analysis" subtitle="How participants scored on each criterion, averaged across every submitted evaluation.">
          {report.criteria.length === 0 ? (
            <ReportEmptyState icon="bi bi-sliders" title="No scoring criteria">
              This event does not use scoring criteria{report.isTournament ? ' — its results come from bracket matches' : ''}.
            </ReportEmptyState>
          ) : !hasScores ? (
            <ReportEmptyState icon="bi bi-clipboard-data" title="No scores submitted yet">
              Criteria averages will appear once judges submit evaluations. This event has {report.criteria.length} criteria set up.
            </ReportEmptyState>
          ) : (
            <>
              {report.strongestCriterion && report.weakestCriterion && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
                  <StatTile label="Highest average" value={report.strongestCriterion.name} hint={`${formatScore(report.strongestCriterion.average)} / ${report.strongestCriterion.max} (${report.strongestCriterion.percent.toFixed(1)}%)`} />
                  <StatTile label="Lowest average" value={report.weakestCriterion.name} hint={`${formatScore(report.weakestCriterion.average)} / ${report.weakestCriterion.max} (${report.weakestCriterion.percent.toFixed(1)}%)`} />
                </div>
              )}
              <h3 style={{ ...s.heading, fontSize: 14 }}>Average as a percentage of maximum points</h3>
              <p style={{ ...s.subheading, marginBottom: 8 }}>Shown as a percentage so criteria with different point ranges compare fairly.</p>
              <RankedBars data={report.criteriaAnalysis.map((criterion) => ({ name: criterion.name, value: criterion.percent ?? 0 }))} valueLabel="Average" max={100} formatValue={(value) => `${Number(value).toFixed(1)}%`} />
              <div style={{ ...s.tableWrap, marginTop: 18 }}>
                <table style={{ ...s.table, minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Criterion</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Weight</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Max points</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Average</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>% of max</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Highest</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Lowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.criteriaAnalysis.map((criterion) => (
                      <tr key={criterion.id}>
                        <td style={{ ...s.td, color: '#0f172a' }}>
                          <div style={{ fontWeight: 700 }}>{criterion.name}</div>
                          {criterion.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{criterion.description}</div>}
                        </td>
                        <td style={{ ...s.td, ...s.num }}>{criterion.weight}%</td>
                        <td style={{ ...s.td, ...s.num }}>{criterion.max}</td>
                        <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(criterion.average)} / {criterion.max}</td>
                        <td style={{ ...s.td, ...s.num }}>{criterion.percent === null ? '—' : `${criterion.percent.toFixed(1)}%`}</td>
                        <td style={{ ...s.td, ...s.num }}>{criterion.highest ?? '—'}</td>
                        <td style={{ ...s.td, ...s.num }}>{criterion.lowest ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      {/* =========================== JUDGE ANALYSIS =========================== */}
      {tab === 'judges' && (
        <Section title="Judge analysis" subtitle="Scoring activity for each judge. These figures describe what was submitted; they are not a measure of judging quality.">
          {report.judgeAnalysis.length === 0 ? (
            <ReportEmptyState icon="bi bi-person-badge" title="No judges yet">
              No judges are assigned to this event and no scores have been submitted.
            </ReportEmptyState>
          ) : (
            <>
              <div style={{ position: 'relative', maxWidth: 320, marginBottom: 14 }}>
                <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                <input value={judgeSearch} onChange={(e) => setJudgeSearch(e.target.value)} placeholder="Search judges" aria-label="Search judges" style={{ ...s.field, width: '100%', boxSizing: 'border-box', paddingLeft: 34 }} />
              </div>
              {hasScores && (
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ ...s.heading, fontSize: 14 }}>Average score given by each judge</h3>
                  <p style={{ ...s.subheading, marginBottom: 8 }}>{stats.maxScore ? `Out of ${formatScore(stats.maxScore)}.` : ''}</p>
                  <RankedBars data={report.judgeAnalysis.filter((judge) => judge.average !== null).map((judge) => ({ name: judge.name, value: judge.average }))} valueLabel="Average given" max={stats.maxScore} formatValue={formatScore} />
                </div>
              )}
              <div style={s.tableWrap}>
                <table style={{ ...s.table, minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Judge</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Participants scored</th>
                      <th style={s.th}>Completion</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Average given</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Highest</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Lowest</th>
                      <th style={s.th} aria-label="Details" />
                    </tr>
                  </thead>
                  <tbody>
                    {report.judgeAnalysis
                      .filter((judge) => !judgeSearch.trim() || judge.name.toLowerCase().includes(judgeSearch.trim().toLowerCase()))
                      .map((judge) => (
                        <tr key={judge.key} onClick={() => setJudgeKey(judge.key)} style={{ cursor: 'pointer' }}>
                          <td style={{ ...s.td, color: '#0f172a' }}>
                            <div style={{ fontWeight: 700 }}>{judge.name}</div>
                            {!judge.assigned && <div style={{ fontSize: 12, color: '#64748b' }}>Not on the assigned panel</div>}
                          </td>
                          <td style={{ ...s.td, ...s.num }}>{judge.scored} of {judge.expected}</td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${judge.completion}%`, background: '#2563eb' }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}>{judge.completion.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a' }}>{formatScore(judge.average)}</td>
                          <td style={{ ...s.td, ...s.num }}>{formatScore(judge.highest)}</td>
                          <td style={{ ...s.td, ...s.num }}>{formatScore(judge.lowest)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setJudgeKey(judge.key); }} style={{ ...s.secondaryButton, padding: '6px 10px', fontSize: 12 }}>View details</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      {/* =========================== PDF =========================== */}
      {tab === 'pdf' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Section title="Official PDF report" subtitle="A formatted report built from the same figures shown on this page.">
            <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              {[
                ['Page 1', 'Event information, event summary, overall statistics, criteria performance and judging activity'],
                ['Page 2', 'Final rankings, participant results and the judge score matrix'],
                ['Page 3 onward', 'Detailed judge scores per participant, criterion by criterion'],
              ].map(([label, text]) => (
                <div key={label} style={{ display: 'flex', gap: 12, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                  <strong style={{ color: '#0f172a', minWidth: 96, flexShrink: 0 }}>{label}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => requestPdf('download')} disabled={pdfBusy} style={{ ...s.primaryButton, padding: '12px 20px', fontSize: 14, opacity: pdfBusy ? 0.6 : 1 }}>
                <i className={pdfBusy ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-file-earmark-pdf'} /> Generate PDF Report
              </button>
              <button type="button" onClick={() => requestPdf('print')} disabled={pdfBusy} style={{ ...s.secondaryButton, padding: '12px 16px' }}><i className="bi bi-printer" /> Print Report</button>
            </div>
          </Section>

          <Section title="Report status">
            <dl style={{ display: 'grid', gap: 12, margin: '0 0 18px' }}>
              {[
                ['Status', <ReportStatusBadge key="status" status={report.reportStatus} />],
                ['Last generated', report.lastGeneratedAt ? formatReportDate(report.lastGeneratedAt, true) : 'Not generated yet'],
                ['Event completed', info.isCompleted ? formatReportDate(info.end) : 'Not yet'],
                ['Participants', stats.totalParticipants],
                ['Judges', stats.totalJudges],
                ['Evaluations', report.isJudged ? `${stats.completedEvaluations} of ${stats.expectedEvaluations} submitted` : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <dt style={{ color: '#64748b' }}>{label}</dt>
                  <dd style={{ margin: 0, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{value}</dd>
                </div>
              ))}
            </dl>
            <h3 style={{ ...s.heading, fontSize: 14, marginBottom: 10 }}>Export data</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={exportCsv} style={s.secondaryButton}><i className="bi bi-filetype-csv" /> Raw scores (CSV)</button>
              <button type="button" onClick={exportJson} style={s.secondaryButton}><i className="bi bi-filetype-json" /> Full report (JSON)</button>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 0', lineHeight: 1.5 }}>The CSV has one row per criterion score and opens in Excel or Google Sheets.</p>
          </Section>
        </div>
      )}
    </DashboardLayout>
  );
}

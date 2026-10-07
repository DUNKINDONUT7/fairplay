import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PaginationControls from '../../components/admin/PaginationControls';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useNotificationStore from '../../store/notificationStore';
import useScoreStore from '../../store/scoreStore';
import useTournamentStore from '../../store/tournamentStore';
import { composeEventReport, loadEventReportData } from '../../hooks/useEventReport';
import { formatReportDate } from '../../utils/eventReport';
import {
  EventStatusBadge,
  ReportEmptyState,
  ReportLoading,
  ReportStatusBadge,
  generateReportPdf,
  reportStyles as s,
} from '../../components/reports/reportShared';

const SORTS = {
  'date-desc': { label: 'Event date (newest)', compare: (a, b) => (b.dateValue - a.dateValue) },
  'date-asc': { label: 'Event date (oldest)', compare: (a, b) => (a.dateValue - b.dateValue) },
  'title-asc': { label: 'Event name (A–Z)', compare: (a, b) => a.title.localeCompare(b.title) },
  'participants-desc': { label: 'Most participants', compare: (a, b) => b.participants - a.participants },
  'generated-desc': { label: 'Recently generated', compare: (a, b) => (b.generatedValue - a.generatedValue) },
};

export default function OrganizerReports() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const scores = useScoreStore((state) => state.scores);
  const fetchScores = useScoreStore((state) => state.fetchScores);
  const assignments = useJudgeStore((state) => state.assignments);
  const judges = useJudgeStore((state) => state.judges);
  const fetchJudges = useJudgeStore((state) => state.fetchJudges);
  const tournaments = useTournamentStore((state) => state.tournaments);
  const fetchTournaments = useTournamentStore((state) => state.fetchTournaments);
  const { success, error } = useNotificationStore();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eventStatus, setEventStatus] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [busyId, setBusyId] = useState(null);
  const [pendingPdf, setPendingPdf] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      user?.id ? fetchEvents(user.id) : Promise.resolve(),
      fetchScores(undefined, { silent: true }),
      fetchJudges({ silent: true }),
      fetchTournaments(undefined, { silent: true }),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchEvents, fetchJudges, fetchScores, fetchTournaments, user?.id]);

  // Counts and status only — standings are computed on the report page and
  // in the PDF, where the audience votes for that event are loaded too.
  const rows = useMemo(() => events.map((event) => {
    const report = composeEventReport(event, { withStandings: false });
    return {
      id: event.id,
      title: event.title || 'Untitled Event',
      category: report.info.category,
      status: report.info.status,
      start: report.info.start,
      end: report.info.end,
      dateValue: report.info.start ? report.info.start.getTime() : 0,
      completedOn: report.info.isCompleted ? report.info.end : null,
      participants: report.stats.totalParticipants,
      judges: report.stats.totalJudges,
      evaluations: report.stats.completedEvaluations,
      expected: report.stats.expectedEvaluations,
      matches: report.tournament.totalMatches,
      completedMatches: report.tournament.completedMatches,
      isJudged: report.isJudged,
      reportStatus: report.reportStatus,
      lastGeneratedAt: report.lastGeneratedAt,
      generatedValue: report.lastGeneratedAt ? new Date(report.lastGeneratedAt).getTime() : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [events, scores, assignments, judges, tournaments]);

  const eventStatuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return rows
      .filter((row) => !term || row.title.toLowerCase().includes(term) || row.category.toLowerCase().includes(term))
      .filter((row) => eventStatus === 'all' || row.status === eventStatus)
      .filter((row) => reportStatus === 'all' || row.reportStatus === reportStatus)
      .filter((row) => (from === null || (row.dateValue && row.dateValue >= from)) && (to === null || (row.dateValue && row.dateValue <= to)))
      .sort(SORTS[sort].compare);
  }, [dateFrom, dateTo, eventStatus, reportStatus, rows, search, sort]);

  useEffect(() => { setPage(1); }, [search, eventStatus, reportStatus, dateFrom, dateTo, sort, limit]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const visible = filtered.slice((page - 1) * limit, page * limit);
  const hasFilters = Boolean(search || dateFrom || dateTo) || eventStatus !== 'all' || reportStatus !== 'all';

  const clearFilters = () => {
    setSearch('');
    setEventStatus('all');
    setReportStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  const runPdf = async (row) => {
    setBusyId(row.id);
    try {
      await loadEventReportData(row.id);
      const event = useEventStore.getState().getEventById(row.id);
      const report = composeEventReport(event);
      await generateReportPdf(report, { user });
      success(`${report.reportStatus === 'final' ? 'Official' : 'Preliminary'} report for "${row.title}" downloaded.`);
    } catch (pdfError) {
      console.error('Report PDF failed:', pdfError);
      error('Could not generate the PDF report. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePdf = (row) => {
    if (row.reportStatus === 'final') runPdf(row);
    else setPendingPdf(row);
  };

  const summary = [
    { label: 'Events', value: rows.length, icon: 'bi bi-calendar-event' },
    { label: 'Final reports', value: rows.filter((row) => row.reportStatus === 'final').length, icon: 'bi bi-patch-check' },
    { label: 'Preliminary', value: rows.filter((row) => row.reportStatus === 'preliminary').length, icon: 'bi bi-hourglass-split' },
    { label: 'Awaiting results', value: rows.filter((row) => row.reportStatus === 'pending').length, icon: 'bi bi-dash-circle' },
  ];

  return (
    <DashboardLayout title="Reports" subtitle="Official results, judge scoring and statistics for every event you organize">
      <ConfirmDialog
        open={Boolean(pendingPdf)}
        danger={false}
        title={pendingPdf?.reportStatus === 'pending' ? 'This event has no results yet' : 'Generate a preliminary report?'}
        message={pendingPdf?.reportStatus === 'pending'
          ? `"${pendingPdf?.title}" has no submitted scores or completed matches. The PDF will contain event information only.`
          : `"${pendingPdf?.title}" has not been finalized, so scores and rankings may still change. The PDF will be clearly marked as preliminary.`}
        confirmLabel="Generate PDF"
        onCancel={() => setPendingPdf(null)}
        onConfirm={() => { const row = pendingPdf; setPendingPdf(null); runPdf(row); }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        {summary.map((tile) => (
          <div key={tile.label} style={{ ...s.panel, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#eff6ff', color: '#2563eb', fontSize: 18, flexShrink: 0 }}>
              <i className={tile.icon} />
            </span>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{tile.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{tile.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={s.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h2 style={s.heading}>Event reports</h2>
            <p style={{ ...s.subheading, margin: 0 }}>Open an event to see its full results, or download the official PDF.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', gridColumn: 'span 2', minWidth: 0 }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events"
              aria-label="Search events"
              style={{ ...s.field, width: '100%', boxSizing: 'border-box', paddingLeft: 34 }}
            />
          </div>
          <select value={eventStatus} onChange={(event) => setEventStatus(event.target.value)} aria-label="Event status" style={s.field}>
            <option value="all">All event statuses</option>
            {eventStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
          </select>
          <select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)} aria-label="Report status" style={s.field}>
            <option value="all">All report statuses</option>
            <option value="final">Final</option>
            <option value="preliminary">Preliminary</option>
            <option value="pending">No results yet</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', minWidth: 0 }}>
            From
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} style={{ ...s.field, flex: 1 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', minWidth: 0 }}>
            To
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={{ ...s.field, flex: 1 }} />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort reports" style={s.field}>
            {Object.entries(SORTS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
          </select>
          {hasFilters && (
            <button type="button" onClick={clearFilters} style={{ ...s.secondaryButton, background: '#ffffff', borderColor: '#e2e8f0', color: '#475569' }}>
              <i className="bi bi-x-lg" /> Clear filters
            </button>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <ReportLoading label="Loading your events…" />
        ) : rows.length === 0 ? (
          <ReportEmptyState icon="bi bi-calendar-plus" title="No events yet">
            Reports are created per event. Once you create an event and judges start scoring, its report will appear here.
          </ReportEmptyState>
        ) : filtered.length === 0 ? (
          <ReportEmptyState icon="bi bi-funnel" title="No reports match these filters">
            Try a different search term or clear the filters to see every event.
          </ReportEmptyState>
        ) : (
          <>
            <div style={s.tableWrap}>
              <table style={{ ...s.table, minWidth: 1040 }}>
                <thead>
                  <tr>
                    <th style={s.th}>Event</th>
                    <th style={s.th}>Event date</th>
                    <th style={s.th}>Completed</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Participants</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Judges</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Evaluations</th>
                    <th style={s.th}>Report status</th>
                    <th style={s.th}>Last generated</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td style={s.td}>
                        <button
                          type="button"
                          onClick={() => navigate(`/organizer/reports/${row.id}`)}
                          style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#0f172a' }}
                        >
                          {row.title}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>{row.category}</span>
                          <EventStatusBadge status={row.status} />
                        </div>
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{formatReportDate(row.start)}</td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{row.completedOn ? formatReportDate(row.completedOn) : '—'}</td>
                      <td style={{ ...s.td, ...s.num }}>{row.participants}</td>
                      <td style={{ ...s.td, ...s.num }}>{row.judges}</td>
                      <td style={{ ...s.td, ...s.num }}>
                        {row.isJudged ? `${row.evaluations} / ${row.expected}` : row.matches ? `${row.completedMatches} / ${row.matches} matches` : '—'}
                      </td>
                      <td style={s.td}><ReportStatusBadge status={row.reportStatus} /></td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{row.lastGeneratedAt ? formatReportDate(row.lastGeneratedAt, true) : 'Not generated'}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <button type="button" onClick={() => navigate(`/organizer/reports/${row.id}`)} style={{ ...s.secondaryButton, padding: '7px 12px' }}>
                            <i className="bi bi-eye" /> View Report
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePdf(row)}
                            disabled={busyId === row.id}
                            title="Generate PDF report"
                            style={{ ...s.primaryButton, padding: '7px 12px', opacity: busyId === row.id ? 0.6 : 1, cursor: busyId === row.id ? 'wait' : 'pointer' }}
                          >
                            <i className={busyId === row.id ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-file-earmark-pdf'} /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls page={page} totalPages={totalPages} limit={limit} totalItems={filtered.length} onPageChange={setPage} onLimitChange={setLimit} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

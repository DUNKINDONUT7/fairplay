import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PaginationControls from '../../components/admin/PaginationControls';
import useAILogsStore from '../../store/aiLogsStore';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { buildAuditLogs, fetchAiDetections } from '../../services/adminDataService';

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || 'Unknown') : date.toLocaleString();
}

// Quotes every field and escapes embedded quotes/commas/newlines per RFC
// 4180 — a log's `action` or `reason` text is free-form and can contain any
// of those, so a naive join(',') would silently produce a corrupt CSV.
function toCsvField(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadLogsCsv(logs) {
  const headers = ['User', 'Action', 'Target', 'Timestamp', 'Source'];
  const rows = logs.map((log) => [
    log.user,
    log.action,
    log.target,
    formatTimestamp(log.timestamp),
    log.source,
  ]);
  // Leading BOM so Excel opens it as UTF-8 instead of guessing the wrong
  // codepage and mangling any accented characters.
  const csv = '﻿' + [headers, ...rows].map((row) => row.map(toCsvField).join(',')).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminAudit() {
  const { users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const { logs: aiLogs } = useAILogsStore();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [aiDetections, setAiDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debounce the search so filtering (over logs already loaded in memory)
  // doesn't re-run on every keystroke while the admin is still typing.
  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        await Promise.all([refreshProfiles(), fetchEvents(), fetchRegistrations(), fetchScores(), fetchAttendance()]);
        const detections = await fetchAiDetections({
          users,
          events,
          registrations,
          scores: Object.values(scores || {}),
          attendance,
        });
        if (active) setAiDetections(detections);
      } catch {
        if (active) setError('Unable to load audit data right now.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [fetchAttendance, fetchEvents, fetchRegistrations, fetchScores, refreshProfiles]);

  const logs = useMemo(() => buildAuditLogs({
    users,
    events,
    registrations,
    scores,
    attendance,
    aiLogs,
    aiDetections,
  }), [aiDetections, aiLogs, attendance, events, registrations, scores, users]);

  const sources = useMemo(() => ['all', ...Array.from(new Set(logs.map((log) => log.source).filter(Boolean))).sort()], [logs]);
  const filteredLogs = useMemo(() => {
    const bySource = sourceFilter === 'all' ? logs : logs.filter((log) => log.source === sourceFilter);
    if (!searchTerm) return bySource;
    return bySource.filter((log) => (
      String(log.user || '').toLowerCase().includes(searchTerm) ||
      String(log.action || '').toLowerCase().includes(searchTerm) ||
      String(log.target || '').toLowerCase().includes(searchTerm) ||
      String(log.source || '').toLowerCase().includes(searchTerm)
    ));
  }, [logs, sourceFilter, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / limit));
  const paginatedLogs = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    return filteredLogs.slice(start, start + limit);
  }, [filteredLogs, limit, page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [limit, sourceFilter, searchTerm]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <DashboardLayout title="Derived Activity Log" subtitle="Reconstructed from current record timestamps — not a tamper-evident audit trail">
      <div style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="bi bi-info-circle" />
        This list is inferred from existing records each time you open this page — there is no separate log table. If a record is edited or deleted, that action itself leaves no entry here.
      </div>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <p style={eyebrowStyle}>Activity</p>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Latest system actions</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by user, action, or target..."
              style={{ ...selectStyle, width: 260, paddingLeft: 34 }}
            />
          </div>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} style={selectStyle}>
            {sources.map((source) => <option key={source} value={source}>{source === 'all' ? 'All sources' : source}</option>)}
          </select>
          <button
            onClick={() => downloadLogsCsv(filteredLogs)}
            disabled={filteredLogs.length === 0}
            style={{ ...downloadButtonStyle, opacity: filteredLogs.length === 0 ? 0.5 : 1, cursor: filteredLogs.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <i className="bi bi-download" /> Download CSV
          </button>
        </div>
      </div>
      <div style={cardStyle}>
        {error ? <div style={errorStyle}>{error}</div> : null}
        {loading ? <div style={emptyCellStyle}>Loading audit logs...</div> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {['User', 'Action', 'Target', 'Timestamp', 'Source'].map((header) => (
                      <th key={header} style={thStyle}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length === 0 ? (
                    <tr><td colSpan="5" style={emptyCellStyle}>{searchTerm || sourceFilter !== 'all' ? 'No activity matches your search.' : 'No database activity found yet.'}</td></tr>
                  ) : paginatedLogs.map((log, index) => (
                    <tr key={`${log.source}-${log.timestamp}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{log.user}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{log.action}</td>
                      <td style={{ padding: '12px 16px' }}><span style={pillStyle}>{log.target}</span></td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{formatTimestamp(log.timestamp)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>{log.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls page={Math.min(page, totalPages)} totalPages={totalPages} limit={limit} totalItems={filteredLogs.length} onPageChange={setPage} onLimitChange={setLimit} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const eyebrowStyle = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 6 };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' };
const pillStyle = { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(37,99,235,0.12)', color: '#2563eb' };
const emptyCellStyle = { padding: 32, textAlign: 'center', color: '#94a3b8' };
const errorStyle = { marginBottom: 14, padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', fontWeight: 700, fontSize: 13 };
const selectStyle = { padding: '10px 14px', borderRadius: 12, border: '1px solid #dbeafe', background: '#ffffff', color: '#0f172a', fontSize: 13, outline: 'none' };
const downloadButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', fontSize: 13, fontWeight: 700 };

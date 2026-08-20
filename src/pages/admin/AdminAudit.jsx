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
  const [aiDetections, setAiDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
  const filteredLogs = useMemo(() => (
    sourceFilter === 'all' ? logs : logs.filter((log) => log.source === sourceFilter)
  ), [logs, sourceFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / limit));
  const paginatedLogs = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    return filteredLogs.slice(start, start + limit);
  }, [filteredLogs, limit, page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [limit, sourceFilter]);

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
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} style={selectStyle}>
          {sources.map((source) => <option key={source} value={source}>{source === 'all' ? 'All sources' : source}</option>)}
        </select>
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
                    <tr><td colSpan="5" style={emptyCellStyle}>No database activity found yet.</td></tr>
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

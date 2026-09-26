import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PaginationControls from '../../components/admin/PaginationControls';
import useAILogsStore from '../../store/aiLogsStore';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { buildAuditLogs, fetchAiDetections } from '../../services/adminDataService';
import { supabase } from '../../utils/supabaseClient';

const FETCH_LIMIT = 1000;

const TABLE_LABELS = {
  profiles: 'User',
  events: 'Event',
  teams: 'Team',
  registrations: 'Registration',
  scores: 'Score',
  judges: 'Judge',
  judge_assignments: 'Judge assignment',
  attendance: 'Attendance',
  certificates: 'Certificate',
  tournaments: 'Tournament',
  brackets: 'Bracket',
  matches: 'Match',
  rubric_templates: 'Rubric template',
  accounts: 'User',
  ai_logs: 'AI request',
  ai_detections: 'AI detection',
};

const ACTION_THEME = {
  insert: { label: 'Created', bg: '#dcfce7', fg: '#15803d' },
  update: { label: 'Updated', bg: '#dbeafe', fg: '#1d4ed8' },
  delete: { label: 'Deleted', bg: '#fee2e2', fg: '#b91c1c' },
  history: { label: 'Earlier record', bg: '#f1f5f9', fg: '#475569' },
};

// What each kind of earlier (pre-audit-log) record actually was.
function earlierActionTheme(log) {
  switch (log.source) {
    case 'accounts': return { label: 'Signed up', bg: '#dcfce7', fg: '#15803d' };
    case 'events': return { label: 'Created event', bg: '#dcfce7', fg: '#15803d' };
    case 'registrations': return { label: 'Registered', bg: '#dbeafe', fg: '#1d4ed8' };
    case 'scores': return { label: 'Scored', bg: '#ede9fe', fg: '#6d28d9' };
    case 'attendance': return { label: 'Checked in', bg: '#ccfbf1', fg: '#0f766e' };
    case 'ai_logs': return String(log.action || '').startsWith('Generated')
      ? { label: 'Used AI', bg: '#f3e8ff', fg: '#7e22ce' }
      : { label: 'AI failed', bg: '#fee2e2', fg: '#b91c1c' };
    case 'ai_detections': return { label: 'Flagged', bg: '#fef3c7', fg: '#b45309' };
    default: return ACTION_THEME.history;
  }
}

function isMissingTableError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || (message.includes('audit_log') && message.includes('not'));
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || 'Unknown') : date.toLocaleString();
}

function formatRelative(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'details changed';
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function humanizeField(field) {
  return String(field).replace(/_/g, ' ');
}

function toCsvField(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadLogsCsv(entries) {
  const headers = ['Timestamp', 'User', 'Role', 'Action', 'Area', 'Record', 'Changed fields'];
  const rows = entries.map((entry) => [
    formatTimestamp(entry.occurredAt),
    entry.actorLabel,
    entry.actorRole || '',
    entry.actionLabel,
    entry.areaLabel,
    entry.recordLabel,
    (entry.changedFields || []).join('; '),
  ]);
  // Leading BOM so Excel opens it as UTF-8 instead of mangling accented characters.
  const csv = '﻿' + [headers, ...rows].map((row) => row.map(toCsvField).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
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
  const [aiDetections, setAiDetections] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [actionFilter, setActionFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!supabase) {
      setError('FairPlay is not connected to Supabase.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('audit_log')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(FETCH_LIMIT);

    if (queryError) {
      if (isMissingTableError(queryError)) {
        setSetupNeeded(true);
      } else {
        setError('Unable to load the audit log right now.');
      }
      setRows([]);
    } else {
      setSetupNeeded(false);
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    load();
    // Records that existed before the audit log was switched on are rebuilt
    // from their own timestamps, the same way this page used to work.
    (async () => {
      await Promise.all([refreshProfiles(), fetchEvents(), fetchRegistrations(), fetchScores(), fetchAttendance()]).catch(() => {});
      const detections = await fetchAiDetections({
        users,
        events,
        registrations,
        scores: Object.values(scores || {}),
        attendance,
      }).catch(() => []);
      if (active) setAiDetections(detections);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshProfiles, fetchEvents, fetchRegistrations, fetchScores, fetchAttendance]);

  const earlierEntries = useMemo(() => {
    const oldestReal = rows.length > 0 ? new Date(rows[rows.length - 1].occurred_at).getTime() : Infinity;
    return buildAuditLogs({ users, events, registrations, scores, attendance, aiLogs, aiDetections })
      .filter((log) => {
        const time = new Date(log.timestamp).getTime();
        return !Number.isNaN(time) && time < oldestReal;
      })
      .map((log, index) => {
        const theme = earlierActionTheme(log);
        return {
        id: `earlier-${log.source}-${index}`,
        occurredAt: log.timestamp,
        action: 'history',
        actionLabel: theme.label,
        theme,
        earlier: true,
        actorLabel: log.user,
        actorSub: '',
        actorRole: '',
        area: log.source,
        areaLabel: log.target,
        recordLabel: log.action,
        changedFields: [],
        oldData: {},
        newData: {},
        };
      });
  }, [rows, users, events, registrations, scores, attendance, aiLogs, aiDetections]);

  const realEntries = useMemo(() => {
    const usersById = new Map(users.map((user) => [String(user.id), user]));
    return rows.map((row) => {
      const actor = row.actor_id ? usersById.get(String(row.actor_id)) : null;
      const theme = ACTION_THEME[row.action] || ACTION_THEME.update;
      return {
        id: row.id,
        occurredAt: row.occurred_at,
        action: row.action,
        actionLabel: theme.label,
        theme,
        actorLabel: row.actor_id ? (actor?.name || row.actor_email || 'Unknown user') : 'System',
        actorSub: row.actor_id ? (actor?.name && row.actor_email ? row.actor_email : '') : 'Automatic or server process',
        actorRole: actor?.role || row.actor_role || '',
        area: row.table_name,
        areaLabel: TABLE_LABELS[row.table_name] || row.table_name,
        recordLabel: row.summary || (row.record_id ? `#${row.record_id}` : '—'),
        changedFields: row.changed_fields || [],
        oldData: row.old_data || {},
        newData: row.new_data || {},
      };
    });
  }, [rows, users]);

  const entries = useMemo(() => [...realEntries, ...earlierEntries], [realEntries, earlierEntries]);

  const areas = useMemo(() => Array.from(new Set(entries.map((entry) => entry.area))).sort(), [entries]);

  const filtered = useMemo(() => entries.filter((entry) => {
    if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
    if (areaFilter !== 'all' && entry.area !== areaFilter) return false;
    if (!searchTerm) return true;
    return [entry.actorLabel, entry.actorSub, entry.areaLabel, entry.recordLabel, entry.actionLabel, ...entry.changedFields]
      .some((value) => String(value || '').toLowerCase().includes(searchTerm));
  }), [entries, actionFilter, areaFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * limit, currentPage * limit);

  useEffect(() => {
    setPage(1);
  }, [limit, actionFilter, areaFilter, searchTerm]);

  const counts = useMemo(() => entries.reduce((acc, entry) => {
    acc[entry.action] = (acc[entry.action] || 0) + 1;
    return acc;
  }, {}), [entries]);

  return (
    <DashboardLayout title="Audit Log" subtitle="Every create, edit, and delete across FairPlay, with who did it and when">
      {setupNeeded && (
        <div style={{ marginBottom: 18, padding: '14px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <i className="bi bi-database-exclamation" style={{ fontSize: 18 }} />
          <span style={{ flex: 1, minWidth: 240 }}>
            Live tracking isn't switched on yet, so only earlier records are shown. Run the <strong>Audit log</strong> section at the end of <code>supabase/schema.sql</code> in the Supabase SQL Editor to record every create, edit, and delete from now on.
          </span>
          <button onClick={load} style={secondaryButtonStyle}>
            <i className="bi bi-arrow-clockwise" /> Check again
          </button>
        </div>
      )}
      {(
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Total entries', value: entries.length, fg: '#0f172a' },
              { label: 'Created', value: counts.insert || 0, fg: ACTION_THEME.insert.fg },
              { label: 'Updated', value: counts.update || 0, fg: ACTION_THEME.update.fg },
              { label: 'Deleted', value: counts.delete || 0, fg: ACTION_THEME.delete.fg },
            ].map((stat) => (
              <div key={stat.label} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{stat.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.fg, marginTop: 6 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
              <div role="tablist" aria-label="Filter by action" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ value: 'all', label: 'All' }, ...Object.entries(ACTION_THEME).map(([value, theme]) => ({ value, label: theme.label }))].map((tab) => {
                  const active = actionFilter === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActionFilter(tab.value)}
                      style={{ padding: '7px 14px', borderRadius: 999, border: active ? '1px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#2563eb' : '#ffffff', color: active ? '#ffffff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <i className="bi bi-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search user, record, or field"
                    aria-label="Search audit log"
                    style={{ ...selectStyle, width: 240, paddingLeft: 34 }}
                  />
                </div>
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} style={selectStyle} aria-label="Filter by area">
                  <option value="all">All areas</option>
                  {areas.map((area) => <option key={area} value={area}>{TABLE_LABELS[area] || area}</option>)}
                </select>
                <button onClick={load} disabled={loading} style={{ ...secondaryButtonStyle, opacity: loading ? 0.6 : 1 }}>
                  <i className="bi bi-arrow-clockwise" /> Refresh
                </button>
                <button
                  onClick={() => downloadLogsCsv(filtered)}
                  disabled={filtered.length === 0}
                  style={{ ...downloadButtonStyle, opacity: filtered.length === 0 ? 0.5 : 1, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <i className="bi bi-download" /> CSV
                </button>
              </div>
            </div>

            {error ? <div style={errorStyle}>{error}</div> : null}
            {loading ? <div style={emptyCellStyle}>Loading audit log...</div> : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        {['When', 'User', 'Action', 'Record', 'Changes'].map((header) => (
                          <th key={header} style={thStyle}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={emptyCellStyle}>
                            {searchTerm || actionFilter !== 'all' || areaFilter !== 'all'
                              ? 'No entries match your filters.'
                              : 'No activity recorded yet. New creates, edits, and deletes will appear here.'}
                          </td>
                        </tr>
                      ) : paginated.map((entry) => {
                        const expanded = expandedId === entry.id;
                        const canExpand = entry.action === 'update' && entry.changedFields.length > 0;
                        return (
                          <Fragment key={entry.id}>
                            <tr style={{ borderBottom: expanded ? 'none' : '1px solid #f1f5f9' }}>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} title={formatTimestamp(entry.occurredAt)}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatRelative(entry.occurredAt)}</div>
                                <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatTimestamp(entry.occurredAt)}</div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{entry.actorLabel}</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                  {[entry.actorRole, entry.actorSub].filter(Boolean).join(' · ')}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <span style={{ ...pillBase, background: entry.theme.bg, color: entry.theme.fg }}>{entry.actionLabel}</span>
                                {entry.earlier && (
                                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }} title="Recorded before live audit tracking was switched on">
                                    <i className="bi bi-clock-history" style={{ marginRight: 4 }} />Earlier record
                                  </div>
                                )}
                              </td>
                              <td style={tdStyle}>
                                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{entry.areaLabel}</div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{entry.recordLabel}</div>
                              </td>
                              <td style={tdStyle}>
                                {canExpand ? (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                                    aria-expanded={expanded}
                                    style={{ border: 'none', background: 'none', padding: 0, color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                                  >
                                    {entry.changedFields.slice(0, 3).map(humanizeField).join(', ')}
                                    {entry.changedFields.length > 3 ? ` +${entry.changedFields.length - 3} more` : ''}
                                    <i className={expanded ? 'bi bi-chevron-up' : 'bi bi-chevron-down'} style={{ marginLeft: 6 }} />
                                  </button>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: 13 }}>{entry.action === 'insert' ? 'New record' : entry.action === 'delete' ? 'Record removed' : '—'}</span>
                                )}
                              </td>
                            </tr>
                            {expanded && (
                              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td colSpan="5" style={{ padding: '0 16px 16px' }}>
                                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                                    {entry.changedFields.map((field) => (
                                      <div key={field} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 12, fontSize: 13, alignItems: 'center' }}>
                                        <span style={{ color: '#64748b', fontWeight: 700, textTransform: 'capitalize' }}>{humanizeField(field)}</span>
                                        <span style={{ color: '#0f172a' }}>
                                          <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{formatValue(entry.oldData[field])}</span>
                                          <i className="bi bi-arrow-right" style={{ margin: '0 8px', color: '#94a3b8' }} />
                                          <span style={{ color: '#15803d', fontWeight: 700 }}>{formatValue(entry.newData[field])}</span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PaginationControls page={currentPage} totalPages={totalPages} limit={limit} totalItems={filtered.length} onPageChange={setPage} onLimitChange={setLimit} />
                {rows.length >= FETCH_LIMIT && (
                  <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8' }}>Showing the latest {FETCH_LIMIT} entries.</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' };
const tdStyle = { padding: '14px 16px', fontSize: 13, color: '#475569', verticalAlign: 'middle' };
const pillBase = { padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const emptyCellStyle = { padding: 40, textAlign: 'center', color: '#94a3b8' };
const errorStyle = { marginBottom: 14, padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', fontWeight: 700, fontSize: 13 };
const selectStyle = { padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontSize: 13, outline: 'none' };
const secondaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const downloadButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', fontSize: 13, fontWeight: 700 };

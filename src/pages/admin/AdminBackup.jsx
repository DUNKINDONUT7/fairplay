import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Download, AlertTriangle, Upload } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAILogsStore from '../../store/aiLogsStore';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { buildAuditLogs, buildSystemReport, fetchAiDetections, validateBackupPayload } from '../../services/adminDataService';
import { isSupabaseConfigured } from '../../utils/supabaseClient';

function exportSnapshot(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fairplay-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sizeOf(payload) {
  const bytes = new Blob([JSON.stringify(payload)]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scoresObject(rows = []) {
  return rows.reduce((acc, score) => {
    const key = score.id || `${score.eventId}_${score.judgeId}_${score.contestantId}`;
    acc[key] = score;
    return acc;
  }, {});
}

export default function AdminBackup() {
  const fileRef = useRef(null);
  const { users, refreshProfiles, authMode } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, assignments, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const { logs: aiLogs } = useAILogsStore();
  const [aiDetections, setAiDetections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingRestore, setPendingRestore] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await Promise.all([refreshProfiles(), fetchEvents(), fetchJudges(), fetchRegistrations(), fetchScores(), fetchAttendance()]);
        const detections = await fetchAiDetections({ users, events, registrations, scores: Object.values(scores || {}), attendance });
        if (active) setAiDetections(detections);
      } catch {
        if (active) setError('Unable to load all backup records.');
      }
    }
    load();
    return () => { active = false; };
  }, [fetchAttendance, fetchEvents, fetchJudges, fetchRegistrations, fetchScores, refreshProfiles]);

  const snapshot = useMemo(() => {
    const scoreRows = Object.values(scores || {});
    const auditLogs = buildAuditLogs({ users, events, registrations, scores: scoreRows, attendance, aiLogs, aiDetections });
    const reports = buildSystemReport({ users, events, registrations, scores: scoreRows, attendance, judges, aiDetections, auditLogs });
    return {
      backupVersion: 1,
      generatedAt: new Date().toISOString(),
      authMode,
      users,
      events,
      judges,
      judgeAssignments: assignments,
      registrations,
      scores: scoreRows,
      attendance,
      aiDetections,
      auditLogs,
      reports,
    };
  }, [aiDetections, aiLogs, assignments, attendance, authMode, events, judges, registrations, scores, users]);

  async function handleRestoreFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const validation = validateBackupPayload(payload);
      if (!validation.valid) throw new Error(validation.error);
      setPendingRestore(payload);
    } catch (restoreError) {
      setError(restoreError?.message || 'Invalid backup file. Restore was cancelled.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function applyRestore(payload) {
    useAuthStore.setState({ users: payload.users });
    useEventStore.setState({ events: payload.events });
    useRegistrationStore.setState({ registrations: payload.registrations });
    useScoreStore.setState({ scores: scoresObject(payload.scores) });
    useAttendanceStore.setState({ attendance: payload.attendance || [] });
    useJudgeStore.setState({ judges: payload.judges || [], assignments: payload.judgeAssignments || [] });
    setAiDetections(payload.aiDetections || []);
    setPendingRestore(null);
    setMessage(
      isSupabaseConfigured
        ? 'Backup loaded into this browser tab only — it has not been written to the database. Refreshing or navigating away will discard it.'
        : 'Backup restored to local demo data.'
    );
  }

  const backupRows = [
    { name: 'Current System Snapshot', date: snapshot.generatedAt, size: sizeOf(snapshot), type: 'JSON Backup', status: 'ready' },
  ];

  return (
    <DashboardLayout title="Backup & Restore" subtitle="Admin-only export and restore for important system data">
      <ConfirmDialog
        open={Boolean(pendingRestore)}
        title="Restore this backup?"
        message={
          isSupabaseConfigured
            ? 'This loads the backup into your current browser tab only — it does NOT write back to the database. The moment you navigate away or refresh, the app reloads real data from Supabase and this restored view is gone. Use this to inspect a backup, not as disaster recovery.'
            : 'This replaces the current in-browser demo data with the backup contents.'
        }
        confirmLabel="Restore"
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => applyRestore(pendingRestore)}
      />
      <div style={toolbarStyle}>
        <button onClick={() => { exportSnapshot(snapshot); setMessage('Backup downloaded.'); }} disabled={busy} style={primaryButtonStyle}>
          <Download size={16} />
          Download Backup
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={secondaryButtonStyle}>
          <Upload size={16} />
          Upload Restore File
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleRestoreFile} style={{ display: 'none' }} />
        <div style={warningStyle}>
          <AlertTriangle size={16} />
          Restore validates the file and asks for confirmation before changing data.
        </div>
      </div>

      {message ? <div style={successStyle}>{message}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              {['Backup Name', 'Generated', 'Size', 'Type', 'Status', 'Actions'].map((header) => (
                <th key={header} style={thStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {backupRows.map((backup) => (
              <tr key={backup.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={iconStyle}><Database size={14} /></span>
                  {backup.name}
                </td>
                <td style={tdStyle}>{new Date(backup.date).toLocaleString()}</td>
                <td style={tdStyle}>{backup.size}</td>
                <td style={{ padding: '12px 16px' }}><span style={pillStyle}>{backup.type}</span></td>
                <td style={{ padding: '12px 16px' }}><span style={statusStyle}>{backup.status}</span></td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => exportSnapshot(snapshot)} disabled={busy} style={downloadButtonStyle}>
                    <Download size={14} />
                    Export
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

const toolbarStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 24px rgba(15,23,42,0.06)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 };
const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(15,23,42,0.06)', overflowX: 'auto' };
const primaryButtonStyle = { padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 26px rgba(37,99,235,0.22)' };
const secondaryButtonStyle = { padding: '10px 18px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const warningStyle = { padding: '10px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', color: '#b45309', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' };
const tdStyle = { padding: '12px 16px', fontSize: 13, color: '#64748b' };
const iconStyle = { width: 28, height: 28, borderRadius: 8, background: 'rgba(37,99,235,0.12)', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const pillStyle = { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(37,99,235,0.12)', color: '#2563eb' };
const statusStyle = { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(37,99,235,0.12)', color: '#2563eb' };
const downloadButtonStyle = { padding: '6px 14px', borderRadius: 8, background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const successStyle = { marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)', color: '#15803d', fontWeight: 800 };
const errorStyle = { marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', fontWeight: 800 };

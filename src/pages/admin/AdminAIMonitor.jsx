import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { deriveAiDetections, fetchAiDetections, upsertAiDetections } from '../../services/adminDataService';

function riskColor(level) {
  if (level === 'high') return '#dc2626';
  if (level === 'medium') return '#b45309';
  return '#2563eb';
}

export default function AdminAIMonitor() {
  const { users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);
  const systemData = useMemo(() => ({ users, events, registrations, scores: scoreRows, attendance }), [attendance, events, registrations, scoreRows, users]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        await Promise.all([refreshProfiles(), fetchEvents(), fetchRegistrations(), fetchScores(), fetchAttendance()]);
        const rows = await fetchAiDetections(systemData);
        if (active) setDetections(rows);
      } catch {
        if (active) setError('Unable to load AI monitoring data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [fetchAttendance, fetchEvents, fetchRegistrations, fetchScores, refreshProfiles]);

  async function handleRunScan() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const derived = deriveAiDetections(systemData);
      const saved = await upsertAiDetections(derived);
      setDetections(saved);
      setMessage(`AI scan completed. ${saved.length} flagged record(s) found.`);
    } catch {
      setError('Unable to save AI detection records.');
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    const high = detections.filter((item) => item.riskLevel === 'high').length;
    const medium = detections.filter((item) => item.riskLevel === 'medium').length;
    const low = detections.filter((item) => item.riskLevel === 'low').length;
    const open = detections.filter((item) => item.status === 'open').length;
    const usersFlagged = new Set(detections.filter((item) => item.actorId || item.actorName).map((item) => item.actorId || item.actorName)).size;
    const eventsFlagged = detections.filter((item) => item.targetType === 'event').length;
    return { high, medium, low, open, usersFlagged, eventsFlagged };
  }, [detections]);

  const statCards = [
    { label: 'Flagged Activities', value: detections.length, color: detections.length ? '#dc2626' : '#10b981' },
    { label: 'Open Flags', value: stats.open, color: stats.open ? '#b45309' : '#10b981' },
    { label: 'High Risk', value: stats.high, color: stats.high ? '#dc2626' : '#10b981' },
    { label: 'Medium Risk', value: stats.medium, color: stats.medium ? '#b45309' : '#10b981' },
    { label: 'Flagged Users', value: stats.usersFlagged, color: stats.usersFlagged ? '#2563eb' : '#10b981' },
    { label: 'Flagged Events', value: stats.eventsFlagged, color: stats.eventsFlagged ? '#2563eb' : '#10b981' },
  ];

  return (
    <DashboardLayout title="AI Monitoring" subtitle="Suspicious activity detection from live system records">
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <p style={eyebrowStyle}>Overview</p>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Risk and flagged activity status</h2>
        </div>
        <button onClick={handleRunScan} disabled={saving || loading} style={primaryButtonStyle}>
          {saving ? 'Scanning...' : 'Run Rule-Based Scan'}
        </button>
      </div>

      {message ? <div style={successStyle}>{message}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 28 }}>
        {statCards.map((card, index) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} style={cardStyle}>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: card.color, margin: 0 }}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      <div style={tableCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: '#0f172a' }}>Recent AI Detections</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Records are loaded from `ai_detections` when Supabase is configured, otherwise derived from current system data.</p>
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading AI detections...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960, fontSize: 13, color: '#0f172a' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                  {['Detected', 'Target', 'Actor', 'Risk', 'Status', 'Reason'].map((header) => (
                    <th key={header} style={{ padding: '12px 8px' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detections.length === 0 ? (
                  <tr><td colSpan="6" style={emptyStyle}>No flagged or suspicious activities found.</td></tr>
                ) : detections.slice(0, 50).map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', color: '#64748b' }}>{new Date(item.detectedAt).toLocaleString()}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 800 }}>{item.targetName || item.targetId}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{item.targetType}</div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>{item.actorName || item.actorId || 'System'}</td>
                    <td style={{ padding: '12px 8px' }}><span style={pillStyle(riskColor(item.riskLevel))}>{item.riskLevel}</span></td>
                    <td style={{ padding: '12px 8px' }}><span style={pillStyle(item.status === 'open' ? '#b45309' : '#10b981')}>{item.status}</span></td>
                    <td style={{ padding: '12px 8px', color: '#475569', maxWidth: 420 }}>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 20, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const tableCardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const eyebrowStyle = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 6 };
const primaryButtonStyle = { padding: '10px 18px', borderRadius: 12, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', border: 'none', fontWeight: 800, cursor: 'pointer' };
const emptyStyle = { padding: 28, textAlign: 'center', color: '#94a3b8' };
const successStyle = { marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)', color: '#15803d', fontWeight: 800 };
const errorStyle = { marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', fontWeight: 800 };
const pillStyle = (color) => ({ padding: '4px 10px', borderRadius: 999, background: `${color}1f`, color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' });

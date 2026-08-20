import { useEffect, useMemo } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAILogsStore from '../../store/aiLogsStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';

export default function AdminSettings() {
  const { authMode, sessionSource, users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { stats: aiStats } = useAILogsStore();

  useEffect(() => {
    refreshProfiles();
    fetchEvents();
  }, [fetchEvents, refreshProfiles]);

  const settings = useMemo(() => [
    { label: 'Platform Name', value: import.meta.env.VITE_APP_NAME || document.title || 'FairPlay' },
    { label: 'Current Site URL', value: window.location.origin },
    { label: 'Auth Mode', value: authMode },
    { label: 'Session Source', value: sessionSource },
    { label: 'Supabase URL Configured', value: import.meta.env.VITE_SUPABASE_URL ? 'Yes' : 'No' },
    { label: 'Registered Users', value: users.length },
    { label: 'Events in Database', value: events.length },
    { label: 'AI Requests Logged (this browser only)', value: aiStats.totalRequests },
  ], [aiStats.totalRequests, authMode, events.length, sessionSource, users.length]);

  const toggles = [
    { label: 'Open Registration', value: import.meta.env.VITE_DISABLE_REGISTRATION === 'true' ? 'Disabled by environment' : 'Enabled' },
    { label: 'Maintenance Mode', value: import.meta.env.VITE_MAINTENANCE_MODE === 'true' ? 'Enabled' : 'Disabled' },
    { label: 'AI Features', value: import.meta.env.VITE_DISABLE_AI === 'true' ? 'Disabled by environment' : 'Enabled' },
    { label: 'Demo Mode', value: import.meta.env.VITE_DEMO_MODE !== 'false' ? 'Enabled' : 'Disabled' },
  ];

  return (
    <DashboardLayout title="Platform Settings" subtitle="Runtime configuration from the current app and environment">
      <div style={{ marginBottom: 18 }}>
        <p style={eyebrowStyle}>Configuration</p>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Actual platform settings</h2>
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
          {settings.map((setting) => (
            <div key={setting.label} style={tileStyle}>
              <div style={labelStyle}>{setting.label}</div>
              <div style={valueStyle}>{setting.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {toggles.map((toggle) => (
            <div key={toggle.label} style={rowStyle}>
              <span style={{ fontSize: 14, color: '#475569', fontWeight: 700 }}>{toggle.label}</span>
              <span style={statusStyle}>{toggle.value}</span>
            </div>
          ))}
        </div>

        <div style={emptyStyle}>Editable platform settings are not shown because no settings table/save endpoint is configured. This page now displays only real runtime values.</div>
      </div>
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 28, boxShadow: '0 12px 32px rgba(15,23,42,0.06)', maxWidth: 980 };
const eyebrowStyle = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 6 };
const tileStyle = { padding: 16, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' };
const labelStyle = { fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 };
const valueStyle = { fontSize: 16, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' };
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderBottom: '1px solid #e2e8f0' };
const statusStyle = { padding: '4px 10px', borderRadius: 999, background: 'rgba(37,99,235,0.12)', color: '#2563eb', fontSize: 12, fontWeight: 800 };
const emptyStyle = { marginTop: 24, padding: 16, borderRadius: 14, background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 13 };

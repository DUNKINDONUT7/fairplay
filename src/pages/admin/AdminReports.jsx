import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAILogsStore from '../../store/aiLogsStore';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { buildAuditLogs, buildSystemReport, fetchAiDetections } from '../../services/adminDataService';

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function addSection(doc, title, rows, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  rows.forEach(([label, value]) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.text(`${label}: ${value}`, 18, y);
    y += 6;
  });
  return y + 4;
}

function objectRows(obj) {
  const entries = Object.entries(obj || {});
  return entries.length ? entries.map(([key, value]) => [key, value]) : [['No records', 0]];
}

export default function AdminReports() {
  const { users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, assignments, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const { logs: aiLogs } = useAILogsStore();
  const [aiDetections, setAiDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        await Promise.all([refreshProfiles(), fetchEvents(), fetchJudges(), fetchRegistrations(), fetchScores(), fetchAttendance()]);
        const detections = await fetchAiDetections({ users, events, registrations, scores: scoreRows, attendance });
        if (active) setAiDetections(detections);
      } catch {
        if (active) setError('Unable to load report data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [fetchAttendance, fetchEvents, fetchJudges, fetchRegistrations, fetchScores, refreshProfiles]);

  const auditLogs = useMemo(() => buildAuditLogs({ users, events, registrations, scores: scoreRows, attendance, aiLogs, aiDetections }), [aiDetections, aiLogs, attendance, events, registrations, scoreRows, users]);
  const report = useMemo(() => buildSystemReport({ users, events, registrations, scores: scoreRows, attendance, judges, aiDetections, auditLogs }), [aiDetections, attendance, auditLogs, events, judges, registrations, scoreRows, users]);

  function handleDownloadPdf() {
    try {
      const doc = new jsPDF();
      let y = 16;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('FairPlay Whole System Report', 14, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 14, y);
      y += 10;

      y = addSection(doc, 'System Summary', Object.entries(report.summary), y);
      y = addSection(doc, 'Users Summary', Object.entries(report.users), y);
      y = addSection(doc, 'Events Summary - By Status', objectRows(report.events.byStatus), y);
      y = addSection(doc, 'Registrations Summary', [
        ['Total registrations', report.registrations.total],
        ...objectRows(report.registrations.byStatus).map(([key, value]) => [`Status ${key}`, value]),
      ], y);
      y = addSection(doc, 'AI Monitoring Summary', [
        ['Total flagged', report.aiMonitoring.totalFlagged],
        ...objectRows(report.aiMonitoring.byRiskLevel).map(([key, value]) => [`Risk ${key}`, value]),
      ], y);
      addSection(doc, 'Audit Logs Summary', [
        ['Total audit records', report.audit.total],
        ...objectRows(report.audit.bySource).map(([key, value]) => [`Source ${key}`, value]),
      ], y);

      doc.save(`fairplay-system-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      setMessage('PDF report downloaded.');
    } catch {
      setError('Unable to generate PDF report.');
    }
  }

  const summaryCards = [
    { label: 'Total Users', value: report.summary.totalUsers },
    { label: 'Organizers', value: report.summary.totalOrganizers },
    { label: 'Participants', value: report.summary.totalParticipants },
    { label: 'Total Events', value: report.summary.totalEvents },
    { label: 'Active Events', value: report.summary.activeEvents },
    { label: 'Completed Events', value: report.summary.completedEvents },
    { label: 'Pending Events', value: report.summary.pendingEvents },
    { label: 'Flagged Activities', value: report.summary.flaggedActivities },
  ];

  return (
    <DashboardLayout title="Reports" subtitle="Whole-system overview from current database-backed records">
      <div style={toolbarStyle}>
        <button onClick={handleDownloadPdf} disabled={loading} style={primaryButtonStyle}>
          <FileText size={16} />
          Download PDF
        </button>
        <button onClick={() => downloadJson('fairplay-system-report.json', report)} style={secondaryButtonStyle}>
          <Download size={16} />
          Download JSON
        </button>
      </div>

      {message ? <div style={successStyle}>{message}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
        {summaryCards.map((card) => (
          <div key={card.label} style={summaryCardStyle}>
            <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{card.label}</div>
            <div style={{ color: '#2563eb', fontSize: 28, fontWeight: 900 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <ReportPanel title="Users Summary" rows={Object.entries(report.users)} />
        <ReportPanel title="Events by Status" rows={objectRows(report.events.byStatus)} />
        <ReportPanel title="Registrations by Status" rows={objectRows(report.registrations.byStatus)} />
        <ReportPanel title="Event Participation Statistics" rows={report.events.participation.slice(0, 8).map((event) => [event.title, `${event.participants}/${event.maxParticipants || 'unlimited'} (${event.status})`])} />
        <ReportPanel title="AI Monitoring Summary" rows={[['Flagged activities', report.aiMonitoring.totalFlagged], ...objectRows(report.aiMonitoring.byRiskLevel).map(([key, value]) => [`Risk ${key}`, value])]} />
        <ReportPanel title="Audit Log Summary" rows={[['Total audit logs', report.audit.total], ...objectRows(report.audit.bySource).map(([key, value]) => [`Source ${key}`, value])]} />
      </div>
    </DashboardLayout>
  );
}

function ReportPanel({ title, rows }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginBottom: 14 }}>{title}</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {(rows.length ? rows : [['No records', 0]]).map(([label, value]) => (
          <div key={`${title}-${label}`} style={rowStyle}>
            <span style={{ color: '#64748b', fontSize: 13 }}>{label}</span>
            <span style={{ color: '#0f172a', fontWeight: 800, fontSize: 13, textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const toolbarStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 24px rgba(15,23,42,0.06)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 };
const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 22, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const summaryCardStyle = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18, padding: 20, boxShadow: '0 12px 32px rgba(37,99,235,0.06)' };
const primaryButtonStyle = { padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 10px 26px rgba(37,99,235,0.22)', display: 'inline-flex', alignItems: 'center', gap: 8 };
const secondaryButtonStyle = { padding: '10px 18px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' };
const successStyle = { marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)', color: '#15803d', fontWeight: 800 };
const errorStyle = { marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', fontWeight: 800 };

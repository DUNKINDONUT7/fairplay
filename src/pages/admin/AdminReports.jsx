import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAILogsStore from '../../store/aiLogsStore';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useNotificationStore from '../../store/notificationStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { buildAuditLogs, buildSystemReport, deriveAiDetections, fetchStoredAiDetections } from '../../services/adminDataService';

const EVENT_STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Waiting for approval',
  approved: 'Approved',
  upcoming: 'Upcoming',
  active: 'Happening now',
  ongoing: 'Happening now',
  completed: 'Completed',
  archived: 'Archived',
  rejected: 'Rejected',
  unknown: 'No status',
};

const ROLE_LABELS = {
  admin: 'Admins',
  organizer: 'Organizers',
  judge: 'Judges',
  participant: 'Participants',
  'institute-coordinator': 'Institute coordinators',
  'sports-head': 'Sports heads',
  osds: 'OSDS',
};

const ACTIVITY_LABELS = {
  accounts: 'Accounts created',
  events: 'Events created',
  registrations: 'Registrations',
  scores: 'Scores submitted',
  attendance: 'Check-ins',
  ai_logs: 'AI requests',
  ai_detections: 'Flags raised',
};

const STATUS_PILL = {
  completed: { bg: '#f1f5f9', fg: '#334155' },
  active: { bg: '#dcfce7', fg: '#15803d' },
  ongoing: { bg: '#dcfce7', fg: '#15803d' },
  upcoming: { bg: '#e0f2fe', fg: '#075985' },
  approved: { bg: '#dbeafe', fg: '#1d4ed8' },
  draft: { bg: '#f1f5f9', fg: '#64748b' },
  rejected: { bg: '#fee2e2', fg: '#b91c1c' },
};

const RISK_ROWS = [
  { key: 'high', label: 'High risk', color: '#dc2626', icon: 'bi bi-exclamation-octagon' },
  { key: 'medium', label: 'Medium risk', color: '#d97706', icon: 'bi bi-exclamation-triangle' },
  { key: 'low', label: 'Low risk', color: '#0284c7', icon: 'bi bi-info-circle' },
];

function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortedEntries(obj, labels) {
  return Object.entries(obj || {})
    .map(([key, value]) => ({ key, label: labels[key] || titleCase(key), value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const { users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const { logs: aiLogs } = useAILogsStore();
  const { success, error: notifyError } = useNotificationStore();
  const [storedFlags, setStoredFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState(new Date());

  async function load() {
    setLoading(true);
    await Promise.all([refreshProfiles(), fetchEvents(), fetchJudges(), fetchRegistrations(), fetchScores(), fetchAttendance()]).catch(() => {});
    setStoredFlags((await fetchStoredAiDetections()) || []);
    setGeneratedAt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);

  // Same logic as AI Monitoring: live checks, with saved review decisions applied.
  const flags = useMemo(() => {
    const statusById = new Map(storedFlags.map((row) => [row.id, row.status]));
    return deriveAiDetections({ users, events, registrations, scores: scoreRows, attendance })
      .map((item) => ({ ...item, status: statusById.get(item.id) || item.status }));
  }, [attendance, events, registrations, scoreRows, storedFlags, users]);

  const auditLogs = useMemo(
    () => buildAuditLogs({ users, events, registrations, scores: scoreRows, attendance, aiLogs, aiDetections: flags }),
    [aiLogs, attendance, events, flags, registrations, scoreRows, users],
  );
  const report = useMemo(
    () => buildSystemReport({ users, events, registrations, scores: scoreRows, attendance, judges, aiDetections: flags, auditLogs }),
    [attendance, auditLogs, events, flags, judges, registrations, scoreRows, users],
  );

  const openFlags = flags.filter((f) => f.status === 'open');
  const openByRisk = RISK_ROWS.map((r) => ({ ...r, value: openFlags.filter((f) => f.riskLevel === r.key).length }));
  const participantsInEvents = report.events.participation.reduce((sum, e) => sum + e.participants, 0);
  const eventStatus = sortedEntries(report.events.byStatus, EVENT_STATUS_LABELS);
  const roles = sortedEntries(users.reduce((acc, u) => ({ ...acc, [u.role || 'participant']: (acc[u.role || 'participant'] || 0) + 1 }), {}), ROLE_LABELS);
  const registrationStatus = sortedEntries(report.registrations.byStatus, {});
  const activity = sortedEntries(report.audit.bySource, ACTIVITY_LABELS);
  const participation = [...report.events.participation].sort((a, b) => b.participants - a.participants);
  const statusCount = (key) => report.events.byStatus?.[key] || 0;

  function handleDownloadPdf() {
    try {
      const doc = new jsPDF();
      const pageBottom = 280;
      let y = 18;
      const ensure = (space) => {
        if (y + space > pageBottom) {
          doc.addPage();
          y = 18;
        }
      };
      const heading = (text) => {
        ensure(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(text, 14, y);
        y += 3;
        doc.setDrawColor(226, 232, 240);
        doc.line(14, y, 196, y);
        y += 7;
      };
      const row = (label, value) => {
        ensure(7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.text(String(label), 18, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(String(value), 196, y, { align: 'right' });
        y += 6.5;
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(37, 99, 235);
      doc.text('FairPlay System Report', 14, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`As of ${generatedAt.toLocaleString()}`, 14, y);
      y += 12;

      heading('At a glance');
      row('Events', report.summary.totalEvents);
      row('User accounts', report.summary.totalUsers);
      row('Registrations', report.registrations.total);
      row('Participants in events', participantsInEvents);
      row('Flags needing review', openFlags.length);
      y += 4;

      heading('Events by status');
      eventStatus.forEach((e) => row(e.label, e.value));
      y += 4;

      heading('Event participation');
      participation.forEach((e) => {
        const max = Number(e.maxParticipants) || 0;
        const filled = max ? ` (${Math.round((e.participants / max) * 100)}% full)` : ' (no limit)';
        row(`${e.title} - ${EVENT_STATUS_LABELS[e.status] || titleCase(e.status)}`, `${e.participants}${max ? ` / ${max}` : ''}${filled}`);
      });
      y += 4;

      heading('User accounts by role');
      roles.forEach((r) => row(r.label, r.value));
      y += 4;

      heading('Registrations by status');
      (registrationStatus.length ? registrationStatus : [{ label: 'No registrations', value: 0 }]).forEach((r) => row(r.label, r.value));
      y += 4;

      heading('Scoring and attendance');
      row('Scores submitted', report.scoring.totalScores);
      row('Events with scores', report.scoring.scoredEvents);
      row('Check-ins', report.attendance.totalCheckIns);
      y += 4;

      heading('Monitoring');
      openByRisk.forEach((r) => row(`${r.label} (needs review)`, r.value));
      row('Reviewed', flags.filter((f) => f.status === 'reviewed').length);
      row('Dismissed', flags.filter((f) => f.status === 'dismissed').length);

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`FairPlay · Page ${i} of ${pages}`, 105, 290, { align: 'center' });
      }

      doc.save(`fairplay-report-${generatedAt.toISOString().slice(0, 10)}.pdf`);
      success('PDF report downloaded.');
    } catch {
      notifyError('Could not create the PDF report.');
    }
  }

  return (
    <DashboardLayout title="Reports" subtitle="A plain-language summary of everything happening on FairPlay">
      <div style={{ maxWidth: 1240, display: 'grid', gap: 20 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-calendar3" />
            {loading ? 'Updating report...' : <>Report as of <strong style={{ color: '#0f172a' }}>{generatedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></>}
            <button type="button" onClick={load} disabled={loading} style={{ ...linkButtonStyle, marginLeft: 4 }}>
              <i className={loading ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-arrow-clockwise'} /> Refresh
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => downloadJson(`fairplay-report-${generatedAt.toISOString().slice(0, 10)}.json`, report)} disabled={loading} style={ghostButtonStyle}>
              <i className="bi bi-filetype-json" /> Raw data
            </button>
            <button type="button" onClick={handleDownloadPdf} disabled={loading} style={{ ...primaryButtonStyle, opacity: loading ? 0.6 : 1 }}>
              <i className="bi bi-file-earmark-pdf" /> Download PDF report
            </button>
          </div>
        </div>

        {/* Headline numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 16 }}>
          <KpiTile
            icon="bi bi-calendar-event"
            tone="info"
            label="Events"
            value={report.summary.totalEvents}
            hint={`${statusCount('upcoming')} upcoming · ${statusCount('active') + statusCount('ongoing')} happening now · ${statusCount('completed')} completed`}
          />
          <KpiTile
            icon="bi bi-people"
            tone="info"
            label="User accounts"
            value={report.summary.totalUsers}
            hint={`${report.users.organizers} organizers · ${report.users.judges} judges · ${report.users.participants} participants`}
          />
          <KpiTile
            icon="bi bi-clipboard-check"
            tone="info"
            label="Registrations"
            value={report.registrations.total}
            hint={`${participantsInEvents} participants joined events`}
          />
          <KpiTile
            icon={openFlags.length ? 'bi bi-flag' : 'bi bi-shield-check'}
            tone={openFlags.length ? 'warning' : 'success'}
            label="Needs attention"
            value={openFlags.length}
            hint={openFlags.length ? `${openByRisk[0].value} high risk · review in AI Monitoring` : 'Nothing flagged right now'}
            to="/admin/ai-monitor"
          />
        </div>

        {/* Participation + status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
          <Panel
            style={{ flex: '2 1 560px' }}
            icon="bi bi-bar-chart"
            title="Event participation"
            subtitle="How full each event is"
          >
            {participation.length === 0 ? <Empty text="No events yet." /> : (
              <div style={{ display: 'grid', gap: 14 }}>
                {participation.map((event) => {
                  const max = Number(event.maxParticipants) || 0;
                  const pct = max ? Math.min(100, Math.round((event.participants / max) * 100)) : null;
                  const pill = STATUS_PILL[event.status] || STATUS_PILL.draft;
                  return (
                    <div key={event.id} title={`${event.title}: ${event.participants}${max ? ` of ${max}` : ''} participants`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 6 }}>
                        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{event.title}</span>
                          <span style={{ ...pillStyle, background: pill.bg, color: pill.fg }}>{EVENT_STATUS_LABELS[event.status] || titleCase(event.status)}</span>
                        </div>
                        <span style={{ fontSize: 13, color: '#475569', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          <strong style={{ color: '#0f172a' }}>{event.participants}</strong>{max ? ` / ${max}` : ''}
                          <span style={{ color: '#94a3b8', marginLeft: 6 }}>{pct === null ? 'no limit' : `${pct}% full`}</span>
                        </span>
                      </div>
                      <div style={trackStyle}>
                        <div style={{ ...barStyle, width: `${pct === null ? (event.participants ? 100 : 0) : pct}%`, background: pct === null ? '#93c5fd' : '#2563eb' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel style={{ flex: '1 1 300px' }} icon="bi bi-calendar-range" title="Events by status">
            <BarList rows={eventStatus} unit="event" />
          </Panel>
        </div>

        {/* People, registrations, scoring */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20 }}>
          <Panel icon="bi bi-person-badge" title="User accounts by role">
            <BarList rows={roles} unit="account" />
          </Panel>
          <Panel icon="bi bi-clipboard-data" title="Registrations by status">
            <BarList rows={registrationStatus} unit="registration" emptyText="No registrations yet." />
          </Panel>
          <Panel icon="bi bi-trophy" title="Scoring and attendance">
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                ['bi bi-pencil-square', 'Scores submitted', report.scoring.totalScores],
                ['bi bi-calendar-check', 'Events with scores', `${report.scoring.scoredEvents} of ${report.summary.totalEvents}`],
                ['bi bi-qr-code-scan', 'Check-ins', report.attendance.totalCheckIns],
              ].map(([icon, label, value]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                  <i className={icon} style={{ fontSize: 18, color: '#2563eb' }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#475569' }}>{label}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Monitoring + activity */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20 }}>
          <Panel
            icon="bi bi-radar"
            title="Monitoring"
            subtitle="Flags from the automatic checks"
            action={<Link to="/admin/ai-monitor" style={linkStyle}>Open AI Monitoring <i className="bi bi-arrow-right" /></Link>}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {openByRisk.map((r) => (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                  <i className={r.icon} style={{ color: r.color, fontSize: 16 }} />
                  <span style={{ flex: 1, color: '#475569' }}>{r.label} <span style={{ color: '#94a3b8' }}>· needs review</span></span>
                  <strong style={{ color: '#0f172a', fontSize: 15 }}>{r.value}</strong>
                </div>
              ))}
              <div style={{ height: 1, background: '#eef2f7', margin: '4px 0' }} />
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#475569' }}>
                <span><i className="bi bi-check2-circle" style={{ color: '#15803d', marginRight: 6 }} />{flags.filter((f) => f.status === 'reviewed').length} reviewed</span>
                <span><i className="bi bi-slash-circle" style={{ color: '#64748b', marginRight: 6 }} />{flags.filter((f) => f.status === 'dismissed').length} dismissed</span>
              </div>
            </div>
          </Panel>

          <Panel
            icon="bi bi-activity"
            title="Activity so far"
            subtitle="Everything recorded on the platform, by type"
            action={<Link to="/admin/audit" style={linkStyle}>Open Audit Log <i className="bi bi-arrow-right" /></Link>}
          >
            <BarList rows={activity} emptyText="No activity recorded yet." />
          </Panel>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Panel({ icon, title, subtitle, action, children, style }) {
  return (
    <section style={{ ...cardStyle, ...style }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #eef2f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            <i className={icon} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
            {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div style={{ padding: 20 }}>{children}</div>
    </section>
  );
}

// Single-series horizontal bars: one hue, value written beside each bar.
function BarList({ rows, unit, emptyText = 'No data yet.' }) {
  if (!rows || rows.length === 0) return <Empty text={emptyText} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((row) => (
        <div key={row.key} title={`${row.label}: ${row.value}${unit ? ` ${unit}${row.value === 1 ? '' : 's'}` : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: '#334155', fontWeight: 600 }}>{row.label}</span>
            <span style={{ color: '#0f172a', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
          </div>
          <div style={trackStyle}>
            <div style={{ ...barStyle, width: `${(row.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{text}</div>;
}

const KPI_TONES = {
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  success: { bg: '#ecfdf5', fg: '#047857' },
  warning: { bg: '#fffbeb', fg: '#b45309' },
};

function KpiTile({ icon, tone, label, value, hint, to }) {
  const colors = KPI_TONES[tone] || KPI_TONES.info;
  const body = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{label}</span>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: colors.bg, color: colors.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
          <i className={icon} />
        </span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.45 }}>{hint}</div>
    </>
  );
  const style = { ...cardStyle, padding: 18, display: 'block', textDecoration: 'none' };
  return to ? <Link to={to} style={style}>{body}</Link> : <div style={style}>{body}</div>;
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const trackStyle = { height: 10, borderRadius: 999, background: '#eef2f7', overflow: 'hidden' };
const barStyle = { height: '100%', borderRadius: 999, background: '#2563eb', minWidth: 4, transition: 'width 0.4s ease' };
const pillStyle = { padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,99,235,0.2)' };
const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const linkButtonStyle = { border: 'none', background: 'none', padding: 0, color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 };
const linkStyle = { fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 };

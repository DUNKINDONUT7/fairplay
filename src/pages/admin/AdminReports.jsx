import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { startOfDay, endOfDay, subDays, startOfMonth, format } from 'date-fns';
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

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom Range' },
];

// The downloadable report (CSV/PDF) lists individual records with real
// timestamps — a different, more detailed cut than the aggregate counts
// shown in the on-page dashboard panels below (those stay as-is).
const EXPORT_SECTIONS = [
  { key: 'events', label: 'Events' },
  { key: 'users', label: 'User Accounts' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'participation', label: 'Event Participation' },
  { key: 'flags', label: 'Flags Needing Review' },
];

// Registration windows aren't a stored field — derived the same way
// PublicLeaderboard treats "registration closed": once an event is live or
// finished, it's no longer accepting new sign-ups.
const REGISTRATION_CLOSED_STATUSES = ['active', 'ongoing', 'live', 'completed', 'archived'];

function formatDateTime(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return format(date, 'MMM d, yyyy, h:mm a');
}

function formatEventSchedule(event) {
  const raw = event.startDate || event.scheduledDate;
  if (!raw) return 'Not scheduled';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  const dateLabel = format(date, 'MMM d, yyyy');
  const timeLabel = event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : '';
  return timeLabel ? `${dateLabel}, ${timeLabel}` : dateLabel;
}

function getRegistrationWindowLabel(eventStatus) {
  return REGISTRATION_CLOSED_STATUSES.includes(String(eventStatus || '').toLowerCase()) ? 'Closed' : 'Open';
}

function allSectionsSelected(value) {
  return Object.fromEntries(EXPORT_SECTIONS.map((section) => [section.key, value]));
}

// Every record type gets filtered by its own natural date field (when it was
// created / submitted / checked in) before it feeds into buildSystemReport,
// so every KPI, panel, and export reflects the selected range consistently.
function getPresetRange(preset, customRange) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case '7d':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case '30d':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case 'month':
      return { start: startOfMonth(now), end: endOfDay(now) };
    case 'custom': {
      const start = customRange.from ? startOfDay(new Date(customRange.from)) : null;
      const end = customRange.to ? endOfDay(new Date(customRange.to)) : null;
      return { start, end };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
}

function isInRange(value, range) {
  if (!range.start && !range.end) return true;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return false;
  if (range.start && time < range.start) return false;
  if (range.end && time > range.end) return false;
  return true;
}

function filterByDate(rows, getDate, range) {
  if (!range.start && !range.end) return rows;
  return rows.filter((row) => isInRange(getDate(row), range));
}

function describeRange(range) {
  if (!range.start && !range.end) return 'All time';
  const fmt = (d) => format(d, 'MMM d, yyyy');
  if (range.start && range.end) {
    return startOfDay(range.start).getTime() === startOfDay(range.end).getTime()
      ? fmt(range.start)
      : `${fmt(range.start)} – ${fmt(range.end)}`;
  }
  return range.start ? `From ${fmt(range.start)}` : `Through ${fmt(range.end)}`;
}

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

function toCsvField(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

// Sections cover different data shapes (Metric/Value, Status/Count, Event
// participation, ...), so the header row is the union of every key seen
// across all rows, in first-seen order, with blanks for rows missing a key.
function rowsToCsv(rows) {
  const headers = [];
  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    });
  });
  const lines = [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ''))];
  // Leading BOM so Excel opens it as UTF-8 instead of mangling special characters.
  return '﻿' + lines.map((line) => line.map(toCsvField).join(',')).join('\r\n');
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
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
  const [datePreset, setDatePreset] = useState('all');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedSections, setSelectedSections] = useState(() => allSectionsSelected(true));
  const [showSectionPicker, setShowSectionPicker] = useState(false);

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

  const dateRange = useMemo(() => getPresetRange(datePreset, customRange), [datePreset, customRange]);
  const rangeDescription = useMemo(() => describeRange(dateRange), [dateRange]);

  const filteredUsers = useMemo(() => filterByDate(users, (u) => u.createdAt || u.joined, dateRange), [users, dateRange]);
  const filteredEvents = useMemo(() => filterByDate(events, (e) => e.createdAt || e.created_at, dateRange), [events, dateRange]);
  const filteredRegistrations = useMemo(() => filterByDate(registrations, (r) => r.createdAt, dateRange), [registrations, dateRange]);
  const filteredScoreRows = useMemo(() => filterByDate(scoreRows, (s) => s.timestamp, dateRange), [scoreRows, dateRange]);
  const filteredAttendance = useMemo(() => filterByDate(attendance, (a) => a.checkedInAt, dateRange), [attendance, dateRange]);

  // Same logic as AI Monitoring: live checks, with saved review decisions applied.
  const flags = useMemo(() => {
    const statusById = new Map(storedFlags.map((row) => [row.id, row.status]));
    return deriveAiDetections({ users: filteredUsers, events: filteredEvents, registrations: filteredRegistrations, scores: filteredScoreRows, attendance: filteredAttendance })
      .map((item) => ({ ...item, status: statusById.get(item.id) || item.status }));
  }, [filteredAttendance, filteredEvents, filteredRegistrations, filteredScoreRows, filteredUsers, storedFlags]);

  const auditLogs = useMemo(
    () => buildAuditLogs({ users: filteredUsers, events: filteredEvents, registrations: filteredRegistrations, scores: filteredScoreRows, attendance: filteredAttendance, aiLogs, aiDetections: flags }),
    [aiLogs, filteredAttendance, filteredEvents, filteredRegistrations, filteredScoreRows, filteredUsers, flags],
  );
  const report = useMemo(
    () => buildSystemReport({ users: filteredUsers, events: filteredEvents, registrations: filteredRegistrations, scores: filteredScoreRows, attendance: filteredAttendance, judges, aiDetections: flags, auditLogs }),
    [auditLogs, filteredAttendance, filteredEvents, filteredRegistrations, filteredScoreRows, filteredUsers, flags, judges],
  );

  const openFlags = flags.filter((f) => f.status === 'open');
  const openByRisk = RISK_ROWS.map((r) => ({ ...r, value: openFlags.filter((f) => f.riskLevel === r.key).length }));
  const participantsInEvents = report.events.participation.reduce((sum, e) => sum + e.participants, 0);
  const eventStatus = sortedEntries(report.events.byStatus, EVENT_STATUS_LABELS);
  const roles = sortedEntries(filteredUsers.reduce((acc, u) => ({ ...acc, [u.role || 'participant']: (acc[u.role || 'participant'] || 0) + 1 }), {}), ROLE_LABELS);
  const registrationStatus = sortedEntries(report.registrations.byStatus, {});
  const activity = sortedEntries(report.audit.bySource, ACTIVITY_LABELS);
  const participation = [...report.events.participation].sort((a, b) => b.participants - a.participants);
  const statusCount = (key) => report.events.byStatus?.[key] || 0;
  const hasSelectedSection = EXPORT_SECTIONS.some((section) => selectedSections[section.key]);
  const rangeSlug = datePreset === 'custom' ? `${customRange.from || 'start'}-to-${customRange.to || 'end'}` : datePreset;
  const rangeDescriptionDetailed = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return 'All time';
    const fmt = (d) => format(d, 'MMM d, yyyy, h:mm a');
    if (dateRange.start && dateRange.end) return `${fmt(dateRange.start)} – ${fmt(dateRange.end)}`;
    return dateRange.start ? `From ${fmt(dateRange.start)}` : `Through ${fmt(dateRange.end)}`;
  }, [dateRange]);

  // Individual-record listings for the downloadable report — a different,
  // more detailed cut than the aggregate panels above.
  const detailedEvents = useMemo(() => filteredEvents.map((event) => ({
    title: event.title,
    schedule: formatEventSchedule(event),
    statusLabel: EVENT_STATUS_LABELS[event.status] || titleCase(event.status || 'draft'),
    participants: Number(event.participants || event.contestants?.length || 0),
    capacity: Number(event.maxParticipants) || 0,
  })), [filteredEvents]);

  const detailedUsers = useMemo(() => filteredUsers.map((u) => ({
    name: u.name || u.fullName || u.email || 'Unnamed',
    email: u.email || '—',
    role: ROLE_LABELS[u.role] || titleCase(u.role || 'participant'),
    registeredLabel: formatDateTime(u.createdAt || u.joined),
    status: titleCase(u.status || 'active'),
  })), [filteredUsers]);

  const registrationsByEvent = useMemo(() => {
    const counts = new Map();
    filteredRegistrations.forEach((r) => {
      const key = String(r.eventId);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return filteredEvents.map((event) => ({
      title: event.title,
      count: counts.get(String(event.id)) || 0,
      windowLabel: getRegistrationWindowLabel(event.status),
    }));
  }, [filteredEvents, filteredRegistrations]);

  // Builds the jsPDF document. Shared by download and print so both produce
  // the exact same report — a formal, full-page, two-column layout: a
  // branded header banner with the report period, five KPI tiles, then
  // detailed record tables (with real dates/times) in two columns, closing
  // with methodology notes and a page-numbered footer.
  function buildReportDocument() {
    const doc = new jsPDF();
    const marginX = 12;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // ── Header banner ──────────────────────────────────────────
    const bannerHeight = 32;
    doc.setFillColor(13, 21, 54);
    doc.rect(0, 0, pageWidth, bannerHeight, 'F');

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(marginX, 7, 16, 16, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(13, 21, 54);
    doc.text('F', marginX + 8, 17.5, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('FairPlay System Report', marginX + 22, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(176, 190, 230);
    doc.text('EVENT MANAGEMENT & JUDGING PLATFORM', marginX + 22, 20);

    const boxW = 82;
    const boxX = pageWidth - marginX - boxW;
    doc.setDrawColor(90, 106, 168);
    doc.roundedRect(boxX, 6, boxW, 20, 2.5, 2.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(176, 190, 230);
    doc.text('REPORT PERIOD', boxX + 5, 11.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(rangeDescriptionDetailed, boxX + 5, 17, { maxWidth: boxW - 10 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(176, 190, 230);
    doc.text(`Generated ${format(generatedAt, 'MMM d, yyyy · h:mm a')}`, boxX + 5, 23);

    let y = bannerHeight + 9;

    // ── Intro line ─────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Detailed overview of events, user accounts, registrations, and flagged activity within the selected period.', marginX, y);
    y += 8;

    // ── KPI tiles ──────────────────────────────────────────────
    const kpis = [
      { label: 'Total Events', value: report.summary.totalEvents, caption: 'Events during this period', color: [37, 99, 235] },
      { label: 'Total User Accounts', value: report.summary.totalUsers, caption: 'Registered user accounts', color: [124, 58, 237] },
      { label: 'Total Registrations', value: report.registrations.total, caption: 'Event registrations', color: [5, 150, 105] },
      { label: 'Total Participants', value: participantsInEvents, caption: 'Unique participants', color: [13, 148, 136] },
      { label: 'Flags Needing Review', value: openFlags.length, caption: 'Requires attention', color: [220, 38, 38] },
    ];
    const kpiGap = 5;
    const kpiWidth = (pageWidth - marginX * 2 - kpiGap * (kpis.length - 1)) / kpis.length;
    const kpiHeight = 22;
    kpis.forEach((kpi, index) => {
      const x = marginX + index * (kpiWidth + kpiGap);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, kpiWidth, kpiHeight, 2, 2);
      doc.setFillColor(...kpi.color);
      doc.rect(x + 1, y + 1, kpiWidth - 2, 1.4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + 3, y + 8, { maxWidth: kpiWidth - 6 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text(String(kpi.value), x + 3, y + 15.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text(kpi.caption, x + 3, y + 19.5, { maxWidth: kpiWidth - 6 });
    });
    y += kpiHeight + 8;

    // ── Detail tables (full page width, stacked) ────────────────
    // Each table gets an explicit width per column (columnStyles) instead of
    // autoTable's automatic sizing — with wide fields like full email
    // addresses and "Mon d, yyyy, h:mm a" timestamps, automatic sizing was
    // squeezing short-header columns (Name, Status) down to almost nothing,
    // wrapping their header text one letter per line. Full page width (not
    // a half-width side-by-side column) gives every field room to breathe.
    // Column widths below are chosen to sum to ~186mm (A4 width minus margins).

    const sectionTitle = (text) => {
      if (y > pageHeight - 45) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(text, marginX, y);
      y += 6;
    };

    const drawTable = (head, body, widths) => {
      autoTable(doc, {
        head: [head],
        body,
        startY: y,
        margin: { left: marginX, right: marginX },
        columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: [51, 65, 85], overflow: 'linebreak' },
        headStyles: { fillColor: [13, 21, 54], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        theme: 'grid',
      });
      y = doc.lastAutoTable.finalY + 9;
    };

    if (selectedSections.events) {
      sectionTitle('Events');
      drawTable(
        ['#', 'Event Name', 'Date & Time', 'Status', 'Participants', 'Capacity'],
        detailedEvents.length
          ? detailedEvents.map((e, i) => [i + 1, e.title, e.schedule, e.statusLabel, e.participants, e.capacity || 'No limit'])
          : [['—', 'No events in this period', '', '', '', '']],
        [8, 50, 42, 28, 28, 30],
      );
    }

    if (selectedSections.participation) {
      sectionTitle('Event Participation');
      drawTable(
        ['#', 'Event Name', 'Status', 'Participants', 'Capacity', '% Full'],
        participation.length
          ? participation.map((event, i) => {
              const max = Number(event.maxParticipants) || 0;
              const pct = max ? Math.min(100, Math.round((event.participants / max) * 100)) : null;
              return [i + 1, event.title, EVENT_STATUS_LABELS[event.status] || titleCase(event.status), event.participants, max || 'No limit', pct === null ? 'No limit' : `${pct}%`];
            })
          : [['—', 'No events in this period', '', '', '', '']],
        [8, 66, 30, 28, 28, 26],
      );
    }

    if (selectedSections.registrations) {
      sectionTitle('Registrations');
      drawTable(
        ['#', 'Event Name', 'Registrations', 'Status'],
        registrationsByEvent.length
          ? registrationsByEvent.map((r, i) => [i + 1, r.title, r.count, r.windowLabel])
          : [['—', 'No events in this period', '', '']],
        [8, 98, 40, 40],
      );
    }

    if (selectedSections.users) {
      sectionTitle('User Accounts');
      drawTable(
        ['#', 'Name', 'Email', 'Role', 'Date Registered', 'Status'],
        detailedUsers.length
          ? detailedUsers.map((u, i) => [i + 1, u.name, u.email, u.role, u.registeredLabel, u.status])
          : [['—', 'No accounts in this period', '', '', '', '']],
        [8, 34, 58, 26, 34, 26],
      );
    }

    if (selectedSections.flags) {
      sectionTitle('Flags Needing Review');
      drawTable(
        ['#', 'Event / Report', 'Details', 'Flagged Date', 'Status'],
        openFlags.length
          ? openFlags.map((f, i) => [i + 1, f.targetName, f.reason, formatDateTime(f.detectedAt), 'Requires Review'])
          : [['—', 'No flags in this period', '', '', '']],
        [8, 40, 78, 32, 28],
      );
    }

    // ── Notes ──────────────────────────────────────────────────
    let yNotes = y;
    if (yNotes > pageHeight - 45) {
      doc.addPage();
      yNotes = 16;
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, yNotes, pageWidth - marginX, yNotes);
    yNotes += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Notes', marginX, yNotes);
    yNotes += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    [
      `Data covers the period from ${rangeDescriptionDetailed}.`,
      'Participant counts are based on unique user accounts, not total sign-ups.',
      'Flagged items are automatically detected by the system and require manual review.',
    ].forEach((note) => {
      doc.text(`•  ${note}`, marginX, yNotes, { maxWidth: pageWidth - marginX * 2 });
      yNotes += 5;
    });

    // ── Footer (every page) ────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('FairPlay System Report · Confidential', marginX, pageHeight - 8);
      doc.text(`Page ${i} of ${pages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    }

    return doc;
  }

  function handleDownloadPdf() {
    if (!hasSelectedSection) {
      notifyError('Choose at least one report section first.');
      return;
    }
    try {
      const doc = buildReportDocument();
      doc.save(`fairplay-report-${rangeSlug}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
      success('PDF report downloaded.');
    } catch (err) {
      console.error(err);
      notifyError('Could not create the PDF report.');
    }
  }

  function handlePrintPdf() {
    if (!hasSelectedSection) {
      notifyError('Choose at least one report section first.');
      return;
    }
    try {
      const doc = buildReportDocument();
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    } catch (err) {
      console.error(err);
      notifyError('Could not open the report for printing.');
    }
  }

  // Mirrors the PDF report's sections so both exports agree, combined into
  // one CSV with a Section column identifying which part each row belongs to.
  // Only sections checked in selectedSections are included.
  function buildReportCsvRows() {
    const rows = [];

    if (selectedSections.events) {
      detailedEvents.forEach((e) => rows.push({
        Section: 'Events', Event: e.title, 'Date & Time': e.schedule, Status: e.statusLabel,
        Participants: e.participants, Capacity: e.capacity || 'No limit',
      }));
    }

    if (selectedSections.users) {
      detailedUsers.forEach((u) => rows.push({
        Section: 'User Accounts', Name: u.name, Email: u.email, Role: u.role,
        'Date Registered': u.registeredLabel, Status: u.status,
      }));
    }

    if (selectedSections.registrations) {
      registrationsByEvent.forEach((r) => rows.push({
        Section: 'Registrations', Event: r.title, Registrations: r.count, Status: r.windowLabel,
      }));
    }

    if (selectedSections.participation) {
      participation.forEach((event) => {
        const max = Number(event.maxParticipants) || 0;
        const pct = max ? Math.min(100, Math.round((event.participants / max) * 100)) : null;
        rows.push({
          Section: 'Event Participation',
          Event: event.title,
          Status: EVENT_STATUS_LABELS[event.status] || titleCase(event.status),
          Participants: event.participants,
          Capacity: max || 'No limit',
          '% Full': pct === null ? 'No limit' : `${pct}%`,
        });
      });
    }

    if (selectedSections.flags) {
      openFlags.forEach((f) => rows.push({
        Section: 'Flags Needing Review', 'Event / Report': f.targetName, Details: f.reason,
        'Flagged Date': formatDateTime(f.detectedAt), Status: 'Requires Review',
      }));
    }

    return rows;
  }

  function handleDownloadCsv() {
    if (!hasSelectedSection) {
      notifyError('Choose at least one report section first.');
      return;
    }
    try {
      downloadCsv(`fairplay-report-${rangeSlug}-${generatedAt.toISOString().slice(0, 10)}.csv`, buildReportCsvRows());
      success('CSV report downloaded.');
    } catch {
      notifyError('Could not create the CSV report.');
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
            <button type="button" onClick={() => downloadJson(`fairplay-report-${rangeSlug}-${generatedAt.toISOString().slice(0, 10)}.json`, report)} disabled={loading} style={ghostButtonStyle}>
              <i className="bi bi-filetype-json" /> Raw data
            </button>
            <button type="button" onClick={handleDownloadCsv} disabled={loading || !hasSelectedSection} style={{ ...ghostButtonStyle, opacity: loading || !hasSelectedSection ? 0.55 : 1, cursor: loading || !hasSelectedSection ? 'not-allowed' : 'pointer' }}>
              <i className="bi bi-download" /> Download CSV
            </button>
            <button type="button" onClick={handlePrintPdf} disabled={loading || !hasSelectedSection} style={{ ...ghostButtonStyle, opacity: loading || !hasSelectedSection ? 0.55 : 1, cursor: loading || !hasSelectedSection ? 'not-allowed' : 'pointer' }}>
              <i className="bi bi-printer" /> Print
            </button>
            <button type="button" onClick={handleDownloadPdf} disabled={loading || !hasSelectedSection} style={{ ...primaryButtonStyle, opacity: loading || !hasSelectedSection ? 0.55 : 1, cursor: loading || !hasSelectedSection ? 'not-allowed' : 'pointer' }}>
              <i className="bi bi-file-earmark-pdf" /> Download PDF report
            </button>
          </div>
        </div>

        {/* Filters: date range applies to every KPI/panel/export on this page;
            section selection only controls what CSV/PDF exports include. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-funnel" style={{ color: '#2563eb' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Date range</span>
          </div>
          <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} style={selectStyle}>
            {DATE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>
          {datePreset === 'custom' && (
            <>
              <input
                type="date"
                value={customRange.from}
                onChange={(e) => setCustomRange((current) => ({ ...current, from: e.target.value }))}
                style={dateInputStyle}
              />
              <span style={{ color: '#94a3b8', fontSize: 12 }}>to</span>
              <input
                type="date"
                value={customRange.to}
                onChange={(e) => setCustomRange((current) => ({ ...current, to: e.target.value }))}
                style={dateInputStyle}
              />
            </>
          )}
          <span style={{ fontSize: 12, color: '#64748b' }}>Showing: <strong style={{ color: '#0f172a' }}>{rangeDescription}</strong></span>

          <button type="button" onClick={() => setShowSectionPicker((v) => !v)} style={{ ...linkButtonStyle, marginLeft: 'auto' }}>
            <i className="bi bi-list-check" /> {showSectionPicker ? 'Hide' : 'Choose'} report sections
          </button>
        </div>

        {showSectionPicker && (
          <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Sections included in CSV / PDF downloads</span>
              <div style={{ display: 'flex', gap: 14 }}>
                <button type="button" onClick={() => setSelectedSections(allSectionsSelected(true))} style={linkButtonStyle}>Select all</button>
                <button type="button" onClick={() => setSelectedSections(allSectionsSelected(false))} style={linkButtonStyle}>Select none</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              {EXPORT_SECTIONS.map((section) => (
                <label key={section.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedSections[section.key])}
                    onChange={(e) => setSelectedSections((current) => ({ ...current, [section.key]: e.target.checked }))}
                  />
                  {section.label}
                </label>
              ))}
            </div>
          </div>
        )}

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
const selectStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const dateInputStyle = { padding: '7px 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontSize: 13 };

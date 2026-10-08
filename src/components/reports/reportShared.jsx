import useEventStore from '../../store/eventStore';
import { buildReportJson, buildScoresCsv } from '../../utils/eventReport';

export const REPORT_STATUS = {
  final: { label: 'Final', color: '#047857', background: '#ecfdf5', border: '#a7f3d0', icon: 'bi bi-patch-check' },
  preliminary: { label: 'Preliminary', color: '#b45309', background: '#fffbeb', border: '#fde68a', icon: 'bi bi-hourglass-split' },
  pending: { label: 'No results yet', color: '#64748b', background: '#f8fafc', border: '#e2e8f0', icon: 'bi bi-dash-circle' },
};

// `width` gives every badge in a column the same size, whatever it says.
export function ReportStatusBadge({ status, width }) {
  const tone = REPORT_STATUS[status] || REPORT_STATUS.pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', width, gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: tone.color, background: tone.background, border: `1px solid ${tone.border}`, whiteSpace: 'nowrap' }}>
      <i className={tone.icon} />
      {tone.label}
    </span>
  );
}

export function EventStatusBadge({ status, width }) {
  const value = String(status || 'draft');
  const tone = value === 'completed'
    ? { color: '#047857', background: '#ecfdf5', border: '#a7f3d0' }
    : value === 'active'
      ? { color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' }
      : { color: '#475569', background: '#f8fafc', border: '#e2e8f0' };
  return (
    <span style={{ display: 'inline-block', boxSizing: 'border-box', width, textAlign: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap', color: tone.color, background: tone.background, border: `1px solid ${tone.border}` }}>
      {value.replace(/[-_]/g, ' ')}
    </span>
  );
}

export function ReportEmptyState({ icon = 'bi bi-inbox', title, children }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', borderRadius: 14, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
      <div style={{ fontSize: 28, color: '#94a3b8', marginBottom: 8 }}><i className={icon} /></div>
      <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{title}</div>
      {children && <div style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>{children}</div>}
    </div>
  );
}

export function ReportLoading({ label = 'Loading report data…' }) {
  return (
    <div style={{ padding: '56px 20px', textAlign: 'center', color: '#64748b' }}>
      <div style={{ fontSize: 28, color: '#2563eb', marginBottom: 10 }}><i className="bi bi-arrow-repeat animate-spin" /></div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function slugify(value) {
  return String(value || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
}

function downloadBlob(fileName, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadReportCsv(report) {
  // The BOM makes Excel read accented names (ñ, é) correctly.
  downloadBlob(`${slugify(report.info.title)}-scores.csv`, `﻿${buildScoresCsv(report)}`, 'text/csv;charset=utf-8');
}

export function downloadReportJson(report) {
  downloadBlob(`${slugify(report.info.title)}-report.json`, buildReportJson(report), 'application/json;charset=utf-8');
}

// Builds the official PDF and either saves or prints it, then records the
// generation on the event so it shows up in report history.
export async function generateReportPdf(report, { mode = 'download', user } = {}) {
  const { buildEventReportPdf, getEventReportFileName } = await import('../../utils/eventReportPdf');
  const organizerName = String(user?.name || '');
  const doc = buildEventReportPdf(report, {
    // user.name falls back to the email address; don't print it twice.
    organizerName: organizerName.includes('@') ? '' : organizerName,
    organizerEmail: user?.email || report.info.organizerEmail,
  });

  if (mode === 'print') {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(getEventReportFileName(report));
  }

  try {
    await useEventStore.getState().addGeneratedReport(report.info.id, {
      id: `event-report-${report.info.id}`,
      category: 'event-report',
      title: `${report.info.title} Event Report`,
      status: report.reportStatus,
      savedAt: new Date().toISOString(),
      participants: report.stats.totalParticipants,
      judges: report.stats.totalJudges,
      evaluations: report.stats.completedEvaluations,
    });
  } catch (historyError) {
    // The PDF itself is already in the organizer's hands; only the
    // "last generated" stamp is lost.
    console.warn('Could not record report history:', historyError);
  }
}

export const reportStyles = {
  panel: {
    background: '#ffffff',
    border: '1px solid #dbeafe',
    borderRadius: 18,
    padding: 22,
    boxShadow: '0 12px 32px rgba(37,99,235,0.06)',
  },
  eyebrow: { margin: 0, color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' },
  heading: { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#0f172a' },
  subheading: { margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 },
  field: {
    padding: '9px 12px',
    borderRadius: 10,
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    color: '#0f172a',
    fontSize: 13,
    outline: 'none',
    minWidth: 0,
  },
  primaryButton: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '10px 16px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff',
    fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  secondaryButton: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '9px 14px', borderRadius: 10, border: '1px solid #bfdbfe',
    background: '#eff6ff', color: '#1d4ed8',
    fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  tableWrap: { overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '11px 14px', borderBottom: '1px solid #f1f5f9', color: '#334155', verticalAlign: 'middle' },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};

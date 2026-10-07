import { useEffect } from 'react';
import { formatReportDate, formatScore } from '../../utils/eventReport';
import { reportStyles as s } from './reportShared';

// The pieces every score screen shares — the report, the Scores hub and the
// Ranking page — so a participant's breakdown looks and adds up the same
// wherever it is opened.

const RANK_TONES = {
  1: { background: '#1d4ed8', color: '#ffffff', border: '#1d4ed8' },
  2: { background: '#dbeafe', color: '#1e3a8a', border: '#93c5fd' },
  3: { background: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
};

export function RankBadge({ rank }) {
  if (!rank) return <span style={{ color: '#94a3b8' }}>—</span>;
  const tone = RANK_TONES[rank] || { background: '#ffffff', color: '#475569', border: '#e2e8f0' };
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', minWidth: 30, height: 26, padding: '0 6px', borderRadius: 8, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', background: tone.background, color: tone.color, border: `1px solid ${tone.border}` }}>
      {rank}
    </span>
  );
}

export function ParticipantStatus({ status }) {
  const tone = {
    Scored: { color: '#047857', background: '#ecfdf5' },
    'Partially scored': { color: '#b45309', background: '#fffbeb' },
    'Not scored': { color: '#64748b', background: '#f1f5f9' },
    Eliminated: { color: '#b91c1c', background: '#fef2f2' },
  }[status] || { color: '#64748b', background: '#f1f5f9' };
  return <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', ...tone }}>{status}</span>;
}

export function StatTile({ label, value, hint }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4, overflowWrap: 'anywhere', lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, overflowWrap: 'anywhere' }}>{hint}</div>}
    </div>
  );
}

export function Dialog({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '5vh 16px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} style={{ background: '#ffffff', borderRadius: 18, width: '100%', maxWidth: 820, boxShadow: '0 24px 60px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '20px 22px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: '1px solid #e2e8f0', background: '#f8fafc', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', color: '#475569', flexShrink: 0 }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

// Criteria down the side, judges across — the exact numbers each judge entered.
export function CriteriaBreakdown({ report, participant }) {
  const judges = report.judges.filter((judge) => participant.byJudge[judge.key]);
  if (judges.length === 0) {
    return <div style={{ color: '#64748b', fontSize: 13 }}>No judge has scored this participant yet.</div>;
  }
  if (report.criteria.length === 0) {
    return <div style={{ color: '#64748b', fontSize: 13 }}>This event has no scoring criteria, so there is no criteria breakdown.</div>;
  }
  return (
    <div style={s.tableWrap}>
      <table style={{ ...s.table, minWidth: 420 + judges.length * 110 }}>
        <thead>
          <tr>
            <th style={s.th}>Criterion</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Weight</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Max</th>
            {judges.map((judge) => <th key={judge.key} style={{ ...s.th, textAlign: 'right' }}>{judge.name}</th>)}
            <th style={{ ...s.th, textAlign: 'right' }}>Average</th>
            <th style={{ ...s.th, textAlign: 'right' }}>% of max</th>
          </tr>
        </thead>
        <tbody>
          {report.criteria.map((criterion) => {
            const values = judges.map((judge) => participant.byJudge[judge.key].breakdown.find((item) => item.criterionId === criterion.id)?.score ?? 0);
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            return (
              <tr key={criterion.id}>
                <td style={{ ...s.td, fontWeight: 600, color: '#0f172a' }}>{criterion.name}</td>
                <td style={{ ...s.td, ...s.num }}>{criterion.weight}%</td>
                <td style={{ ...s.td, ...s.num }}>{criterion.max}</td>
                {values.map((value, index) => <td key={judges[index].key} style={{ ...s.td, ...s.num }}>{value}</td>)}
                <td style={{ ...s.td, ...s.num, fontWeight: 700, color: '#0f172a' }}>{mean.toFixed(2)}</td>
                <td style={{ ...s.td, ...s.num }}>{criterion.max ? `${((mean / criterion.max) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={3} style={{ ...s.td, fontWeight: 800, color: '#0f172a', background: '#f8fafc', borderBottom: 'none' }}>Weighted total per judge</td>
            {judges.map((judge) => (
              <td key={judge.key} style={{ ...s.td, ...s.num, fontWeight: 800, color: '#0f172a', background: '#f8fafc', borderBottom: 'none' }}>{formatScore(participant.byJudge[judge.key].total)}</td>
            ))}
            <td style={{ ...s.td, ...s.num, fontWeight: 800, color: '#1d4ed8', background: '#f8fafc', borderBottom: 'none' }}>{formatScore(participant.average)}</td>
            <td style={{ ...s.td, background: '#f8fafc', borderBottom: 'none' }} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ParticipantDialog({ report, participant, onClose }) {
  const judges = report.judges.filter((judge) => participant.byJudge[judge.key]);
  const remarks = participant.evaluations.filter((evaluation) => evaluation.remarks);
  return (
    <Dialog
      title={participant.name}
      subtitle={[participant.number ? `No. ${participant.number}` : '', participant.team, participant.type].filter(Boolean).join(' · ')}
      onClose={onClose}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
        <StatTile label="Final rank" value={participant.rank ? participant.placement : 'Unranked'} hint={participant.award || undefined} />
        {participant.record && <StatTile label="Win–loss record" value={participant.record} hint={participant.bracket || undefined} />}
        <StatTile label="Final score" value={formatScore(participant.final)} hint={report.stats.maxScore ? `out of ${formatScore(report.stats.maxScore)}` : undefined} />
        <StatTile label="Average score" value={formatScore(participant.average)} hint="Mean of the judges' totals" />
        <StatTile label="Total score" value={formatScore(participant.total)} hint={`${participant.scoredBy} of ${report.judges.length} judges`} />
      </div>

      <h3 style={{ ...s.heading, fontSize: 14 }}>Scores by judge</h3>
      {judges.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>No judge has scored this participant yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '10px 0 18px' }}>
          {judges.map((judge) => (
            <div key={judge.key} style={{ padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b', overflowWrap: 'anywhere' }}>{judge.name}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{formatScore(participant.byJudge[judge.key].total)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {participant.byJudge[judge.key].locked ? 'Locked' : 'Not locked'} · {formatReportDate(participant.byJudge[judge.key].timestamp, true)}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ ...s.heading, fontSize: 14, marginBottom: 10 }}>Criteria breakdown</h3>
      <CriteriaBreakdown report={report} participant={participant} />

      {participant.audienceAverage !== null && (
        <p style={{ fontSize: 13, color: '#475569', margin: '14px 0 0' }}>
          Audience average <strong>{formatScore(participant.audienceAverage)}</strong> from {participant.audienceSubmissions} vote(s), counted as {report.info.audienceWeight}% of the final score.
        </p>
      )}

      {remarks.length > 0 && (
        <>
          <h3 style={{ ...s.heading, fontSize: 14, margin: '18px 0 10px' }}>Judge remarks</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {remarks.map((evaluation) => (
              <div key={evaluation.judgeKey} style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                <strong style={{ color: '#0f172a' }}>{report.judges.find((judge) => judge.key === evaluation.judgeKey)?.name || 'Judge'}:</strong> {evaluation.remarks}
              </div>
            ))}
          </div>
        </>
      )}

      {participant.members.length > 0 && (
        <p style={{ fontSize: 13, color: '#475569', margin: '14px 0 0' }}>
          <strong>Members:</strong> {participant.members.map((member) => (typeof member === 'string' ? member : member?.name)).filter(Boolean).join(', ')}
        </p>
      )}
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeToTable, supabase } from '../../utils/supabaseClient';

export const CHANGE_TYPES = {
  judge_score_correction: { label: 'Score correction', icon: 'bi-pencil-square', color: '#b45309' },
  judge_score_void: { label: 'Sheet voided', icon: 'bi-slash-circle', color: '#b91c1c' },
  match_correction: { label: 'Match correction', icon: 'bi-pencil-square', color: '#b45309' },
  match_undo: { label: 'Result undone', icon: 'bi-arrow-counterclockwise', color: '#b91c1c' },
  redraw: { label: 'Redraw', icon: 'bi-shuffle', color: '#7c3aed' },
  finalize: { label: 'Finalized', icon: 'bi-lock-fill', color: '#15803d' },
  staff_revoke: { label: 'Access revoked', icon: 'bi-person-x', color: '#b91c1c' },
  staff_replace: { label: 'Reassignment', icon: 'bi-arrow-left-right', color: '#2563eb' },
  attendance_override: { label: 'Attendance override', icon: 'bi-person-check', color: '#0f766e' },
  vote_void: { label: 'Vote voided', icon: 'bi-hand-thumbs-down', color: '#b91c1c' },
};

const FILTERS = [
  { key: 'all', label: 'All changes', types: null },
  { key: 'corrections', label: 'Corrections', types: ['judge_score_correction', 'judge_score_void', 'match_correction'] },
  { key: 'undo', label: 'Undo', types: ['match_undo'] },
  { key: 'reassignment', label: 'Reassignment', types: ['staff_revoke', 'staff_replace'] },
  { key: 'draws', label: 'Redraws & finalization', types: ['redraw', 'finalize'] },
];

// Compact "old → new" for the values a change log entry carries.
function describeValues(entry) {
  const oldValue = entry.old_value || {};
  const newValue = entry.new_value || {};
  switch (entry.change_type) {
    case 'judge_score_correction':
      return `Total ${Number(oldValue.total ?? 0).toFixed(2)} → ${Number(newValue.total ?? 0).toFixed(2)} (${Object.entries(newValue.criteriaScores || {})
        .filter(([key, value]) => Number(oldValue.criteriaScores?.[key]) !== Number(value))
        .map(([key, value]) => `${key}: ${oldValue.criteriaScores?.[key] ?? '—'} → ${value}`)
        .join(', ') || 'no criterion changed'})`;
    case 'judge_score_void':
      return `Total ${Number(oldValue.total ?? 0).toFixed(2)} no longer counted`;
    case 'match_correction':
    case 'match_undo':
      return `${Number(oldValue.score1 ?? 0)} – ${Number(oldValue.score2 ?? 0)} (${oldValue.status || '—'}) → ${newValue.status === 'completed' ? `${Number(newValue.score1 ?? 0)} – ${Number(newValue.score2 ?? 0)}` : 'not played'}`;
    case 'redraw':
      return `${oldValue.bracketType || ''} draw replaced${oldValue.hadResults ? ' (results were cleared)' : ''}`;
    case 'staff_replace':
      return `${oldValue.name || ''} <${oldValue.email || ''}> → ${newValue.name || ''} <${newValue.email || ''}>`;
    case 'staff_revoke':
      return `${oldValue.status || ''} → revoked`;
    case 'finalize':
      return `Champion: ${newValue.champion?.name || '—'}`;
    default:
      return '';
  }
}

// W04: every correction, undo, redraw and reassignment, with who did it,
// when (Philippine time, labelled), what changed and why. Organizers see
// their own events; admins see everything (database policy, not the UI).
export default function ResultChangeLog({ eventId = null, title = 'Change Log', compact = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    let query = supabase.from('result_changes_ph').select('*').order('occurred_at', { ascending: false }).limit(500);
    if (eventId) query = query.eq('event_id', eventId);
    const { data, error } = await query;
    if (error) {
      // Not set up in this database yet: show nothing rather than an error.
      setMissing(/result_changes|schema cache|does not exist|PGRST205/i.test(`${error.code} ${error.message}`));
      setFailure(error.message);
    } else {
      setMissing(false);
      setRows(data || []);
      setFailure('');
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
    return subscribeToTable({ table: 'result_changes', ...(eventId ? { filter: `event_id=eq.${eventId}` } : {}), onChange: load });
  }, [eventId, load]);

  const visible = useMemo(() => {
    const types = FILTERS.find((entry) => entry.key === filter)?.types;
    const term = search.trim().toLowerCase();
    return rows.filter((row) =>
      (!types || types.includes(row.change_type)) &&
      (!term || [row.target_label, row.reason, row.actor_email, row.event_title].some((value) => String(value || '').toLowerCase().includes(term)))
    );
  }, [filter, rows, search]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((entry) => [
    entry.key,
    entry.types ? rows.filter((row) => entry.types.includes(row.change_type)).length : rows.length,
  ])), [rows]);

  if (missing) return null;

  return (
    <div style={compact ? undefined : card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={eyebrow}>Audit trail</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Times are Philippine Standard Time (PHT, UTC+8). Entries cannot be edited or deleted.</p>
        </div>
        <input
          value={search}
          onChange={(changeEvent) => setSearch(changeEvent.target.value)}
          placeholder="Search record, reason, person…"
          aria-label="Search the change log"
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, minWidth: 220 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key)}
            style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: filter === entry.key ? '1px solid #2563eb' : '1px solid #e2e8f0', background: filter === entry.key ? '#eff6ff' : '#f8fafc', color: filter === entry.key ? '#1d4ed8' : '#64748b' }}
          >
            {entry.label} ({counts[entry.key] || 0})
          </button>
        ))}
      </div>

      {failure ? (
        <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{failure}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 18, textAlign: 'center', fontSize: 13, color: '#94a3b8', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          {rows.length === 0 ? 'No corrections, undos, redraws or reassignments yet.' : 'No entries match this filter.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12 }}>
                {['When (PHT)', 'Change', !eventId && 'Event', 'Affected record', 'Old → new', 'Reason', 'By'].filter(Boolean).map((header) => (
                  <th key={header} style={{ padding: '8px 8px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const meta = CHANGE_TYPES[row.change_type] || { label: row.change_type, icon: 'bi-dot', color: '#475569' };
                return (
                  <tr key={row.id} style={{ verticalAlign: 'top' }}>
                    <td style={{ ...cell, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} title={`UTC: ${row.occurred_at}`}>{row.occurred_at_ph}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap', color: meta.color, fontWeight: 800 }}><i className={`bi ${meta.icon}`} style={{ marginRight: 6 }} />{meta.label}</td>
                    {!eventId && <td style={cell}>{row.event_title || '—'}</td>}
                    <td style={cell}>{row.target_label || row.target_id}</td>
                    <td style={{ ...cell, color: '#334155' }}>{describeValues(row)}</td>
                    <td style={{ ...cell, color: '#0f172a' }}>{row.reason}</td>
                    <td style={cell}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.actor_email || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{row.actor_role || ''}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const card = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, boxShadow: '0 12px 32px rgba(37,99,235,0.07)', padding: 24 };
const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2563eb', marginBottom: 4 };
const cell = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', color: '#475569' };

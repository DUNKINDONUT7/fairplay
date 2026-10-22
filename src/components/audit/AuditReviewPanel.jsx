import { useCallback, useEffect, useMemo, useState } from 'react';
import ReasonDialog from '../common/ReasonDialog';
import { buildAuditFlags } from '../../utils/auditFlags';
import { subscribeToTable, supabase } from '../../utils/supabaseClient';

const SEVERITY_META = {
  high: { label: 'Important', color: '#b91c1c', background: '#fef2f2', border: '#fecaca', icon: 'bi-exclamation-octagon-fill' },
  medium: { label: 'Worth checking', color: '#b45309', background: '#fffbeb', border: '#fde68a', icon: 'bi-exclamation-triangle-fill' },
  low: { label: 'Low', color: '#475569', background: '#f8fafc', border: '#e2e8f0', icon: 'bi-info-circle-fill' },
};

const isMissing = (error) => /does not exist|schema cache|PGRST205|42P01|Could not find the table/i.test(`${error?.code || ''} ${error?.message || ''}`);

function formatPH(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : `${date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT`;
}

// W04: the audit entries an admin should act on first, at the top of the
// Audit page — so nobody has to read through every entry. Rules live in
// src/utils/auditFlags.js; reviews are saved in public.audit_flag_reviews.
export default function AuditReviewPanel({ auditRows = [], detections = [], onOpenRecord }) {
  const [resultChanges, setResultChanges] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewsAvailable, setReviewsAvailable] = useState(true);
  const [view, setView] = useState('open');
  const [severity, setSeverity] = useState('all');
  const [acting, setActing] = useState(null); // { flag, status }
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [changes, saved] = await Promise.all([
      supabase.from('result_changes_ph').select('*').order('occurred_at', { ascending: false }).limit(500),
      supabase.from('audit_flag_reviews').select('*'),
    ]);
    setResultChanges(changes.error ? [] : changes.data || []);
    if (saved.error) {
      setReviewsAvailable(!isMissing(saved.error));
      setReviews([]);
    } else {
      setReviewsAvailable(true);
      setReviews(saved.data || []);
    }
  }, []);

  useEffect(() => {
    load();
    const stopReviews = subscribeToTable({ table: 'audit_flag_reviews', onChange: load });
    const stopChanges = subscribeToTable({ table: 'result_changes', onChange: load });
    return () => { stopReviews?.(); stopChanges?.(); };
  }, [load]);

  const flags = useMemo(
    () => buildAuditFlags({ auditRows, resultChanges, detections, reviews }),
    [auditRows, resultChanges, detections, reviews]
  );
  const open = flags.filter((flag) => !flag.review);
  const counts = {
    high: open.filter((flag) => flag.severity === 'high').length,
    medium: open.filter((flag) => flag.severity === 'medium').length,
  };
  const visible = flags.filter((flag) =>
    (view === 'open' ? !flag.review : view === 'done' ? Boolean(flag.review) : true) &&
    (severity === 'all' || flag.severity === severity)
  );
  const shown = showAll ? visible : visible.slice(0, 8);

  const saveReview = async (note) => {
    const { error } = await supabase.from('audit_flag_reviews').upsert({
      flag_key: acting.flag.key,
      status: acting.status,
      note,
    });
    if (error) throw new Error(isMissing(error)
      ? 'Saving reviews is not set up in the database yet (supabase/revisions/04_audit_flag_reviews.sql).'
      : error.message);
    setActing(null);
    await load();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={eyebrow}>Needs review</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            {open.length === 0 ? 'Nothing needs checking' : `${open.length} thing${open.length === 1 ? '' : 's'} to check`}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', maxWidth: 640 }}>
            FairPlay picks out the changes that may need your attention — deleted records, account type changes, results edited outside the app, many deletions at once, corrections and redraws — and lists them here, most important first. Check each one, then mark it reviewed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['high', 'medium'].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setSeverity(severity === level ? 'all' : level)}
              style={{ padding: '8px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'center', minWidth: 96, border: `1px solid ${severity === level ? SEVERITY_META[level].color : SEVERITY_META[level].border}`, background: SEVERITY_META[level].background }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, color: SEVERITY_META[level].color }}>{counts[level]}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: SEVERITY_META[level].color }}>{SEVERITY_META[level].label}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['open', `To check (${open.length})`], ['done', `Already checked (${flags.length - open.length})`], ['all', `Everything flagged (${flags.length})`]].map(([value, text]) => (
          <button key={value} type="button" onClick={() => setView(value)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: view === value ? '1px solid #2563eb' : '1px solid #e2e8f0', background: view === value ? '#eff6ff' : '#f8fafc', color: view === value ? '#1d4ed8' : '#64748b' }}>
            {text}
          </button>
        ))}
        {severity !== 'all' && (
          <button type="button" onClick={() => setSeverity('all')} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#ffffff', color: '#475569' }}>
            <i className="bi bi-x" /> {SEVERITY_META[severity].label} only
          </button>
        )}
      </div>

      {!reviewsAvailable && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
          <i className="bi bi-info-circle" style={{ marginRight: 6 }} />
          Flags are shown from the log. Saving “reviewed” needs the database update in supabase/revisions/04_audit_flag_reviews.sql.
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: '#94a3b8', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          <i className="bi bi-check2-circle" style={{ fontSize: 22, display: 'block', color: '#22c55e', marginBottom: 6 }} />
          {view === 'open' ? 'All caught up — nothing needs checking right now.' : 'Nothing here.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map((flag) => {
            const meta = SEVERITY_META[flag.severity] || SEVERITY_META.low;
            return (
              <div key={flag.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, border: `1px solid ${flag.review ? '#e2e8f0' : meta.border}`, borderLeft: `4px solid ${flag.review ? '#94a3b8' : meta.color}`, background: flag.review ? '#f8fafc' : '#ffffff' }}>
                <i className={`bi ${meta.icon}`} style={{ color: flag.review ? '#94a3b8' : meta.color, fontSize: 18, marginTop: 2 }} />
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{flag.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: meta.color, background: meta.background, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#334155', marginTop: 3, overflowWrap: 'anywhere' }}>{flag.detail}</div>
                  {flag.why && !flag.review && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 4, padding: '6px 10px', borderRadius: 8, background: '#f8fafc' }}>
                      <strong>Why check this:</strong> {flag.why}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Done by {flag.actor}{flag.actorRole ? ` (${flag.actorRole})` : ''} · {formatPH(flag.occurredAt)}
                  </div>
                  {flag.review && (
                    <div style={{ fontSize: 12, color: '#15803d', marginTop: 6 }}>
                      <i className="bi bi-check2-circle" style={{ marginRight: 4 }} />
                      {flag.review.status === 'dismissed' ? 'Dismissed' : 'Reviewed'} by {flag.review.reviewed_by_email || 'admin'} · {formatPH(flag.review.reviewed_at)} — “{flag.review.note}”
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {flag.source === 'audit_log' && onOpenRecord && (
                    <button type="button" onClick={() => onOpenRecord(flag)} style={smallBtn}><i className="bi bi-search" /> View entry</button>
                  )}
                  {!flag.review && (
                    <>
                      <button type="button" disabled={!reviewsAvailable} onClick={() => setActing({ flag, status: 'reviewed' })} style={{ ...smallBtn, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4', opacity: reviewsAvailable ? 1 : 0.5 }}>
                        <i className="bi bi-check2" /> Mark reviewed
                      </button>
                      <button type="button" disabled={!reviewsAvailable} onClick={() => setActing({ flag, status: 'dismissed' })} style={{ ...smallBtn, opacity: reviewsAvailable ? 1 : 0.5 }}>
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length > 8 && (
            <button type="button" onClick={() => setShowAll(!showAll)} style={{ ...smallBtn, justifySelf: 'center', padding: '8px 14px' }}>
              {showAll ? 'Show fewer' : `Show all ${visible.length}`}
            </button>
          )}
        </div>
      )}

      <ReasonDialog
        open={Boolean(acting)}
        danger={false}
        title={acting?.status === 'dismissed' ? 'Dismiss this flag?' : 'Mark as reviewed?'}
        message={acting ? `${acting.flag.title}: ${acting.flag.detail}` : ''}
        reasonLabel={acting?.status === 'dismissed' ? 'Why is this not a problem?' : 'What did you check or do?'}
        reasonPlaceholder={acting?.status === 'dismissed' ? 'e.g. Test event removed by the organizer.' : 'e.g. Confirmed with the organizer; correction matches the referee sheet.'}
        confirmLabel={acting?.status === 'dismissed' ? 'Dismiss' : 'Mark Reviewed'}
        onCancel={() => setActing(null)}
        onConfirm={saveReview}
      />
    </div>
  );
}

const card = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, boxShadow: '0 12px 32px rgba(37,99,235,0.07)', padding: 24 };
const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 4 };
const smallBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer' };

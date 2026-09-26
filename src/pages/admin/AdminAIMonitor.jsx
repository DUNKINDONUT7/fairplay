import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useRegistrationStore from '../../store/registrationStore';
import useScoreStore from '../../store/scoreStore';
import { deriveAiDetections, fetchStoredAiDetections, upsertAiDetections } from '../../services/adminDataService';

const PAGE_SIZE = 8;

// Every flag comes from one of these checks; the id prefix says which.
const RULES = [
  { key: 'judge-score-outlier', title: 'Judge score far from others', icon: 'bi bi-person-exclamation', what: 'A judge scored a contestant 30% or more away from the other judges’ average (needs 3+ judges).' },
  { key: 'score-out-of-range', title: 'Score outside 0–100', icon: 'bi bi-123', what: 'A score contains a value below 0 or above 100.' },
  { key: 'duplicate-registration', title: 'Possible duplicate registration', icon: 'bi bi-files', what: 'The same person or team registered for the same event more than once.' },
  { key: 'event-over-capacity', title: 'Event over capacity', icon: 'bi bi-people', what: 'More participants than the event’s maximum.' },
  { key: 'active-no-registration', title: 'Active event with no registrations', icon: 'bi bi-calendar-x', what: 'An event is running but nobody is registered.' },
  { key: 'unknown-judge-checkin', title: 'Unknown judge check-in', icon: 'bi bi-qr-code-scan', what: 'A judge check-in does not match any user account.' },
];

const RISK_THEME = {
  high: { label: 'High risk', bg: '#fee2e2', fg: '#b91c1c', bar: '#ef4444' },
  medium: { label: 'Medium risk', bg: '#fef3c7', fg: '#b45309', bar: '#f59e0b' },
  low: { label: 'Low risk', bg: '#e0f2fe', fg: '#0369a1', bar: '#0ea5e9' },
};

const STATUS_TABS = [
  { value: 'open', label: 'Needs review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

function ruleFor(id) {
  return RULES.find((rule) => String(id).startsWith(`${rule.key}-`)) || { key: 'other', title: 'Flagged activity', icon: 'bi bi-flag', what: '' };
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminAIMonitor() {
  const { user, users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { scores, fetchScores } = useScoreStore();
  const { attendance, fetchAttendance } = useAttendanceStore();
  const { success, error: notifyError } = useNotificationStore();

  const [stored, setStored] = useState([]);
  const [storageOk, setStorageOk] = useState(true);
  // With cached records the checks can run immediately; only a cold start waits.
  const [loading, setLoading] = useState(() => useEventStore.getState().events.length === 0);
  const [statusTab, setStatusTab] = useState('open');
  const [riskFilter, setRiskFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(null); // { id, status }
  const [note, setNote] = useState('');
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    let active = true;
    fetchStoredAiDetections().then((rows) => {
      if (!active) return;
      setStorageOk(rows !== null);
      setStored(rows || []);
    });
    Promise.all([refreshProfiles(), fetchEvents(), fetchRegistrations(), fetchScores(), fetchAttendance()])
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchAttendance, fetchEvents, fetchRegistrations, fetchScores, refreshProfiles]);

  const scoreRows = useMemo(() => Object.values(scores || {}), [scores]);
  const derived = useMemo(
    () => deriveAiDetections({ users, events, registrations, scores: scoreRows, attendance }),
    [attendance, events, registrations, scoreRows, users],
  );

  // Live checks decide what is flagged; saved rows keep the review decision.
  const detections = useMemo(() => {
    const storedById = new Map(stored.map((item) => [item.id, item]));
    const derivedIds = new Set(derived.map((item) => item.id));
    const merged = derived.map((item) => {
      const saved = storedById.get(item.id);
      if (!saved) return { ...item, stillDetected: true };
      const { reviewedBy, reviewedByName, reviewedAt, reviewNote } = saved.metadata || {};
      return { ...item, status: saved.status, metadata: { ...item.metadata, reviewedBy, reviewedByName, reviewedAt, reviewNote }, stillDetected: true };
    });
    const historical = stored.filter((item) => !derivedIds.has(item.id)).map((item) => ({ ...item, stillDetected: false }));
    return [...merged, ...historical].sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [derived, stored]);

  const eventsById = useMemo(() => new Map(events.map((event) => [String(event.id), event])), [events]);
  const usersById = useMemo(() => new Map(users.map((entry) => [String(entry.id), entry])), [users]);

  const counts = useMemo(() => ({
    open: detections.filter((d) => d.status === 'open').length,
    highOpen: detections.filter((d) => d.status === 'open' && d.riskLevel === 'high').length,
    reviewed: detections.filter((d) => d.status === 'reviewed').length,
    dismissed: detections.filter((d) => d.status === 'dismissed').length,
  }), [detections]);

  const perRule = useMemo(() => {
    const map = {};
    detections.forEach((d) => {
      if (d.status !== 'open') return;
      const key = ruleFor(d.id).key;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [detections]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return detections.filter((d) => {
      if (statusTab !== 'all' && d.status !== statusTab) return false;
      if (riskFilter !== 'all' && d.riskLevel !== riskFilter) return false;
      if (!term) return true;
      const eventTitle = eventsById.get(String(d.metadata?.eventId || (d.targetType === 'event' ? d.targetId : '')))?.title || '';
      return [d.targetName, d.actorName, d.reason, eventTitle, ruleFor(d.id).title]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [detections, eventsById, riskFilter, search, statusTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [statusTab, riskFilter, search]);

  async function applyStatus(item, status, reviewNote = '') {
    setSavingId(item.id);
    const reopened = status === 'open';
    const updated = {
      ...item,
      status,
      metadata: {
        ...item.metadata,
        reviewedBy: reopened ? null : user?.id || null,
        reviewedByName: reopened ? null : user?.name || user?.email || 'Admin',
        reviewedAt: reopened ? null : new Date().toISOString(),
        reviewNote: reopened ? null : reviewNote.trim() || null,
      },
    };
    try {
      const [saved] = await upsertAiDetections([updated]);
      setStored((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      success(status === 'reviewed' ? 'Marked as reviewed.' : status === 'dismissed' ? 'Dismissed as a false alarm.' : 'Moved back to Needs review.');
      setPending(null);
      setNote('');
    } catch {
      notifyError('Could not save this decision. Please try again.');
    } finally {
      setSavingId('');
    }
  }

  return (
    <DashboardLayout title="AI Monitoring" subtitle="Automatic checks that spot unusual scores, registrations, and events for you to review">
      <div style={{ maxWidth: 1240, display: 'grid', gap: 20 }}>
        {!storageOk && (
          <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13 }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: 8 }} />
            Saved review decisions could not be loaded, so every flag is shown as needing review.
          </div>
        )}

        {/* At a glance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 16 }}>
          <StatTile icon="bi bi-inbox" label="Needs review" value={counts.open} hint={counts.open ? 'Waiting for an admin to check' : 'All caught up'} tone={counts.open ? 'warning' : 'success'} />
          <StatTile icon="bi bi-exclamation-octagon" label="High risk, open" value={counts.highOpen} hint={counts.highOpen ? 'Look at these first' : 'Nothing urgent'} tone={counts.highOpen ? 'danger' : 'success'} />
          <StatTile icon="bi bi-check2-circle" label="Reviewed" value={counts.reviewed} hint="Checked and confirmed" tone="info" />
          <StatTile icon="bi bi-slash-circle" label="Dismissed" value={counts.dismissed} hint="Marked as false alarms" tone="muted" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          {/* Flags */}
          <section style={{ ...cardStyle, flex: '2 1 560px', minWidth: 0 }}>
            <header style={{ ...cardHeaderStyle, flexWrap: 'wrap' }}>
              <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_TABS.map((tab) => {
                  const active = statusTab === tab.value;
                  const count = tab.value === 'all' ? detections.length : counts[tab.value];
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStatusTab(tab.value)}
                      style={{ padding: '7px 14px', borderRadius: 999, border: active ? '1px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#2563eb' : '#ffffff', color: active ? '#ffffff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }}
                    >
                      {tab.label}
                      <span style={{ padding: '0 7px', borderRadius: 999, background: active ? 'rgba(255,255,255,0.22)' : '#f1f5f9', fontSize: 11 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, event, reason" aria-label="Search flags" style={{ ...fieldStyle, width: 220, paddingLeft: 32 }} />
                </div>
                <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} aria-label="Filter by risk" style={{ ...fieldStyle, width: 'auto' }}>
                  <option value="all">All risk levels</option>
                  <option value="high">High risk</option>
                  <option value="medium">Medium risk</option>
                  <option value="low">Low risk</option>
                </select>
              </div>
            </header>

            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              {loading ? (
                <div style={emptyStyle}><i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />Running checks...</div>
              ) : paged.length === 0 ? (
                <div style={emptyStyle}>
                  <i className={statusTab === 'open' && !search && riskFilter === 'all' ? 'bi bi-shield-check' : 'bi bi-search'} style={{ fontSize: 32, display: 'block', marginBottom: 10, color: statusTab === 'open' ? '#10b981' : '#94a3b8' }} />
                  <div style={{ fontWeight: 800, color: '#334155' }}>
                    {statusTab === 'open' && !search && riskFilter === 'all' ? 'Nothing needs review' : 'No flags match'}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {statusTab === 'open' && !search && riskFilter === 'all' ? 'The checks found nothing unusual right now.' : 'Try another tab, risk level, or search.'}
                  </div>
                </div>
              ) : paged.map((item) => (
                <FlagCard
                  key={item.id}
                  item={item}
                  event={eventsById.get(String(item.metadata?.eventId || (item.targetType === 'event' ? item.targetId : '')))}
                  reviewer={item.metadata?.reviewedBy ? usersById.get(String(item.metadata.reviewedBy)) : null}
                  pending={pending?.id === item.id ? pending.status : null}
                  note={note}
                  saving={savingId === item.id}
                  onNoteChange={setNote}
                  onStart={(status) => { setPending({ id: item.id, status }); setNote(''); }}
                  onCancel={() => { setPending(null); setNote(''); }}
                  onConfirm={() => applyStatus(item, pending.status, note)}
                  onReopen={() => applyStatus(item, 'open')}
                />
              ))}

              {!loading && totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} style={{ ...iconButtonStyle, opacity: currentPage === 1 ? 0.4 : 1 }} aria-label="Previous page"><i className="bi bi-chevron-left" /></button>
                    <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} style={{ ...iconButtonStyle, opacity: currentPage === totalPages ? 0.4 : 1 }} aria-label="Next page"><i className="bi bi-chevron-right" /></button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* What we check */}
          <section style={{ ...cardStyle, flex: '1 1 300px', minWidth: 0 }}>
            <header style={cardHeaderStyle}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ ...iconChipStyle, background: '#ede9fe', color: '#6d28d9' }}><i className="bi bi-radar" /></span>
                <div>
                  <h2 style={cardTitleStyle}>What we check</h2>
                  <p style={cardTextStyle}>Runs automatically every time this page opens.</p>
                </div>
              </div>
            </header>
            <div style={{ padding: '12px 20px 20px', display: 'grid', gap: 8 }}>
              {RULES.map((rule) => {
                const count = perRule[rule.key] || 0;
                return (
                  <div key={rule.key} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 12, background: count ? '#fffbeb' : '#f8fafc', border: `1px solid ${count ? '#fde68a' : '#eef2f7'}` }}>
                    <i className={rule.icon} style={{ fontSize: 16, color: count ? '#b45309' : '#94a3b8', marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{rule.title}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: count ? '#b45309' : '#15803d', whiteSpace: 'nowrap' }}>{count ? `${count} open` : 'Clear'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.45 }}>{rule.what}</div>
                    </div>
                  </div>
                );
              })}
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                A flag is a prompt to take a look, not proof of wrongdoing. Mark it reviewed once checked, or dismiss it if it is a false alarm.
              </p>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FlagCard({ item, event, reviewer, pending, note, saving, onNoteChange, onStart, onCancel, onConfirm, onReopen }) {
  const rule = ruleFor(item.id);
  const risk = RISK_THEME[item.riskLevel] || RISK_THEME.low;
  const isScore = item.targetType === 'score';
  const judgeAvg = Number(item.metadata?.judgeAverage);
  const groupAvg = Number(item.metadata?.groupMean);
  const showCompare = rule.key === 'judge-score-outlier' && Number.isFinite(judgeAvg) && Number.isFinite(groupAvg);
  const scaleMax = Math.max(10, judgeAvg, groupAvg);
  const eventLink = event ? (isScore ? `/events/${event.id}/leaderboard` : `/events/${event.id}`) : null;
  const decided = item.status === 'reviewed' || item.status === 'dismissed';

  return (
    <article style={{ border: '1px solid #e2e8f0', borderLeft: `4px solid ${risk.bar}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12, background: decided ? '#fcfcfd' : '#ffffff' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ ...iconChipStyle, width: 38, height: 38, fontSize: 16, background: risk.bg, color: risk.fg }}><i className={rule.icon} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{rule.title}</h3>
            <span style={{ ...pillStyle, background: risk.bg, color: risk.fg }}>{risk.label}</span>
            {item.status === 'reviewed' && <span style={{ ...pillStyle, background: '#dcfce7', color: '#15803d' }}><i className="bi bi-check2" /> Reviewed</span>}
            {item.status === 'dismissed' && <span style={{ ...pillStyle, background: '#f1f5f9', color: '#475569' }}>Dismissed</span>}
            {!item.stillDetected && <span style={{ ...pillStyle, background: '#ecfdf5', color: '#047857' }} title="The data that caused this flag has changed">No longer detected</span>}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isScore ? (
              <>
                <span><i className="bi bi-person-badge" style={{ marginRight: 4 }} />Judge: <strong style={{ color: '#334155' }}>{item.actorName || 'Unknown'}</strong></span>
                <span><i className="bi bi-person" style={{ marginRight: 4 }} />Contestant: <strong style={{ color: '#334155' }}>{item.targetName || 'Unknown'}</strong></span>
              </>
            ) : (
              <span><i className="bi bi-bullseye" style={{ marginRight: 4 }} /><strong style={{ color: '#334155' }}>{item.targetName || item.targetId}</strong>{item.actorName ? ` · by ${item.actorName}` : ''}</span>
            )}
            {event && <span><i className="bi bi-calendar-event" style={{ marginRight: 4 }} />{event.title}</span>}
            <span title={new Date(item.detectedAt).toLocaleString()}><i className="bi bi-clock" style={{ marginRight: 4 }} />{formatWhen(item.detectedAt)}</span>
          </div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.55 }}>{item.reason}</p>

      {showCompare && (
        <div style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
          {[
            ['This judge', judgeAvg, risk.bar],
            ['Other judges (avg)', groupAvg, '#64748b'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>{label}</span>
              <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0' }}>
                <div style={{ width: `${Math.min(100, (value / scaleMax) * 100)}%`, height: 8, borderRadius: 999, background: color }} />
              </div>
              <span style={{ fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{value.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      {decided && (item.metadata?.reviewedByName || item.metadata?.reviewNote) && (
        <div style={{ fontSize: 12, color: '#475569', padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
          <strong>{item.status === 'dismissed' ? 'Dismissed' : 'Reviewed'}</strong>
          {` by ${reviewer?.name || item.metadata?.reviewedByName || 'an admin'}`}
          {item.metadata?.reviewedAt ? ` · ${formatWhen(item.metadata.reviewedAt)}` : ''}
          {item.metadata?.reviewNote && <div style={{ marginTop: 4, color: '#334155' }}>“{item.metadata.reviewNote}”</div>}
        </div>
      )}

      {pending ? (
        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: pending === 'dismissed' ? '#f8fafc' : '#f0fdf4', border: `1px solid ${pending === 'dismissed' ? '#e2e8f0' : '#bbf7d0'}` }}>
          <label htmlFor={`note-${item.id}`} style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
            {pending === 'dismissed' ? 'Why is this a false alarm? (optional)' : 'What did you check or do? (optional)'}
          </label>
          <textarea
            id={`note-${item.id}`}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            maxLength={300}
            placeholder={pending === 'dismissed' ? 'e.g. Judge confirmed the score is correct.' : 'e.g. Talked to the judge, score was a typo and fixed.'}
            style={{ ...fieldStyle, resize: 'vertical' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} disabled={saving} style={ghostButtonStyle}>Cancel</button>
            <button type="button" onClick={onConfirm} disabled={saving} style={{ ...primaryButtonStyle, background: pending === 'dismissed' ? '#475569' : '#16a34a', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : pending === 'dismissed' ? 'Dismiss flag' : 'Mark as reviewed'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {decided ? (
            <button type="button" onClick={onReopen} disabled={saving} style={ghostButtonStyle}>
              <i className={saving ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-arrow-counterclockwise'} /> Reopen
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onStart('reviewed')} style={{ ...primaryButtonStyle, background: '#16a34a' }}>
                <i className="bi bi-check2-circle" /> Mark as reviewed
              </button>
              <button type="button" onClick={() => onStart('dismissed')} style={ghostButtonStyle}>
                <i className="bi bi-slash-circle" /> Dismiss
              </button>
            </>
          )}
          {eventLink && (
            <Link to={eventLink} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {isScore ? 'View scores' : 'View event'} <i className="bi bi-box-arrow-up-right" />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

const TONES = {
  success: { bg: '#ecfdf5', fg: '#047857' },
  warning: { bg: '#fffbeb', fg: '#b45309' },
  danger: { bg: '#fef2f2', fg: '#b91c1c' },
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  muted: { bg: '#f1f5f9', fg: '#475569' },
};

function StatTile({ icon, label, value, hint, tone }) {
  const colors = TONES[tone] || TONES.info;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ ...iconChipStyle, background: colors.bg, color: colors.fg }}><i className={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const cardHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #eef2f7' };
const cardTitleStyle = { margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' };
const cardTextStyle = { margin: '3px 0 0', fontSize: 12, color: '#64748b' };
const iconChipStyle = { width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 };
const pillStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const fieldStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const iconButtonStyle = { width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const emptyStyle = { padding: '36px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 };

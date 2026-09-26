import { Fragment, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';

const APPROVER_ROLES = ['institute-coordinator', 'sports-head', 'osds'];

const ROLE_NAMES = {
  'institute-coordinator': 'Institute Coordinator',
  'sports-head': 'Sports Head',
  osds: 'OSDS',
};

const EVENT_STATUS = {
  draft: { label: 'Draft', bg: '#f1f5f9', fg: '#64748b' },
  pending: { label: 'Waiting for approval', bg: '#fef3c7', fg: '#b45309' },
  upcoming: { label: 'Upcoming', bg: '#e0f2fe', fg: '#075985' },
  approved: { label: 'Approved', bg: '#dcfce7', fg: '#15803d' },
  active: { label: 'Happening now', bg: '#dcfce7', fg: '#15803d' },
  ongoing: { label: 'Happening now', bg: '#dcfce7', fg: '#15803d' },
  completed: { label: 'Completed', bg: '#f1f5f9', fg: '#334155' },
  rejected: { label: 'Rejected', bg: '#fee2e2', fg: '#b91c1c' },
};

const TABS = [
  { value: 'action', label: 'Needs your action' },
  { value: 'progress', label: 'In progress' },
  { value: 'approved', label: 'Fully approved' },
  { value: 'rejected', label: 'Rejected' },
];

function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

// Where an event sits in its chain: the first step that is not yet approved
// is the one that can act next; a rejection anywhere ends the chain.
function chainState(workflow) {
  const rejected = workflow.find((step) => step.status === 'rejected');
  if (rejected) return { kind: 'rejected', current: null, rejected };
  const current = workflow.find((step) => step.status !== 'approved');
  if (!current) return { kind: 'approved', current: null };
  return { kind: 'progress', current };
}

export default function AdminRoles() {
  const { user } = useAuthStore();
  const { events, fetchEvents, submitApprovalAction } = useEventStore();
  const { success, error } = useNotificationStore();
  const [tab, setTab] = useState('action');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null); // { event, step, decision }
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === 'admin';
  const myRole = APPROVER_ROLES.includes(user?.role) ? user.role : null;

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const items = useMemo(() => events
    .filter((event) => Array.isArray(event.approvalWorkflow) && event.approvalWorkflow.length > 0)
    .map((event) => {
      const state = chainState(event.approvalWorkflow);
      const canAct = state.kind === 'progress' && (isAdmin || state.current.role === myRole);
      const bucket = state.kind === 'progress' ? (canAct ? 'action' : 'progress') : state.kind;
      return { event, state, canAct, bucket };
    }), [events, isAdmin, myRole]);

  const counts = useMemo(() => items.reduce((acc, item) => ({ ...acc, [item.bucket]: (acc[item.bucket] || 0) + 1 }), {}), [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => item.bucket === tab
      && (!term || [item.event.title, item.event.type, item.event.location].some((v) => String(v || '').toLowerCase().includes(term))));
  }, [items, search, tab]);

  function openDialog(event, step, decision) {
    setDialog({ event, step, decision });
    setNote('');
  }

  async function confirmDecision() {
    const { event, step, decision } = dialog;
    if (decision === 'rejected' && !note.trim()) return;
    setSaving(true);
    const roleName = step.label || ROLE_NAMES[step.role] || titleCase(step.role);
    const actingForOtherRole = user?.role !== step.role;
    const actorName = actingForOtherRole ? `${user?.name || 'Admin'} (as ${roleName})` : user?.name || roleName;
    try {
      await submitApprovalAction({
        eventId: event.id,
        role: step.role,
        decision,
        actor: { id: user?.id, name: actorName },
        notes: note.trim(),
      });
      success(decision === 'approved' ? `Approved “${event.title}” as ${roleName}.` : `Rejected “${event.title}”.`);
      setDialog(null);
    } catch {
      error('Could not save this decision. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const subtitle = isAdmin
    ? 'Events move from Institute Coordinator to Sports Head to OSDS. As admin you can act on any step.'
    : `Events waiting for you as ${ROLE_NAMES[myRole] || 'an approver'} appear under “Needs your action”.`;

  return (
    <DashboardLayout title="Approval Workflow" subtitle={subtitle}>
      {dialog && (
        <DecisionDialog
          dialog={dialog}
          note={note}
          saving={saving}
          isAdmin={isAdmin}
          userRole={user?.role}
          onNoteChange={setNote}
          onCancel={() => setDialog(null)}
          onConfirm={confirmDecision}
        />
      )}

      <div style={{ maxWidth: 1180, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div role="tablist" aria-label="Filter events" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TABS.map((item) => {
              const active = tab === item.value;
              const count = counts[item.value] || 0;
              const highlight = item.value === 'action' && count > 0;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: active ? '#2563eb' : '#ffffff',
                    color: active ? '#ffffff' : '#475569',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {item.label}
                  <span style={{ padding: '0 8px', borderRadius: 999, fontSize: 11, background: active ? 'rgba(255,255,255,0.22)' : highlight ? '#fef3c7' : '#f1f5f9', color: active ? '#ffffff' : highlight ? '#b45309' : '#64748b' }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ position: 'relative' }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events" aria-label="Search events" style={{ ...fieldStyle, width: 240, paddingLeft: 32 }} />
          </div>
        </div>

        {visible.length === 0 ? (
          <div style={{ ...cardStyle, padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <i className={tab === 'action' ? 'bi bi-check2-all' : 'bi bi-inbox'} style={{ fontSize: 32, display: 'block', marginBottom: 10, color: tab === 'action' ? '#10b981' : '#94a3b8' }} />
            <div style={{ fontWeight: 800, color: '#334155' }}>
              {search ? 'No events match your search' : tab === 'action' ? 'You’re all caught up' : 'Nothing here yet'}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {search ? 'Try a different name.' : tab === 'action' ? 'No events are waiting for your approval.' : 'Events will appear here as they move through approval.'}
            </div>
          </div>
        ) : visible.map(({ event, state, canAct }) => {
          const status = EVENT_STATUS[event.status] || { label: titleCase(event.status), bg: '#f1f5f9', fg: '#475569' };
          const current = state.current;
          const currentName = current ? current.label || ROLE_NAMES[current.role] || titleCase(current.role) : '';
          return (
            <article key={event.id} style={{ ...cardStyle, padding: 0 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', padding: '18px 22px', borderBottom: '1px solid #eef2f7' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{event.title}</h2>
                    <span style={{ ...pillStyle, background: status.bg, color: status.fg }}>{status.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#64748b', marginTop: 6 }}>
                    {event.type && <span><i className="bi bi-tag" style={{ marginRight: 5 }} />{titleCase(event.type)}</span>}
                    {event.startDate && <span><i className="bi bi-calendar3" style={{ marginRight: 5 }} />{formatDate(event.startDate)}</span>}
                    {event.location && <span><i className="bi bi-geo-alt" style={{ marginRight: 5 }} />{event.location}</span>}
                  </div>
                </div>

                {canAct ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => openDialog(event, current, 'rejected')} style={rejectButtonStyle}>
                      <i className="bi bi-x-lg" /> Reject
                    </button>
                    <button type="button" onClick={() => openDialog(event, current, 'approved')} style={approveButtonStyle}>
                      <i className="bi bi-check-lg" /> Approve{isAdmin && current.role !== user?.role ? ` as ${currentName}` : ''}
                    </button>
                  </div>
                ) : state.kind === 'progress' ? (
                  <span style={{ ...pillStyle, background: '#f1f5f9', color: '#475569', padding: '6px 12px', fontSize: 12 }}>
                    <i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />Waiting for {currentName}
                  </span>
                ) : null}
              </header>

              <div style={{ padding: '20px 22px' }}>
                <Stepper workflow={event.approvalWorkflow} currentRole={current?.role} />
                {state.kind === 'rejected' && state.rejected?.notes && (
                  <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b' }}>
                    <strong>Reason for rejection:</strong> {state.rejected.notes}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

function Stepper({ workflow, currentRole }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
      {workflow.map((step, index) => {
        const name = step.label || ROLE_NAMES[step.role] || titleCase(step.role);
        const isCurrent = step.role === currentRole;
        const theme = step.status === 'approved'
          ? { icon: 'bi bi-check-lg', dot: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', text: 'Approved', textColor: '#15803d' }
          : step.status === 'rejected'
            ? { icon: 'bi bi-x-lg', dot: '#dc2626', bg: '#fef2f2', border: '#fecaca', text: 'Rejected', textColor: '#b91c1c' }
            : isCurrent
              ? { icon: 'bi bi-hourglass-split', dot: '#d97706', bg: '#fffbeb', border: '#fde68a', text: 'Waiting for decision', textColor: '#b45309' }
              : { icon: null, dot: '#cbd5e1', bg: '#f8fafc', border: '#eef2f7', text: 'Not started', textColor: '#94a3b8' };
        return (
          <Fragment key={step.role}>
            {index > 0 && (
              <li aria-hidden="true" style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1' }}>
                <i className="bi bi-chevron-right" />
              </li>
            )}
            <li style={{ flex: '1 1 200px', display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 14, background: theme.bg, border: `1px solid ${theme.border}` }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: theme.dot, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {theme.icon ? <i className={theme.icon} /> : index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step {index + 1}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{name}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textColor, marginTop: 2 }}>{theme.text}</div>
                {step.actedByName && (step.status === 'approved' || step.status === 'rejected') && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    by {step.actedByName}{step.actedAt ? ` · ${formatDate(step.actedAt, true)}` : ''}
                  </div>
                )}
                {step.notes && step.status === 'approved' && (
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>“{step.notes}”</div>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function DecisionDialog({ dialog, note, saving, isAdmin, userRole, onNoteChange, onCancel, onConfirm }) {
  const { event, step, decision } = dialog;
  const approving = decision === 'approved';
  const roleName = step.label || ROLE_NAMES[step.role] || titleCase(step.role);
  const needsReason = !approving && !note.trim();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, saving]);

  return (
    <div onClick={saving ? undefined : onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1400, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="decision-title" style={{ width: 'min(480px, 100%)', background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 24px 80px rgba(15,23,42,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px', display: 'flex', gap: 14, alignItems: 'center', borderBottom: '1px solid #eef2f7' }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: approving ? '#dcfce7' : '#fee2e2', color: approving ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            <i className={approving ? 'bi bi-check-lg' : 'bi bi-x-lg'} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 id="decision-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{approving ? 'Approve this event?' : 'Reject this event?'}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</p>
          </div>
        </div>
        <div style={{ padding: 22, display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
            {approving
              ? `This records the ${roleName} approval${isAdmin && userRole !== step.role ? ' on their behalf' : ''} and passes the event to the next step.`
              : 'Rejecting stops the approval chain. The organizer will see your reason.'}
          </p>
          <label htmlFor="decision-note" style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
            {approving ? 'Note (optional)' : 'Reason for rejecting (required)'}
          </label>
          <textarea
            id="decision-note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder={approving ? 'e.g. Venue and schedule confirmed.' : 'e.g. Schedule conflicts with the university foundation day.'}
            style={{ ...fieldStyle, resize: 'vertical' }}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #eef2f7' }}>
          <button type="button" onClick={onCancel} disabled={saving} style={ghostButtonStyle}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || needsReason}
            style={{ ...(approving ? approveButtonStyle : { ...approveButtonStyle, background: '#dc2626' }), opacity: saving || needsReason ? 0.5 : 1, cursor: saving || needsReason ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving...' : approving ? 'Approve' : 'Reject event'}
          </button>
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const pillStyle = { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const fieldStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const approveButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#ffffff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const rejectButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: '1px solid #fecaca', background: '#ffffff', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghostButtonStyle = { padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' };

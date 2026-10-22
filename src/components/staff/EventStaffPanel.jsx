import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReasonDialog from '../common/ReasonDialog';
import {
  DELIVERY_LABELS,
  STAFF_CSV_TEMPLATE,
  STAFF_STATUS_LABELS,
  addStaff,
  getActivationLink,
  importStaffRows,
  listEventStaff,
  markDelivery,
  replaceStaff,
  revokeStaff,
  sendInvitationEmail,
  validateStaffCsv,
} from '../../services/staffService';
import { subscribeToTable } from '../../utils/supabaseClient';

const TOURNAMENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

const STATUS_COLORS = {
  invited: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  active: { fg: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  revoked: { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  replaced: { fg: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};

const DELIVERY_COLORS = {
  not_sent: '#94a3b8',
  sent: '#15803d',
  failed: '#b91c1c',
  link_copied: '#2563eb',
};

function formatPH(value) {
  if (!value) return '';
  return `${new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT`;
}

function downloadTemplate() {
  const blob = new Blob([STAFF_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fairplay-staff-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// Organizer: the judges and scorers of one event (W01 / W10). Assigning
// someone creates an invitation only; they become active when they open
// their activation link and sign in with the invited email. Revoke and
// replace keep the old record and ask for a reason (logged).
export default function EventStaffPanel({ event, onNotify }) {
  const subEvents = useMemo(() => (Array.isArray(event?.subEvents) ? event.subEvents.filter((entry) => entry?.name) : []), [event?.subEvents]);
  const defaultRole = TOURNAMENT_TYPES.includes(event?.eventType || event?.type) ? 'scorer' : 'judge';

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [filter, setFilter] = useState('current');
  const [form, setForm] = useState({ fullName: '', email: '', role: defaultRole, subEventId: '' });
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [csv, setCsv] = useState(null); // { fileName, valid, invalid, error }
  const [importReport, setImportReport] = useState(null);
  const [importing, setImporting] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [replacing, setReplacing] = useState(null);
  const [replacement, setReplacement] = useState({ fullName: '', email: '' });
  const fileRef = useRef(null);

  const notify = useCallback((tone, text) => onNotify?.(tone, text), [onNotify]);

  const load = useCallback(async () => {
    if (!event?.id) return;
    try {
      setStaff(await listEventStaff(event.id));
      setFailure('');
    } catch (error) {
      setFailure(error.message);
    } finally {
      setLoading(false);
    }
  }, [event?.id]);

  useEffect(() => {
    load();
    return subscribeToTable({ table: 'event_staff', filter: `event_id=eq.${event?.id}`, onChange: load });
  }, [event?.id, load]);

  const visible = staff.filter((entry) => (filter === 'current' ? ['invited', 'active'].includes(entry.status) : true));
  const counts = {
    judges: staff.filter((entry) => entry.role === 'judge' && entry.status === 'active').length,
    scorers: staff.filter((entry) => entry.role === 'scorer' && entry.status === 'active').length,
    pending: staff.filter((entry) => entry.status === 'invited').length,
  };

  const handleAdd = async (submitEvent) => {
    submitEvent.preventDefault();
    setAdding(true);
    try {
      const subEvent = subEvents.find((entry) => String(entry.id) === String(form.subEventId)) || null;
      await addStaff(event.id, {
        role: form.role,
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        subEventId: subEvent ? String(subEvent.id) : null,
        subEventName: subEvent?.name || null,
      });
      notify('success', `${form.fullName.trim()} was assigned as ${form.role}. Send or copy their activation link.`);
      setForm({ fullName: '', email: '', role: form.role, subEventId: form.subEventId });
      await load();
    } catch (error) {
      notify('error', error.message);
    } finally {
      setAdding(false);
    }
  };

  const copyLink = async (entry) => {
    setBusyId(entry.id);
    try {
      const link = await getActivationLink(entry.id);
      await navigator.clipboard.writeText(link);
      await markDelivery(entry.id, 'link_copied');
      notify('success', `Activation link for ${entry.fullName} copied. Send it to them directly.`);
      await load();
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusyId(null);
    }
  };

  const sendEmail = async (entry) => {
    setBusyId(entry.id);
    try {
      const result = await sendInvitationEmail(entry, event);
      notify(result.sent ? 'success' : 'error', result.sent
        ? `Invitation emailed to ${entry.email}.`
        : `The email to ${entry.email} was not delivered (${result.error}). Copy the link and send it another way.`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onFile = async (changeEvent) => {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = '';
    if (!file) return;
    const text = await file.text();
    setImportReport(null);
    setCsv({ fileName: file.name, ...validateStaffCsv(text, { existing: staff, subEvents }) });
  };

  const runImport = async () => {
    if (!csv?.valid?.length) return;
    setImporting(true);
    try {
      const results = await importStaffRows(event.id, csv.valid);
      setImportReport({ results, invalid: csv.invalid });
      setCsv(null);
      const added = results.filter((row) => row.status === 'added').length;
      notify(added > 0 ? 'success' : 'error', `${added} of ${results.length + csv.invalid.length} row(s) imported. No invitation has been sent yet.`);
      await load();
    } finally {
      setImporting(false);
    }
  };

  const confirmRevoke = async (reason) => {
    await revokeStaff(revoking.id, reason);
    notify('success', `${revoking.fullName}'s access was revoked. Their saved scores stay on record under their name.`);
    setRevoking(null);
    await load();
  };

  const confirmReplace = async (reason) => {
    await replaceStaff(replacing.id, replacement, reason);
    notify('success', `${replacement.fullName} replaces ${replacing.fullName}. Send the new activation link.`);
    setReplacing(null);
    await load();
  };

  const nameOf = (id) => staff.find((entry) => entry.id === id)?.fullName || 'previous assignee';

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={eyebrow}>Judges &amp; Scorers</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Event Staff Accounts</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', maxWidth: 620, lineHeight: 1.6 }}>
            Each judge and scorer signs in with their own account. Judges score the rubric; scorers record match results.
            You cannot be a judge or scorer of your own event.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['Active judges', counts.judges], ['Active scorers', counts.scorers], ['Not activated', counts.pending]].map(([label, value]) => (
            <div key={label} style={{ padding: '8px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center', minWidth: 92 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Add one person */}
      <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end', padding: 14, borderRadius: 14, background: '#f8fbff', border: '1px solid #dbeafe' }}>
        <label style={label}>
          Full name
          <input required value={form.fullName} onChange={(changeEvent) => setForm({ ...form, fullName: changeEvent.target.value })} placeholder="e.g. Maria Santos" style={input} />
        </label>
        <label style={label}>
          Email
          <input required type="email" value={form.email} onChange={(changeEvent) => setForm({ ...form, email: changeEvent.target.value })} placeholder="name@school.edu.ph" style={input} />
        </label>
        <label style={label}>
          Role
          <select value={form.role} onChange={(changeEvent) => setForm({ ...form, role: changeEvent.target.value })} style={input}>
            <option value="judge">Judge (rubric scores)</option>
            <option value="scorer">Scorer (match results)</option>
          </select>
        </label>
        {subEvents.length > 0 && (
          <label style={label}>
            Sub-event
            <select value={form.subEventId} onChange={(changeEvent) => setForm({ ...form, subEventId: changeEvent.target.value })} style={input}>
              <option value="">Whole event</option>
              {subEvents.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" disabled={adding} style={{ ...primaryBtn, opacity: adding ? 0.6 : 1 }}>
          <i className="bi bi-person-plus" /> {adding ? 'Assigning…' : 'Assign'}
        </button>
      </form>

      {/* CSV import */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 4px' }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current?.click()} style={secondaryBtn}><i className="bi bi-filetype-csv" /> Import CSV</button>
        <button type="button" onClick={downloadTemplate} style={{ ...secondaryBtn, background: '#ffffff' }}><i className="bi bi-download" /> CSV template</button>
        <span style={{ fontSize: 12, color: '#64748b' }}>Columns: <code>full_name, email, role, sub_event</code> (role = judge or scorer; sub_event optional)</span>
      </div>

      {csv && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Check before importing: {csv.fileName}</div>
          {csv.error ? (
            <div role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{csv.error}</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                <strong style={{ color: '#15803d' }}>{csv.valid.length} ready</strong> · <strong style={{ color: '#b91c1c' }}>{csv.invalid.length} with problems</strong> (rows with problems are skipped)
              </div>
              {csv.invalid.length > 0 && (
                <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#b91c1c', maxHeight: 140, overflowY: 'auto' }}>
                  {csv.invalid.map((row) => <li key={row.line}>Row {row.line}{row.email ? ` (${row.email})` : ''}: {row.error}</li>)}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={runImport} disabled={importing || csv.valid.length === 0} style={{ ...primaryBtn, opacity: importing || csv.valid.length === 0 ? 0.5 : 1 }}>
                  {importing ? 'Importing…' : `Import ${csv.valid.length} row(s)`}
                </button>
                <button type="button" onClick={() => setCsv(null)} style={secondaryBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {importReport && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 13, color: '#14532d' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Import result</div>
          <div>
            Added: {importReport.results.filter((row) => row.status === 'added').length} ·
            Duplicates: {importReport.results.filter((row) => row.status === 'duplicate').length} ·
            Failed: {importReport.results.filter((row) => row.status === 'failed').length} ·
            Skipped (invalid): {importReport.invalid.length}
          </div>
          {importReport.results.filter((row) => row.status !== 'added').map((row) => (
            <div key={row.line} style={{ color: '#b91c1c' }}>Row {row.line} ({row.email}): {row.error}</div>
          ))}
          <div style={{ marginTop: 6, color: '#166534' }}>Importing does not send invitations. Use “Email invite” or “Copy link” for each person below.</div>
          <button type="button" onClick={() => setImportReport(null)} style={{ ...secondaryBtn, marginTop: 8, background: '#ffffff' }}>Dismiss</button>
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>Assigned staff</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['current', 'Current'], ['all', 'All, incl. revoked & replaced']].map(([value, text]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: filter === value ? '1px solid #2563eb' : '1px solid #e2e8f0', background: filter === value ? '#eff6ff' : '#f8fafc', color: filter === value ? '#1d4ed8' : '#64748b' }}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {failure && <div role="alert" style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{failure}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading staff…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          No judges or scorers assigned yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {visible.map((entry) => {
            const colors = STATUS_COLORS[entry.status] || STATUS_COLORS.invited;
            const busy = busyId === entry.id;
            return (
              <div key={entry.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.fg}`, background: '#ffffff' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>
                    {entry.fullName}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', borderRadius: 999, padding: '2px 8px', textTransform: 'capitalize' }}>{entry.role}</span>
                    {entry.subEventName && <span style={{ marginLeft: 6, fontSize: 11, color: '#475569' }}>· {entry.subEventName}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', overflowWrap: 'anywhere' }}>{entry.email}</div>
                  {entry.replacesId && <div style={{ fontSize: 11, color: '#475569' }}>Replaces {nameOf(entry.replacesId)} (same judging seat)</div>}
                  {entry.statusReason && <div style={{ fontSize: 11, color: '#64748b' }}>Reason: {entry.statusReason}</div>}
                </div>
                <div style={{ display: 'grid', gap: 3, fontSize: 11, minWidth: 170 }}>
                  <span style={{ fontWeight: 800, color: colors.fg }}>{STAFF_STATUS_LABELS[entry.status]}{entry.activatedAt ? ` · ${formatPH(entry.activatedAt)}` : ''}</span>
                  {entry.status === 'invited' && (
                    <span style={{ color: DELIVERY_COLORS[entry.deliveryStatus] }} title={entry.deliveryError || ''}>
                      {DELIVERY_LABELS[entry.deliveryStatus]}{entry.deliveredAt ? ` · ${formatPH(entry.deliveredAt)}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {entry.status === 'invited' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => sendEmail(entry)} style={smallBtn}><i className="bi bi-envelope" /> Email invite</button>
                      <button type="button" disabled={busy} onClick={() => copyLink(entry)} style={smallBtn}><i className="bi bi-link-45deg" /> Copy link</button>
                    </>
                  )}
                  {['invited', 'active'].includes(entry.status) && (
                    <button type="button" disabled={busy} onClick={() => { setReplacement({ fullName: '', email: '' }); setReplacing(entry); }} style={smallBtn}>
                      <i className="bi bi-arrow-left-right" /> Replace
                    </button>
                  )}
                  {['invited', 'active'].includes(entry.status) && (
                    <button type="button" disabled={busy} onClick={() => setRevoking(entry)} style={{ ...smallBtn, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }}>
                      <i className="bi bi-slash-circle" /> Revoke
                    </button>
                  )}
                  {entry.status === 'revoked' && (
                    <button type="button" disabled={busy} onClick={() => { setReplacement({ fullName: '', email: '' }); setReplacing(entry); }} style={smallBtn}>
                      <i className="bi bi-person-plus" /> Assign replacement
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReasonDialog
        open={Boolean(revoking)}
        title={`Revoke ${revoking?.fullName || ''}'s access?`}
        message="They will no longer be able to open this event or save scores. Scores they already saved stay on record under their name."
        confirmLabel="Revoke Access"
        reasonPlaceholder="e.g. Did not arrive; replaced by another judge."
        onCancel={() => setRevoking(null)}
        onConfirm={confirmRevoke}
      />
      <ReasonDialog
        open={Boolean(replacing)}
        danger={false}
        title={`Replace ${replacing?.fullName || ''}`}
        message="The replacement gets their own account and activation link and takes over the same seat. Scores already saved stay attributed to the original person; for any contestant the replacement scores, the newer sheet is the one that counts."
        confirmLabel="Assign Replacement"
        canConfirm={replacement.fullName.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replacement.email.trim())}
        onCancel={() => setReplacing(null)}
        onConfirm={confirmReplace}
      >
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <label style={label}>
            Replacement's full name
            <input value={replacement.fullName} onChange={(changeEvent) => setReplacement({ ...replacement, fullName: changeEvent.target.value })} style={input} />
          </label>
          <label style={label}>
            Replacement's email
            <input type="email" value={replacement.email} onChange={(changeEvent) => setReplacement({ ...replacement, email: changeEvent.target.value })} style={input} />
          </label>
        </div>
      </ReasonDialog>
    </div>
  );
}

const card = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, boxShadow: '0 12px 32px rgba(37,99,235,0.07)', padding: 24 };
const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2563eb', marginBottom: 4 };
const label = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' };
const input = { padding: '10px 12px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#ffffff', textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: '#0f172a' };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#ffffff', fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const smallBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', fontWeight: 700, fontSize: 11, cursor: 'pointer' };

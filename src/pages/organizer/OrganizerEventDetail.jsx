import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useEventStore from '../../store/eventStore';
import useAudienceScoreStore from '../../store/audienceScoreStore';
import useJudgeStore from '../../store/judgeStore';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';
import { buildAppUrl } from '../../utils/appUrl';
import { inferTeamLimitConfig, getParticipantLimitMessage, TEAM_EVENT_CATEGORIES } from '../../utils/teamEventRules';

const TOURNAMENT_EVENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

function isLikelyTeamEvent(event) {
  const sport = String(event?.sportType || event?.eventType || event?.type || '').trim().toLowerCase();
  if (!sport) return false;
  return TEAM_EVENT_CATEGORIES.some((category) => category.toLowerCase() === sport) || sport === 'esports';
}

async function copyLink(value, { success, error }) {
  try {
    await navigator.clipboard.writeText(value);
    success('Link copied to clipboard.');
  } catch {
    error('Unable to copy — your browser blocked clipboard access.');
  }
}

function getSubEventName(subEvent) {
  return String(subEvent?.name || subEvent?.title || '').trim();
}

function formatEventDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function AddScorerModal({ event, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [subEventId, setSubEventId] = useState(event?.subEvents?.[0]?.id || '');
  const isSportsFest = event?.eventType === 'sportsfest';
  const subEvents = (event?.subEvents || []).filter((se) => getSubEventName(se));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleAdd() {
    if (!name.trim()) return;
    const selectedSub = subEvents.find((se) => se.id === subEventId);
    onAdd({
      name: name.trim(),
      subEventId: isSportsFest ? subEventId : null,
      subEventName: isSportsFest ? getSubEventName(selectedSub) : null,
    });
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Add Scorer</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>A unique QR code will be generated for this scorer.</p>

        <label style={modalLabel}>Scorer / Official Name</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="e.g. Sir Reyes"
          style={modalInput}
        />

        {isSportsFest && subEvents.length > 0 && (
          <>
            <label style={{ ...modalLabel, marginTop: 16 }}>Assigned Sub-event</label>
            <select value={subEventId} onChange={(e) => setSubEventId(e.target.value)} style={modalInput}>
              {subEvents.map((se) => (
                <option key={se.id} value={se.id}>{getSubEventName(se)}</option>
              ))}
            </select>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: name.trim() ? 'linear-gradient(135deg,#2563eb,#0ea5e9)' : '#e2e8f0', color: name.trim() ? '#fff' : '#94a3b8', fontWeight: 800, fontSize: 14, cursor: name.trim() ? 'pointer' : 'not-allowed' }}
          >
            <i className="bi bi-qr-code" style={{ marginRight: 6 }} />Generate QR
          </button>
        </div>
      </div>
    </div>
  );
}

function AddContestantModal({ event, onAdd, onClose }) {
  const teamConfig = inferTeamLimitConfig(event);
  const defaultType = isLikelyTeamEvent(event) ? 'team' : 'individual';
  const [name, setName] = useState('');
  const [type, setType] = useState(defaultType);
  const [members, setMembers] = useState(['', '']);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cleanMembers = members.map((m) => m.trim()).filter(Boolean);
  const outOfRange = type === 'team' && (cleanMembers.length < teamConfig.min || cleanMembers.length > teamConfig.max);
  const memberCountError = outOfRange ? getParticipantLimitMessage(teamConfig) : '';
  const canSubmit = name.trim() && (type === 'individual' || (cleanMembers.length > 0 && !memberCountError));

  function updateMember(index, value) {
    setMembers((current) => current.map((m, i) => (i === index ? value : m)));
  }

  function addMemberRow() {
    setMembers((current) => [...current, '']);
  }

  function removeMemberRow(index) {
    setMembers((current) => current.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onAdd(name.trim(), type, type === 'team' ? cleanMembers.map((memberName) => ({ name: memberName })) : []);
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>Add Participant</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: 4, borderRadius: 12, background: '#f1f5f9' }}>
          {['individual', 'team'].map((t) => (
            <button key={t} onClick={() => setType(t)} style={{ padding: '8px', borderRadius: 9, border: 'none', background: type === t ? '#fff' : 'transparent', color: type === t ? '#2563eb' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: type === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              <i className={t === 'individual' ? 'bi bi-person' : 'bi bi-people'} style={{ marginRight: 4 }} />
              {t === 'individual' ? 'Individual' : 'Team'}
            </button>
          ))}
        </div>

        {type === 'team' && isLikelyTeamEvent(event) && (
          <div style={{ fontSize: 12, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 10px', marginBottom: 14 }}>
            {teamConfig.label}: {getParticipantLimitMessage(teamConfig)}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          {type === 'individual' ? 'Full Name' : 'Team Name'}
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && type === 'individual') handleSubmit(); }}
          placeholder={type === 'individual' ? 'Juan dela Cruz' : 'Team Alpha'}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #cbd5e1', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', marginBottom: type === 'team' ? 16 : 20 }}
        />

        {type === 'team' && (
          <>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
              Team Members
            </label>
            <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
              {members.map((member, index) => (
                <div key={index} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={member}
                    onChange={(e) => updateMember(index, e.target.value)}
                    placeholder={`Member ${index + 1} full name`}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #cbd5e1', fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    onClick={() => removeMemberRow(index)}
                    disabled={members.length <= 1}
                    style={{ width: 36, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: members.length > 1 ? 'pointer' : 'not-allowed', opacity: members.length > 1 ? 1 : 0.4 }}
                  >
                    <i className="bi bi-trash3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addMemberRow}
              style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: memberCountError ? 8 : 20 }}
            >
              <i className="bi bi-plus-lg" /> Add another member
            </button>
            {memberCountError && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 20 }}>{memberCountError}</div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: canSubmit ? 'linear-gradient(135deg,#2563eb,#0ea5e9)' : '#e2e8f0', color: canSubmit ? '#fff' : '#94a3b8', fontWeight: 800, fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>Add</button>
        </div>
      </div>
    </div>
  );
}

function QRFullscreenModal({ value, label, code, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24, cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: 24, padding: 36,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          cursor: 'default', maxWidth: 420, width: '100%',
          boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </div>
        <QRCodeSVG value={value} size={280} bgColor="#ffffff" fgColor="#0f172a" level="H" includeMargin={false} />
        {code && (
          <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.12em' }}>
            {code}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#94a3b8', wordBreak: 'break-all', textAlign: 'center' }}>{value}</div>
        <button
          onClick={onClose}
          style={{ padding: '10px 24px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
        >
          <i className="bi bi-x-lg" style={{ marginRight: 8 }} />Close
        </button>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 20 }}>Tap outside or press Esc to close</p>
    </div>
  );
}

export default function OrganizerEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { success: notifySuccess, error: notifyError } = useNotificationStore();
  const { getEventById, fetchEvents, updateEvent } = useEventStore();
  const { fetchAudienceScores, getAudienceSummary, subscribeToAudienceScores } = useAudienceScoreStore();
  const { fetchInvites, inviteJudge, revokeInvite, deleteInvite, getInvitesForEvent } = useJudgeStore();
  const [fullscreenQR, setFullscreenQR] = useState(null);
  const [showAddContestant, setShowAddContestant] = useState(false);
  const [showAddScorer, setShowAddScorer] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [confirmingEndSession, setConfirmingEndSession] = useState(false);
  const [confirmingRevokeInvite, setConfirmingRevokeInvite] = useState(null);
  const [revokingInviteId, setRevokingInviteId] = useState(null);
  const [confirmingDeleteInvite, setConfirmingDeleteInvite] = useState(null);
  const [deletingInviteId, setDeletingInviteId] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [inviteSortOrder, setInviteSortOrder] = useState('newest');

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
    fetchAudienceScores(id);
    fetchInvites(id);
  }, [fetchAudienceScores, fetchEvents, fetchInvites, id, user?.id]);

  useEffect(() => {
    return subscribeToAudienceScores(id);
  }, [id, subscribeToAudienceScores]);

  const event = getEventById(id);

  async function handleAddContestant(name, type, members = []) {
    const existing = event.contestants || [];
    const newContestant = {
      id: `${type}-manual-${Date.now()}`,
      name,
      type,
      ...(type === 'team' ? { members } : {}),
    };
    await updateEvent(id, { contestants: [...existing, newContestant], participants: existing.length + 1 });
    setShowAddContestant(false);
  }

  async function handleBulkImportCsv(file) {
    if (!file) return;
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      // Skip an optional header row like "name,type"
      .filter((line) => !/^name\s*,?\s*(type)?$/i.test(line));

    const existing = event.contestants || [];
    const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
    const imported = [];

    rows.forEach((line, index) => {
      const [rawName, rawType] = line.split(',').map((v) => v?.trim());
      const name = rawName || '';
      if (!name || existingNames.has(name.toLowerCase())) return;
      const type = /team/i.test(rawType || '') ? 'team' : 'individual';
      existingNames.add(name.toLowerCase());
      imported.push({ id: `${type}-csv-${Date.now()}-${index}`, name, type });
    });

    if (imported.length === 0) {
      notifyError('No new participants found in that file — check for duplicates or an empty file.');
      return;
    }

    await updateEvent(id, { contestants: [...existing, ...imported], participants: existing.length + imported.length });
    notifySuccess(`Imported ${imported.length} participant${imported.length === 1 ? '' : 's'} from CSV.`);
  }

  // No-shows are marked, not deleted, so the roster and any scores already
  // submitted for them stay intact — this reuses the same
  // eliminatedContestantIds field the leaderboard's "cut to top N" already
  // writes to (see OrganizerScoring.jsx), which is exactly what
  // JudgeScoring.jsx and JudgeLiveScoring.jsx already filter their
  // contestant list against, so marking someone here removes them from
  // judges' scoring sheets immediately with no separate judge-side change.
  async function handleToggleNoShow(contestantId) {
    const current = new Set((event.eliminatedContestantIds || []).map(String));
    const key = String(contestantId);
    const wasNoShow = current.has(key);
    if (wasNoShow) {
      current.delete(key);
    } else {
      current.add(key);
    }
    await updateEvent(id, { eliminatedContestantIds: Array.from(current) });
    notifySuccess(wasNoShow ? 'Participant restored.' : 'Participant marked as a no-show.');
  }

  async function handleAddScorer({ name, subEventId, subEventName }) {
    const token = `scorer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assignment = {
      id: token,
      name,
      subEventId: subEventId || null,
      subEventName: subEventName || null,
      token,
      generatedAt: new Date().toISOString(),
    };
    const existing = event.scorerAssignments || [];
    await updateEvent(id, { scorerAssignments: [...existing, assignment] });
    setShowAddScorer(false);
    const url = buildAppUrl(`/scorer/session/${token}`);
    setFullscreenQR({ value: url, label: `Scorer: ${name}${subEventName ? ` · ${subEventName}` : ''}`, code: null, scorerName: name, subEventName });
  }

  async function handleRemoveScorer(scorerToken) {
    const updated = (event.scorerAssignments || []).filter((a) => a.token !== scorerToken);
    await updateEvent(id, { scorerAssignments: updated });
  }

  async function handleToggleScoringStatus() {
    setStatusUpdating(true);
    const next = event.scoringActive ? false : true;
    await updateEvent(id, { scoringActive: next, status: next ? 'active' : 'completed' });
    setStatusUpdating(false);
    setConfirmingEndSession(false);
  }

  if (!event) {
    return (
      <DashboardLayout title="Event Detail" subtitle="">
        <div style={{ textAlign: 'center', padding: 64, color: '#64748b' }}>
          <i className="bi bi-calendar-x" style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Event not found</div>
          <button onClick={() => navigate('/organizer/events')} style={secondaryBtn}>
            Back to My Events
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const judgeQRValue = buildAppUrl(`/judge/open/${event.id}`);
  const participantQRValue = buildAppUrl(`/participant/register?eventId=${event.id}`);
  const audienceQRValue = buildAppUrl(`/audience/${event.id}`);
  const audienceEnabled = Boolean(event.audienceImpactEnabled ?? event.audienceImpact);
  const audienceSummary = getAudienceSummary(event.id);

  async function handleToggleAudienceVoting() {
    await updateEvent(id, { audienceVotingOpen: !event.audienceVotingOpen });
  }

  async function handleInviteJudge(e) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviteSending(true);
    setInviteError('');
    try {
      await inviteJudge(event.id, event.title, { name: inviteName.trim(), email: inviteEmail.trim() });
      setInviteName('');
      setInviteEmail('');
    } catch (err) {
      setInviteError(err.message || 'Unable to send invite.');
    } finally {
      setInviteSending(false);
    }
  }

  async function handleRevokeInvite() {
    if (!confirmingRevokeInvite) return;
    setRevokingInviteId(confirmingRevokeInvite.id);
    try {
      await revokeInvite(confirmingRevokeInvite.id, event.id);
      notifySuccess(`${confirmingRevokeInvite.judgeName}'s access has been canceled.`);
    } catch (err) {
      notifyError(err.message || 'Unable to revoke this invite.');
    } finally {
      setRevokingInviteId(null);
      setConfirmingRevokeInvite(null);
    }
  }

  async function handleDeleteInvite() {
    if (!confirmingDeleteInvite) return;
    setDeletingInviteId(confirmingDeleteInvite.id);
    try {
      await deleteInvite(confirmingDeleteInvite.id, event.id);
      notifySuccess(`Removed the invite for ${confirmingDeleteInvite.judgeName}.`);
    } catch (err) {
      notifyError(err.message || 'Unable to delete this invite.');
    } finally {
      setDeletingInviteId(null);
      setConfirmingDeleteInvite(null);
    }
  }

  const judgeInvites = getInvitesForEvent(event.id);
  const inviteCounts = judgeInvites.reduce((acc, invite) => {
    acc.all += 1;
    acc[invite.status] = (acc[invite.status] || 0) + 1;
    return acc;
  }, { all: 0, pending: 0, claimed: 0, revoked: 0 });
  const INVITE_STATUS_RANK = { pending: 0, claimed: 1, revoked: 2 };
  const INVITE_STATUS_STYLES = {
    pending: { fg: '#64748b', bg: 'rgba(100,116,139,0.12)', border: '#cbd5e1' },
    claimed: { fg: '#047857', bg: 'rgba(16,185,129,0.12)', border: '#86efac' },
    revoked: { fg: '#b91c1c', bg: 'rgba(220,38,38,0.12)', border: '#fca5a5' },
  };
  const INVITE_FILTER_OPTIONS = [
    { key: 'all', label: 'All', count: inviteCounts.all },
    { key: 'pending', label: 'Pending', count: inviteCounts.pending || 0 },
    { key: 'claimed', label: 'Claimed', count: inviteCounts.claimed || 0 },
    { key: 'revoked', label: 'Revoked', count: inviteCounts.revoked || 0 },
  ].filter((chip) => chip.key === 'all' || chip.count > 0);
  const filteredInvites = judgeInvites
    .filter((invite) => {
      if (inviteStatusFilter !== 'all' && invite.status !== inviteStatusFilter) return false;
      if (!inviteSearch.trim()) return true;
      const q = inviteSearch.trim().toLowerCase();
      return invite.judgeName.toLowerCase().includes(q) || invite.judgeEmail.toLowerCase().includes(q);
    })
    // Pending needs the organizer's attention soonest, so it leads even
    // though the list is otherwise date-ordered — only matters once a
    // single "All" view is mixing statuses; a status filter already narrows
    // to one bucket, so the date order alone governs there.
    .sort((a, b) => {
      if (inviteStatusFilter === 'all') {
        const rankDiff = (INVITE_STATUS_RANK[a.status] ?? 1) - (INVITE_STATUS_RANK[b.status] ?? 1);
        if (rankDiff !== 0) return rankDiff;
      }
      const dateDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return inviteSortOrder === 'oldest' ? dateDiff : -dateDiff;
    });

  return (
    <>
    <ConfirmDialog
      open={confirmingEndSession}
      title="End the scoring session?"
      message="This marks the event as completed and removes it from active/upcoming lists. Judges will no longer be able to submit new scores. You can still finalize scores from the Scoring page afterward."
      confirmLabel="End Session"
      onCancel={() => setConfirmingEndSession(false)}
      onConfirm={handleToggleScoringStatus}
    />
    <ConfirmDialog
      open={Boolean(confirmingRevokeInvite)}
      title="Cancel this judge's access?"
      message={confirmingRevokeInvite ? `${confirmingRevokeInvite.judgeName} (${confirmingRevokeInvite.judgeEmail}) will no longer be able to use the emailed scoring link, even if they already opened it. This removes their access for this event until a new invite is sent.` : ''}
      confirmLabel="Cancel Access"
      onCancel={() => setConfirmingRevokeInvite(null)}
      onConfirm={handleRevokeInvite}
    />
    {fullscreenQR && (
      <QRFullscreenModal
        value={fullscreenQR.value}
        label={fullscreenQR.label}
        code={fullscreenQR.code}
        onClose={() => setFullscreenQR(null)}
      />
    )}
    {showAddContestant && (
      <AddContestantModal
        event={event}
        onAdd={handleAddContestant}
        onClose={() => setShowAddContestant(false)}
      />
    )}
    {showAddScorer && (
      <AddScorerModal
        event={event}
        onAdd={handleAddScorer}
        onClose={() => setShowAddScorer(false)}
      />
    )}
    <DashboardLayout
      title={event.title}
      subtitle={`${event.eventType || event.type} • ${event.location || 'Venue TBD'}`}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 20 }}>
        {/* Back + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <button onClick={() => navigate('/organizer/events')} style={secondaryBtn}>
            <i className="bi bi-arrow-left" /> Back to My Events
          </button>
          <span style={{
            padding: '6px 14px', borderRadius: 999, fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
            background: event.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
            color: event.status === 'active' ? '#10b981' : '#64748b',
          }}>
            {event.status}
          </span>
        </div>

        {/* Event Info */}
        <div style={card}>
          <div style={eyebrow}>Event Overview</div>
          <h2 style={panelTitle}>{event.title}</h2>
          <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: 20 }}>
            {event.description || 'No description provided.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Type', value: event.eventType || event.type },
              { label: 'Format', value: event.format || 'In-person' },
              { label: 'Start Date', value: formatEventDate(event.startDate) },
              { label: 'End Date', value: formatEventDate(event.endDate) },
              { label: 'Location', value: event.location || '—' },
              { label: 'Scoring', value: event.scoringType || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={statTile}>
                <div style={statLabel}>{label}</div>
                <div style={statValue}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Competition Mode Badge */}
        {event.competitionMode && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 16px', borderRadius: 999, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', background: event.competitionMode === 'tournament' ? 'rgba(14,165,233,0.12)' : 'rgba(139,92,246,0.12)', color: event.competitionMode === 'tournament' ? '#0ea5e9' : '#8b5cf6' }}>
              <i className={`bi ${event.competitionMode === 'tournament' ? 'bi-diagram-3' : 'bi-star'}`} style={{ marginRight: 6 }} />
              {event.competitionMode === 'tournament' ? `Bracket · ${event.bracketType || 'single'}` : 'Score-based Performance'}
            </span>
            {event.competitionMode === 'performance' && Array.isArray(event.rounds) && (
              <span style={{ padding: '6px 16px', borderRadius: 999, fontWeight: 700, fontSize: 12, background: 'rgba(139,92,246,0.08)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
                {event.rounds.map((r) => r.name).join(' → ')}
              </span>
            )}
          </div>
        )}

        {/* Scoring Session Control */}
        <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={eyebrow}>Scoring Session</div>
            <h2 style={{ ...panelTitle, marginBottom: 4 }}>
              {event.scoringActive ? 'Session is Live' : 'Session is Closed'}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              {event.scoringActive
                ? 'Judges can currently score participants.'
                : 'Start the session to allow judges to submit scores.'}
            </p>
          </div>
          <button
            onClick={() => (event.scoringActive ? setConfirmingEndSession(true) : handleToggleScoringStatus())}
            disabled={statusUpdating}
            style={{
              padding: '12px 24px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: 14, cursor: statusUpdating ? 'not-allowed' : 'pointer',
              background: event.scoringActive ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
              color: '#fff', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              boxShadow: event.scoringActive ? '0 6px 20px rgba(239,68,68,0.25)' : '0 6px 20px rgba(37,99,235,0.25)',
              opacity: statusUpdating ? 0.7 : 1,
            }}
          >
            {statusUpdating
              ? <><i className="bi bi-arrow-repeat animate-spin" /> Updating...</>
              : event.scoringActive
                ? <><i className="bi bi-stop-circle" /> End Scoring Session</>
                : <><i className="bi bi-play-circle" /> Start Scoring Session</>
            }
          </button>
        </div>

        {/* Contestants */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={eyebrow}>Registered</div>
              <h2 style={{ ...panelTitle, marginBottom: 0 }}>Participants ({(event.contestants || []).length})</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setShowAddContestant(true)} style={secondaryBtn}>
                <i className="bi bi-plus-lg" /> Add Participant
              </button>
              <label style={{ ...secondaryBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-upload" /> Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    handleBulkImportCsv(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '-8px 0 16px' }}>
            CSV format: one participant per line — <span className="mono">Full Name</span> or <span className="mono">Full Name,team</span> to mark a team entry.
          </p>
          {(!event.contestants || event.contestants.length === 0) ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No participants yet. They register via the Participant QR, or add them manually above.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {event.contestants.map((c) => {
                const isNoShow = (event.eliminatedContestantIds || []).map(String).includes(String(c.id));
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      background: isNoShow ? '#fef2f2' : '#f8fafc',
                      border: `1px solid ${isNoShow ? '#fecaca' : '#e2e8f0'}`,
                      fontSize: 14,
                      fontWeight: 600,
                      color: isNoShow ? '#94a3b8' : '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      textDecoration: isNoShow ? 'line-through' : 'none',
                    }}
                  >
                    <i className={c.type === 'team' ? 'bi bi-people' : 'bi bi-person'} style={{ color: isNoShow ? '#94a3b8' : '#2563eb', fontSize: 12 }} />
                    {c.name}
                    {c.type === 'team' && Array.isArray(c.members) && c.members.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', borderRadius: 999, padding: '2px 8px' }}>
                        {c.members.length} member{c.members.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {isNoShow && (
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: '#dc2626', background: '#fee2e2', borderRadius: 999, padding: '2px 8px', textDecoration: 'none' }}>
                        NO-SHOW
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleNoShow(c.id)}
                      title={isNoShow ? 'Restore this participant' : 'Mark as no-show'}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: isNoShow ? '#16a34a' : '#dc2626',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: '2px 4px',
                        textDecoration: 'none',
                      }}
                    >
                      <i className={isNoShow ? 'bi bi-arrow-counterclockwise' : 'bi bi-person-dash'} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Criteria */}
        <div style={card}>
          <div style={eyebrow}>Judging Rubric</div>
          <h2 style={panelTitle}>Criteria</h2>
          {(!event.criteria || event.criteria.length === 0) ? (
            <p style={{ color: '#94a3b8' }}>No criteria configured for this event.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {event.criteria.map((criterion, i) => (
                <div key={criterion.id || i} style={{ ...nestedPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{criterion.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{criterion.description}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Range: {criterion.scoringRange || '1-10'} &nbsp;•&nbsp; {criterion.judgeInstructions}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: '#2563eb', whiteSpace: 'nowrap' }}>
                    {criterion.weight}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR Codes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {/* Judge QR — performance events only */}
          {!TOURNAMENT_EVENT_TYPES.includes(event.eventType) && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={eyebrow}>Judge Access</div>
                  <h2 style={panelTitle}>Judge QR Code</h2>
                </div>
                <button
                  onClick={() => setFullscreenQR({ value: judgeQRValue, label: 'Judge Access', code: null })}
                  style={{ ...secondaryBtn, padding: '8px 12px' }}
                  title="Show fullscreen"
                >
                  <i className="bi bi-fullscreen" /> Fullscreen
                </button>
              </div>
              <div
                onClick={() => setFullscreenQR({ value: judgeQRValue, label: 'Judge Access', code: null })}
                style={{ cursor: 'pointer', padding: 12, borderRadius: 16, border: '2px dashed #bfdbfe', transition: 'border-color 0.2s' }}
                title="Click to view fullscreen"
              >
                <QRCodeSVG value={judgeQRValue} size={180} bgColor="#ffffff" fgColor="#0f172a" level="H" includeMargin={false} />
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>Judges scan this QR — no login required</div>
              <button onClick={() => copyLink(judgeQRValue, { success: notifySuccess, error: notifyError })} style={secondaryBtn}>
                <i className="bi bi-copy" /> Copy Judge Link
              </button>
              <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                Anyone with this link can score — invite a judge by email below for verified access.
              </div>

              {/* Invite Judges — collapsible, verified per-judge email access */}
              <div
                style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  borderRadius: 18,
                  border: '1px solid #dbeafe',
                  background: '#f8fbff',
                  overflow: 'hidden',
                  boxShadow: '0 8px 20px rgba(37, 99, 235, 0.06)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowInvitePanel((v) => !v)}
                  style={{
                    alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', border: 'none', background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(14,165,233,0.08))',
                    color: '#0f172a', fontWeight: 800, fontSize: 14, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#fff', fontSize: 15 }}>
                      <i className="bi bi-envelope-paper" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Verified access</div>
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 800 }}>Invite Judges {judgeInvites.length > 0 ? `(${judgeInvites.length})` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ padding: '5px 9px', borderRadius: 999, background: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: 11, fontWeight: 800 }}>
                      {judgeInvites.length}
                    </span>
                    <i className={`bi ${showInvitePanel ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: '#2563eb' }} />
                  </div>
                </button>

                {showInvitePanel && (
                  <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 14, padding: 16, background: '#ffffff' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Judge name</label>
                        <input
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          placeholder="e.g. Rica"
                          style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#fff' }}
                          disabled={inviteSending}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email address</label>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="judge@email.com"
                          style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#fff' }}
                          disabled={inviteSending}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                        Invite a judge by email. The message includes the event schedule plus a secure access link for scoring.
                        <div style={{ marginTop: 4, color: '#475569' }}>
                          QR codes stay available as an emergency fallback; you can revoke access anytime if a judge no longer needs to attend.
                        </div>
                      </div>
                      <button
                        type="submit"
                        onClick={handleInviteJudge}
                        disabled={inviteSending || !inviteName.trim() || !inviteEmail.trim()}
                        style={{
                          padding: '11px 18px', borderRadius: 12, border: 'none',
                          background: inviteSending || !inviteName.trim() || !inviteEmail.trim()
                            ? 'linear-gradient(135deg, #cbd5e1, #94a3b8)'
                            : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
                          color: '#fff', fontWeight: 800, fontSize: 13,
                          cursor: inviteSending || !inviteName.trim() || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
                          boxShadow: inviteSending || !inviteName.trim() || !inviteEmail.trim() ? 'none' : '0 10px 20px rgba(37,99,235,0.25)',
                        }}
                      >
                        <i className="bi bi-send-fill" style={{ marginRight: 6 }} />
                        {inviteSending ? 'Sending...' : 'Send Invite'}
                      </button>
                    </div>

                    {inviteError && (
                      <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '8px 10px' }}>
                        {inviteError}
                      </div>
                    )}

                    {judgeInvites.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Invite list
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {INVITE_FILTER_OPTIONS.map((chip) => (
                              <button
                                key={chip.key}
                                type="button"
                                onClick={() => setInviteStatusFilter(chip.key)}
                                style={{
                                  padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  border: inviteStatusFilter === chip.key ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                  background: inviteStatusFilter === chip.key ? 'rgba(37,99,235,0.1)' : '#f8fafc',
                                  color: inviteStatusFilter === chip.key ? '#2563eb' : '#64748b',
                                }}
                              >
                                {chip.label} ({chip.count})
                              </button>
                            ))}
                          </div>
                        </div>

                        <input
                          value={inviteSearch}
                          onChange={(e) => setInviteSearch(e.target.value)}
                          placeholder="Search by name or email..."
                          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12, outline: 'none', background: '#fff' }}
                        />

                        {filteredInvites.length === 0 ? (
                          <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12, color: '#94a3b8', borderRadius: 12, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                            {inviteSearch.trim() || inviteStatusFilter !== 'all'
                              ? 'No judges match this filter.'
                              : 'No invites yet.'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                            {filteredInvites.map((invite) => {
                              const statusStyle = INVITE_STATUS_STYLES[invite.status] || INVITE_STATUS_STYLES.pending;
                              return (
                                <div
                                  key={invite.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 12, background: '#ffffff',
                                    border: `1px solid ${statusStyle.border}`, borderLeft: `4px solid ${statusStyle.fg}`,
                                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
                                  }}
                                >
                                  <div style={{
                                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: statusStyle.bg, color: statusStyle.fg, fontWeight: 800, fontSize: 13,
                                    border: `1px solid ${statusStyle.border}`,
                                  }} aria-hidden="true">
                                    {invite.judgeName.trim().charAt(0).toUpperCase() || '?'}
                                  </div>

                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={invite.judgeName}>
                                      {invite.judgeName}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={invite.judgeEmail}>
                                      {invite.judgeEmail}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <span style={{
                                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                                      minWidth: 62, textAlign: 'center', whiteSpace: 'nowrap',
                                      background: statusStyle.bg, color: statusStyle.fg, border: `1px solid ${statusStyle.border}`,
                                      textTransform: 'capitalize',
                                    }}>
                                      {invite.status}
                                    </span>
                                    {invite.status !== 'revoked' && (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmingRevokeInvite(invite)}
                                        disabled={revokingInviteId === invite.id}
                                        title="Cancel this judge's access"
                                        style={{
                                          padding: '6px 12px', borderRadius: 999, border: '1px solid #fecaca', whiteSpace: 'nowrap',
                                          background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700,
                                          cursor: revokingInviteId === invite.id ? 'not-allowed' : 'pointer',
                                          opacity: revokingInviteId === invite.id ? 0.6 : 1,
                                        }}
                                      >
                                        Cancel Access
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Participant QR */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={eyebrow}>Participant Registration</div>
                <h2 style={panelTitle}>Participant QR Code</h2>
              </div>
              <button
                onClick={() => setFullscreenQR({ value: participantQRValue, label: 'Participant Registration', code: null })}
                style={{ ...secondaryBtn, padding: '8px 12px' }}
                title="Show fullscreen"
              >
                <i className="bi bi-fullscreen" /> Fullscreen
              </button>
            </div>
            <div
              onClick={() => setFullscreenQR({ value: participantQRValue, label: 'Participant Registration', code: null })}
              style={{ cursor: 'pointer', padding: 12, borderRadius: 16, border: '2px dashed #bfdbfe' }}
              title="Click to view fullscreen"
            >
              <QRCodeSVG value={participantQRValue} size={180} bgColor="#ffffff" fgColor="#0f172a" level="H" includeMargin={false} />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Tap QR to view fullscreen for scanning</div>
            <button onClick={() => copyLink(participantQRValue, { success: notifySuccess, error: notifyError })} style={secondaryBtn}>
              <i className="bi bi-copy" /> Copy Participant Link
            </button>
          </div>
        </div>

        {audienceEnabled && (
          <div style={card}>
            <div style={eyebrow}>Audience Impact</div>
            <h2 style={panelTitle}>Audience QR and Results</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
                <div onClick={() => setFullscreenQR({ value: audienceQRValue, label: 'Audience Impact Scoring', code: null })} style={{ cursor: 'pointer', padding: 12, borderRadius: 16, border: '2px dashed #bbf7d0' }}>
                  <QRCodeSVG value={audienceQRValue} size={170} bgColor="#ffffff" fgColor="#0f172a" level="H" includeMargin={false} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button onClick={() => copyLink(audienceQRValue, { success: notifySuccess, error: notifyError })} style={secondaryBtn}>
                    <i className="bi bi-copy" /> Copy Link
                  </button>
                  <button onClick={handleToggleAudienceVoting} style={{ ...secondaryBtn, background: event.audienceVotingOpen ? '#fee2e2' : '#dcfce7', borderColor: event.audienceVotingOpen ? '#fecaca' : '#bbf7d0', color: event.audienceVotingOpen ? '#dc2626' : '#15803d' }}>
                    <i className={`bi ${event.audienceVotingOpen ? 'bi-stop-circle' : 'bi-play-circle'}`} />
                    {event.audienceVotingOpen ? 'Close Voting' : 'Open Voting'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                  {audienceSummary.totalSubmissions} submissions - Voting {event.audienceVotingOpen ? 'open' : 'closed'}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {(event.contestants || []).map((contestant) => {
                  const row = audienceSummary.byContestant[String(contestant.id)];
                  return (
                    <div key={contestant.id} style={{ ...nestedPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{contestant.name || contestant.teamName}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{row?.count || 0} audience submission{row?.count === 1 ? '' : 's'}</div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#059669' }}>{row ? row.averageScore.toFixed(2) : '--'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Scorer Assignments — tournament events only */}
        {TOURNAMENT_EVENT_TYPES.includes(event.eventType) && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={eyebrow}>Game Officials</div>
                <h2 style={{ ...panelTitle, marginBottom: 0 }}>Scorer QR Codes</h2>
              </div>
              <button onClick={() => setShowAddScorer(true)} style={secondaryBtn}>
                <i className="bi bi-plus-lg" /> Add Scorer
              </button>
            </div>

            {(!event.scorerAssignments || event.scorerAssignments.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>
                <i className="bi bi-person-badge" style={{ fontSize: 32, display: 'block', marginBottom: 10 }} />
                No scorers assigned yet. Click "Add Scorer" to generate a QR per official.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {event.scorerAssignments.map((assignment) => {
                  const url = buildAppUrl(`/scorer/session/${assignment.token}`);
                  return (
                    <div key={assignment.id} style={{ ...nestedPanel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'relative' }}>
                      <button
                        onClick={() => handleRemoveScorer(assignment.token)}
                        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: 4 }}
                        title="Remove scorer"
                      >
                        <i className="bi bi-trash3" />
                      </button>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{assignment.name}</div>
                        {assignment.subEventName && (
                          <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>
                            <i className="bi bi-diagram-3" style={{ marginRight: 4 }} />{assignment.subEventName}
                          </div>
                        )}
                      </div>

                      <div
                        onClick={() => setFullscreenQR({ value: url, label: `${assignment.name}${assignment.subEventName ? ` · ${assignment.subEventName}` : ''}`, code: null })}
                        style={{ cursor: 'pointer', padding: 10, borderRadius: 12, border: '2px dashed #bfdbfe' }}
                        title="Click to view fullscreen"
                      >
                        <QRCodeSVG value={url} size={120} bgColor="#ffffff" fgColor="#0f172a" level="H" includeMargin={false} />
                      </div>

                      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                        <button
                          onClick={() => setFullscreenQR({ value: url, label: `${assignment.name}${assignment.subEventName ? ` · ${assignment.subEventName}` : ''}`, code: null })}
                          style={{ ...secondaryBtn, flex: 1, justifyContent: 'center', fontSize: 12 }}
                        >
                          <i className="bi bi-fullscreen" /> Show
                        </button>
                        <button
                          onClick={() => copyLink(url, { success: notifySuccess, error: notifyError })}
                          style={{ ...secondaryBtn, flex: 1, justifyContent: 'center', fontSize: 12 }}
                        >
                          <i className="bi bi-copy" /> Copy
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sub-events if any */}
        {event.subEvents && event.subEvents.length > 0 && (
          <div style={card}>
            <div style={eyebrow}>Sub-events</div>
            <h2 style={panelTitle}>Competition Structure</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {event.subEvents.map((sub, i) => (
                <div key={sub.id || i} style={nestedPanel}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{getSubEventName(sub)}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {sub.category} • {sub.format} • {sub.tournamentFormat}
                  </div>
                  <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>
                    Max: {sub.maxParticipants || '—'} participants
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
    </>
  );
}

const card = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 18,
  padding: 24,
  boxShadow: '0 8px 24px rgba(37,99,235,0.07)',
};

const nestedPanel = {
  padding: 16,
  borderRadius: 14,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const eyebrow = {
  color: '#2563eb',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 700,
  marginBottom: 6,
};

const panelTitle = {
  color: '#0f172a',
  fontSize: 20,
  fontWeight: 800,
  marginBottom: 16,
};

const statTile = {
  padding: '12px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const statLabel = {
  fontSize: 11,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
};

const statValue = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
};

const secondaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

const modalLabel = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#334155',
  marginBottom: 8,
};

const modalInput = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid #cbd5e1',
  fontSize: 14,
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
};

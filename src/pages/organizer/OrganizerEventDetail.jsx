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

const TOURNAMENT_EVENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

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

function AddContestantModal({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('individual');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>Add Contestant</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: 4, borderRadius: 12, background: '#f1f5f9' }}>
          {['individual', 'team'].map((t) => (
            <button key={t} onClick={() => setType(t)} style={{ padding: '8px', borderRadius: 9, border: 'none', background: type === t ? '#fff' : 'transparent', color: type === t ? '#2563eb' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: type === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              <i className={type === t && t === 'individual' ? 'bi bi-person' : type === t ? 'bi bi-people' : t === 'individual' ? 'bi bi-person' : 'bi bi-people'} style={{ marginRight: 4 }} />
              {t === 'individual' ? 'Individual' : 'Team'}
            </button>
          ))}
        </div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          {type === 'individual' ? 'Full Name' : 'Team Name'}
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onAdd(name.trim(), type); }}
          placeholder={type === 'individual' ? 'Juan dela Cruz' : 'Team Alpha'}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #cbd5e1', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', marginBottom: 20 }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => name.trim() && onAdd(name.trim(), type)} disabled={!name.trim()} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: name.trim() ? 'linear-gradient(135deg,#2563eb,#0ea5e9)' : '#e2e8f0', color: name.trim() ? '#fff' : '#94a3b8', fontWeight: 800, fontSize: 14, cursor: name.trim() ? 'pointer' : 'not-allowed' }}>Add</button>
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
  const { fetchInvites, inviteJudge, getInvitesForEvent } = useJudgeStore();
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

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
    fetchAudienceScores(id);
    fetchInvites(id);
  }, [fetchAudienceScores, fetchEvents, fetchInvites, id, user?.id]);

  useEffect(() => {
    return subscribeToAudienceScores(id);
  }, [id, subscribeToAudienceScores]);

  const event = getEventById(id);

  async function handleAddContestant(name, type) {
    const existing = event.contestants || [];
    const newContestant = {
      id: `${type}-manual-${Date.now()}`,
      name,
      type,
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
      notifyError('No new contestants found in that file — check for duplicates or an empty file.');
      return;
    }

    await updateEvent(id, { contestants: [...existing, ...imported], participants: existing.length + imported.length });
    notifySuccess(`Imported ${imported.length} contestant${imported.length === 1 ? '' : 's'} from CSV.`);
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
    const url = `${window.location.origin}/scorer/session/${token}`;
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

  const judgeQRValue = `${window.location.origin}/judge/open/${event.id}`;
  const participantQRValue = `${window.location.origin}/participant/register?eventId=${event.id}`;
  const audienceQRValue = `${window.location.origin}/audience/${event.id}`;
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

  const judgeInvites = getInvitesForEvent(event.id);

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
              { label: 'Start Date', value: event.startDate || '—' },
              { label: 'End Date', value: event.endDate || '—' },
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
                ? 'Judges can currently score contestants.'
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
              <h2 style={{ ...panelTitle, marginBottom: 0 }}>Contestants ({(event.contestants || []).length})</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setShowAddContestant(true)} style={secondaryBtn}>
                <i className="bi bi-plus-lg" /> Add Contestant
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
            CSV format: one contestant per line — <span className="mono">Full Name</span> or <span className="mono">Full Name,team</span> to mark a team entry.
          </p>
          {(!event.contestants || event.contestants.length === 0) ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No contestants yet. They register via the Participant QR, or add them manually above.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {event.contestants.map((c) => (
                <div key={c.id} style={{ padding: '8px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={c.type === 'team' ? 'bi bi-people' : 'bi bi-person'} style={{ color: '#2563eb', fontSize: 12 }} />
                  {c.name}
                </div>
              ))}
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
              <button
                type="button"
                onClick={() => setShowInvitePanel((v) => !v)}
                style={{
                  alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc',
                  color: '#0f172a', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                <span><i className="bi bi-envelope-paper" style={{ marginRight: 8, color: '#2563eb' }} />Invite a judge by email {judgeInvites.length > 0 ? `(${judgeInvites.length})` : ''}</span>
                <i className={`bi ${showInvitePanel ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
              </button>

              {showInvitePanel && (
                <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <form onSubmit={handleInviteJudge} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Judge full name"
                      style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}
                      disabled={inviteSending}
                    />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="judge@email.com"
                      style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}
                      disabled={inviteSending}
                    />
                    {inviteError && (
                      <div style={{ fontSize: 12, color: '#dc2626' }}>{inviteError}</div>
                    )}
                    <button
                      type="submit"
                      disabled={inviteSending || !inviteName.trim() || !inviteEmail.trim()}
                      style={{
                        padding: '11px 16px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', fontWeight: 800, fontSize: 13,
                        cursor: inviteSending ? 'not-allowed' : 'pointer', opacity: inviteSending ? 0.7 : 1,
                      }}
                    >
                      {inviteSending ? 'Sending...' : 'Send Invite'}
                    </button>
                  </form>

                  {judgeInvites.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {judgeInvites.map((invite) => (
                        <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{invite.judgeName}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{invite.judgeEmail}</div>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                            background: invite.status === 'claimed' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                            color: invite.status === 'claimed' ? '#10b981' : '#64748b',
                          }}>
                            {invite.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                  const url = `${window.location.origin}/scorer/session/${assignment.token}`;
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

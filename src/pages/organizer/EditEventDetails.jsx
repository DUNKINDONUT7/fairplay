import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';

// Once an event leaves these statuses (i.e. it has been approved and is on
// its way to happening or already has), its core setup can no longer be
// changed here — see guard_event_content_lock in schema.sql for the same
// rule enforced at the database level, so this isn't only a UI restriction.
const EDITABLE_STATUSES = new Set(['draft', 'upcoming', 'pending', 'rejected']);

function createTimeOptions() {
  const options = [];
  for (let hour = 7; hour <= 17; hour += 1) {
    const value = `${String(hour).padStart(2, '0')}:00`;
    const displayHour = hour > 12 ? hour - 12 : hour;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    options.push({ value, label: `${displayHour}:00 ${suffix}` });
  }
  return options;
}

const TIME_OPTIONS = createTimeOptions();

function combineDateAndTime(date, time) {
  if (!date) return '';
  return `${date}T${time || '07:00'}`;
}

function splitDateTime(value, fallbackTime) {
  const text = String(value || '');
  const [datePart, timePart] = text.split('T');
  return {
    date: datePart || '',
    time: timePart ? timePart.slice(0, 5) : (fallbackTime || '07:00'),
  };
}

function todayDateValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function EditEventDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents, getEventById, updateEvent } = useEventStore();
  const { success, error } = useNotificationStore();

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [criteria, setCriteria] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    Promise.resolve(fetchEvents(user.id)).finally(() => setLoaded(true));
  }, [fetchEvents, user?.id]);

  const event = getEventById(id);
  const todayDate = useMemo(() => todayDateValue(), []);

  useEffect(() => {
    if (!event || form) return;
    const start = splitDateTime(event.startDate, event.startTime);
    const end = splitDateTime(event.endDate, event.endTime);
    setForm({
      title: event.title || '',
      description: event.description || '',
      imageUrl: event.imageUrl || event.image || '',
      location: event.location || '',
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      registrationDeadline: event.registrationDeadline || '',
      maxParticipants: event.maxParticipants || '',
      enableQR: event.enableQR ?? true,
      enableCertificates: event.enableCertificates ?? true,
      attendanceTracking: event.attendanceTracking ?? true,
      audienceImpact: Boolean(event.audienceImpact),
      audienceImpactWeight: event.audienceImpactWeight || 10,
      audienceVotingOpen: Boolean(event.audienceVotingOpen),
    });
    setCriteria(
      (Array.isArray(event.criteria) ? event.criteria : []).map((criterion, index) => ({
        id: criterion.id || `criterion-${index}-${Date.now()}`,
        name: criterion.name || `Criterion ${index + 1}`,
        weight: Number(criterion.weight || 0),
        description: criterion.description || '',
      }))
    );
  }, [event, form]);

  const isAdmin = user?.role === 'admin';
  const isLocked = Boolean(event) && !EDITABLE_STATUSES.has(event.status) && !isAdmin;

  const totalWeight = useMemo(
    () => criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0),
    [criteria]
  );

  const updateField = useCallback((name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  const updateCriterion = useCallback((index, field, value) => {
    setCriteria((current) => current.map((criterion, criterionIndex) => (
      criterionIndex === index
        ? { ...criterion, [field]: field === 'weight' ? Number(value) : value }
        : criterion
    )));
  }, []);

  const addCriterion = useCallback(() => {
    setCriteria((current) => [
      ...current,
      { id: `criterion-${Date.now()}`, name: 'New Criterion', weight: 10, description: '' },
    ]);
  }, []);

  const removeCriterion = useCallback((index) => {
    setCriteria((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
  }, []);

  const balanceWeights = useCallback(() => {
    setCriteria((current) => {
      const count = current.length || 1;
      const base = Math.floor(100 / count);
      const remainder = 100 % count;
      return current.map((criterion, index) => ({ ...criterion, weight: base + (index < remainder ? 1 : 0) }));
    });
  }, []);

  function validate() {
    if (!form.title.trim()) return 'Event title is required.';
    if (!form.startDate || !form.endDate) return 'Start date and end date are required.';
    if (form.endDate < form.startDate) return 'End date must be on or after the start date.';
    if (form.startDate === form.endDate && form.endTime < form.startTime) return 'End time must be on or after start time.';
    if (!form.registrationDeadline) return 'Registration deadline is required.';
    if (form.registrationDeadline > form.startDate) return 'Registration deadline must be on or before the start date.';
    if (criteria.length === 0) return 'At least one judging criterion is required.';
    if (criteria.some((criterion) => !criterion.name.trim())) return 'Every criterion needs a name.';
    if (totalWeight !== 100) return `Total criteria weight must be 100. Current total is ${totalWeight}.`;
    return '';
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      error(validationError);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateEvent(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        image: form.imageUrl,
        imageUrl: form.imageUrl,
        coverImage: form.imageUrl,
        location: form.location,
        startDate: combineDateAndTime(form.startDate, form.startTime),
        endDate: combineDateAndTime(form.endDate, form.endTime),
        startTime: form.startTime,
        endTime: form.endTime,
        registrationDeadline: form.registrationDeadline,
        maxParticipants: Number(form.maxParticipants) || 0,
        criteria,
        enableQR: form.enableQR,
        enableCertificates: form.enableCertificates,
        attendanceTracking: form.attendanceTracking,
        audienceImpact: form.audienceImpact,
        audienceImpactEnabled: form.audienceImpact,
        audienceImpactWeight: form.audienceImpact ? Number(form.audienceImpactWeight || 10) : 0,
        audienceVotingOpen: form.audienceImpact && Boolean(form.audienceVotingOpen),
      });
      if (!updated) throw new Error('The event could not be saved.');
      success(`Saved changes to "${form.title.trim()}".`);
      navigate(`/organizer/events/${id}`);
    } catch (err) {
      error(err.message || 'Unable to save changes to this event.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <DashboardLayout title="Edit Event Details" subtitle="Loading...">
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading event...</div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout title="Edit Event Details" subtitle="Event not found">
        <div style={cardStyle}>
          <p style={{ margin: 0, color: '#64748b' }}>This event doesn't exist, or it doesn't belong to your account.</p>
          <button type="button" onClick={() => navigate('/organizer/events')} style={{ ...secondaryButtonStyle, marginTop: 16 }}>
            Back to Events
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Edit Event Details" subtitle={event.title}>
      {isLocked ? (
        <div style={{ ...cardStyle, borderColor: '#fde68a', background: '#fffbeb' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <i className="bi bi-lock-fill" style={{ fontSize: 22, color: '#b45309' }} />
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>This event has been approved</h2>
              <p style={{ margin: 0, color: '#78350f', fontSize: 14, lineHeight: 1.6 }}>
                Its title, schedule, venue and judging criteria can no longer be changed to keep it consistent with
                what was approved. Contact an administrator if something still needs to be corrected.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => navigate(`/organizer/events/${id}`)} style={{ ...secondaryButtonStyle, marginTop: 20 }}>
            <i className="bi bi-arrow-left" /> Back to Manage Event
          </button>
        </div>
      ) : form && (
        <div style={{ display: 'grid', gap: 20, maxWidth: 860 }}>
          {isAdmin && !EDITABLE_STATUSES.has(event.status) && (
            <div style={{ ...cardStyle, borderColor: '#bfdbfe', background: '#eff6ff', padding: '14px 18px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#1e40af' }}>
                <i className="bi bi-shield-check" /> This event is already approved — you're editing it as an admin. Organizers can no longer make these changes.
              </p>
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={sectionTitleStyle}>Basics</h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <Field label="Event title">
                <input value={form.title} onChange={(e) => updateField('title', e.target.value)} style={fieldStyle} />
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
              </Field>
              <Field label="Poster / cover image URL">
                <input value={form.imageUrl} onChange={(e) => updateField('imageUrl', e.target.value)} placeholder="Paste an image link" style={fieldStyle} />
              </Field>
              <Field label="Venue / location">
                <input value={form.location} onChange={(e) => updateField('location', e.target.value)} style={fieldStyle} />
              </Field>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={sectionTitleStyle}>Schedule and venue</h3>
            <div style={scheduleGridStyle}>
              <div style={scheduleSlotStyle}>
                <div style={scheduleSlotTitleStyle}><i className="bi bi-play-circle" style={{ color: '#2563eb' }} /> Event starts</div>
                <div style={scheduleSlotInputsStyle}>
                  <Field label="Date"><input type="date" value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} style={fieldStyle} /></Field>
                  <Field label="Time">
                    <select value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} style={fieldStyle}>
                      {TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
              <div style={scheduleSlotStyle}>
                <div style={scheduleSlotTitleStyle}><i className="bi bi-stop-circle" style={{ color: '#2563eb' }} /> Event ends</div>
                <div style={scheduleSlotInputsStyle}>
                  <Field label="Date"><input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} style={fieldStyle} /></Field>
                  <Field label="Time">
                    <select value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} style={fieldStyle}>
                      {TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label="Registration deadline">
                <input type="date" min={todayDate} max={form.startDate || undefined} value={form.registrationDeadline} onChange={(e) => updateField('registrationDeadline', e.target.value)} style={fieldStyle} />
              </Field>
              <Field label="Max participants">
                <input type="number" min="0" value={form.maxParticipants} onChange={(e) => updateField('maxParticipants', e.target.value)} style={fieldStyle} />
              </Field>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Judging criteria</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: totalWeight === 100 ? '#15803d' : '#b45309' }}>Total: {totalWeight}%</span>
                <button type="button" onClick={balanceWeights} style={smallButtonStyle}>Balance to 100</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {criteria.map((criterion, index) => (
                <div key={criterion.id} style={criterionRowStyle}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input value={criterion.name} onChange={(e) => updateCriterion(index, 'name', e.target.value)} placeholder="Criterion name" style={{ ...fieldStyle, flex: '1 1 200px' }} />
                    <input type="number" min="0" max="100" value={criterion.weight} onChange={(e) => updateCriterion(index, 'weight', e.target.value)} style={{ ...fieldStyle, width: 100, flex: '0 0 100px' }} />
                    <button type="button" onClick={() => removeCriterion(index)} disabled={criteria.length <= 1} style={{ ...iconDangerButtonStyle, opacity: criteria.length <= 1 ? 0.4 : 1, flex: '0 0 42px' }}>
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                  <textarea value={criterion.description} onChange={(e) => updateCriterion(index, 'description', e.target.value)} placeholder="What should judges look for?" rows={2} style={{ ...fieldStyle, marginTop: 10, resize: 'vertical' }} />
                </div>
              ))}
            </div>
            <button type="button" onClick={addCriterion} style={{ ...secondaryButtonStyle, marginTop: 14 }}>
              <i className="bi bi-plus-lg" /> Add criterion
            </button>
          </div>

          <div style={cardStyle}>
            <h3 style={sectionTitleStyle}>Controls</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <ToggleRow label="Judge QR access" checked={form.enableQR} onChange={(v) => updateField('enableQR', v)} />
              <ToggleRow label="Certificate automation" checked={form.enableCertificates} onChange={(v) => updateField('enableCertificates', v)} />
              <ToggleRow label="Attendance tracking" checked={form.attendanceTracking} onChange={(v) => updateField('attendanceTracking', v)} />
              <ToggleRow label="Audience impact scoring" checked={form.audienceImpact} onChange={(v) => updateField('audienceImpact', v)} />
              {form.audienceImpact && (
                <div style={{ paddingLeft: 28, display: 'grid', gap: 12 }}>
                  <Field label="Audience impact weight (%)">
                    <input type="number" min="0" max="100" value={form.audienceImpactWeight} onChange={(e) => updateField('audienceImpactWeight', e.target.value)} style={{ ...fieldStyle, maxWidth: 160 }} />
                  </Field>
                  <ToggleRow label="Audience voting currently open" checked={form.audienceVotingOpen} onChange={(v) => updateField('audienceVotingOpen', v)} />
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => navigate(`/organizer/events/${id}`)} style={secondaryButtonStyle}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
      {label}
    </label>
  );
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
};

const sectionTitleStyle = { margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#0f172a' };

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 14,
  outline: 'none',
};

const scheduleGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
};

const scheduleSlotStyle = {
  display: 'grid',
  gap: 12,
  padding: 16,
  borderRadius: 16,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
};

const scheduleSlotTitleStyle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a' };

const scheduleSlotInputsStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 };

const criterionRowStyle = { padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', background: '#f8fafc' };

const primaryButtonStyle = {
  padding: '11px 22px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  border: 'none',
  fontWeight: 700,
  fontSize: 14,
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: 12,
  background: '#ffffff',
  color: '#334155',
  border: '1px solid #cbd5e1',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

const smallButtonStyle = {
  padding: '6px 12px',
  borderRadius: 10,
  background: '#eff6ff',
  color: '#2563eb',
  border: '1px solid #bfdbfe',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const iconDangerButtonStyle = {
  width: 42,
  borderRadius: 12,
  background: '#fef2f2',
  color: '#dc2626',
  border: '1px solid #fecaca',
  cursor: 'pointer',
};

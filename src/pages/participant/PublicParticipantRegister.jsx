import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import { ensureEventTournamentAutomation } from '../../services/automationService';
import {
  getParticipantLimitMessage,
  inferTeamLimitConfig,
  validateTeamMemberCount,
} from '../../utils/teamEventRules';

const STORAGE_KEY = 'fairplay_participant_identity';
const SCHOOL_YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const emptyPerson = { fullName: '', age: '', schoolYear: '', phone: '', email: '' };
const emptyMember = { fullName: '', age: '', schoolYear: '', phone: '', email: '', roleOrPosition: '' };

function getStoredParticipant() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

function formatDate(raw) {
  if (!raw) return 'Date TBD';
  try {
    return new Date(raw).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return raw; }
}

function isRegistrationClosed(event) {
  const status = String(event?.status || '').toLowerCase();
  if (['active', 'ongoing', 'live', 'completed', 'archived'].includes(status)) return true;
  const start = event?.startDate || event?.start_date;
  const end = event?.endDate || event?.end_date || start;
  const startTime = start ? new Date(start).getTime() : 0;
  const endTime = end ? new Date(end).getTime() : startTime;
  const now = Date.now();
  return Boolean(startTime && startTime <= now && (!endTime || endTime >= now));
}

function getSubEventName(subEvent) {
  return String(subEvent?.name || subEvent?.title || '').trim();
}

export default function PublicParticipantRegister() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('eventId');
  const { fetchEvents } = useEventStore();
  const { submitPublicRegistration } = useRegistrationStore();

  const [phase, setPhase] = useState('loading');
  const [event, setEvent] = useState(null);
  const forceTeamRegistration = location.pathname.includes('register-team');
  const forceIndividualRegistration = location.pathname.includes('register-individual');
  const [regType, setRegType] = useState(forceTeamRegistration ? 'team' : 'individual'); // individual | team
  const [selectedSubEventId, setSelectedSubEventId] = useState('');

  // Shared fields (individual name = captain name for team)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Team-only field
  const [teamName, setTeamName] = useState('');
  const [schoolOrganization, setSchoolOrganization] = useState('');
  const [division, setDivision] = useState('');
  const [representativeType, setRepresentativeType] = useState('Team Leader');
  const [teamLeader, setTeamLeader] = useState(emptyPerson);
  const [coach, setCoach] = useState(emptyPerson);
  const [teamMembers, setTeamMembers] = useState([]);
  const [memberDraft, setMemberDraft] = useState(emptyMember);
  const [editingMemberId, setEditingMemberId] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [registered, setRegistered] = useState(null);

  useEffect(() => {
    async function init() {
      if (!eventId) { setPhase('error'); return; }
      await fetchEvents();
      const ev = useEventStore.getState().events.find(
        (e) => String(e.id) === String(eventId)
      );
      if (!ev) { setPhase('error'); return; }
      setEvent(ev);
      if (isRegistrationClosed(ev)) {
        setPhase('closed');
        return;
      }
      const firstSubEvent = (ev.subEvents || []).find((subEvent) => getSubEventName(subEvent));
      if (firstSubEvent) {
        setSelectedSubEventId(String(firstSubEvent.id));
        setRegType(String(firstSubEvent.format || '').toLowerCase() === 'team' ? 'team' : 'individual');
      }
      if (forceTeamRegistration) {
        setRegType('team');
      }
      if (forceIndividualRegistration) {
        setRegType('individual');
      }

      const stored = getStoredParticipant();
      if (stored?.eventId === eventId && stored?.name) {
        if (stored.subEventId) {
          setSelectedSubEventId(String(stored.subEventId));
        }
        setRegistered(stored);
        setPhase('already');
        return;
      }
      setPhase('form');
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, forceIndividualRegistration, forceTeamRegistration]);

  // ── Submit ──
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      const currentEvent = useEventStore.getState().getEventById(eventId);
      if (isRegistrationClosed(currentEvent)) {
        setErrorMsg('Registration is closed because this event is already ongoing.');
        setSubmitting(false);
        return;
      }
      const existing = currentEvent?.contestants || [];
      const availableSubEvents = (currentEvent?.subEvents || []).filter((subEvent) => getSubEventName(subEvent));
      const requiresSubEvent = availableSubEvents.length > 0;
      const selectedSubEvent = requiresSubEvent
        ? availableSubEvents.find((subEvent) => String(subEvent.id) === String(selectedSubEventId))
        : null;

      if (requiresSubEvent && !selectedSubEvent) {
        setErrorMsg('Choose the sub-event you want to join.');
        setSubmitting(false);
        return;
      }

      const dupEmail = existing.some((c) => c.email?.toLowerCase() === email.toLowerCase().trim());
      if (dupEmail) { setErrorMsg('This email is already registered for this event.'); setSubmitting(false); return; }

      if (effectiveRegType === 'team' && !teamName.trim()) {
        setErrorMsg('Team name is required.');
        setSubmitting(false);
        return;
      }
      const limitConfig = inferTeamLimitConfig(currentEvent, selectedSubEvent);

      if (effectiveRegType === 'team') {
        const hasLeader = Boolean(teamLeader.fullName.trim());
        const hasCoach = Boolean(coach.fullName.trim());
        if (!hasLeader && !hasCoach) {
          setErrorMsg('Please provide at least one team representative: Team Leader or Coach.');
          setSubmitting(false);
          return;
        }
        if (hasLeader && (!teamLeader.age || !teamLeader.schoolYear)) {
          setErrorMsg('Team Leader age and school year are required.');
          setSubmitting(false);
          return;
        }
        const leaderContactError = hasLeader ? validateContactDraft(teamLeader, 'Team Leader') : '';
        const coachContactError = hasCoach ? validateContactDraft(coach, 'Coach') : '';
        if (leaderContactError || coachContactError) {
          setErrorMsg(leaderContactError || coachContactError);
          setSubmitting(false);
          return;
        }
        if (limitConfig.coachRequired && !coach.fullName.trim()) {
          setErrorMsg('Coach information is required for this event.');
          setSubmitting(false);
          return;
        }
        const countError = validateTeamMemberCount(teamMembers.length, limitConfig);
        if (countError) {
          setErrorMsg(countError);
          setSubmitting(false);
          return;
        }
        const incompleteMember = teamMembers.find((member) => !member.fullName.trim() || !member.age || !member.schoolYear);
        if (incompleteMember) {
          setErrorMsg('Every team member must have a full name, age, and school year.');
          setSubmitting(false);
          return;
        }
      }

      const registration = await submitPublicRegistration({
        eventId,
        registrationType: effectiveRegType,
        teamName: teamName.trim(),
        roster: effectiveRegType === 'team'
          ? teamMembers.map((member) => ({
              ...member,
              name: member.fullName,
              school_year: member.schoolYear,
              role_or_position: member.roleOrPosition,
              is_team_leader: teamLeader.fullName.trim().toLowerCase() === member.fullName.trim().toLowerCase(),
            }))
          : [],
        individualDetails: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone.trim(),
        },
        schoolOrganization: schoolOrganization.trim(),
        division: division.trim(),
        representativeType,
        teamLeader: teamLeader.fullName.trim() ? teamLeader : null,
        coach: coach.fullName.trim() ? coach : null,
        subEventId: selectedSubEvent?.id || '',
        subEventName: getSubEventName(selectedSubEvent),
        category: getSubEventName(selectedSubEvent) || currentEvent?.eventType || '',
        sportType: limitConfig.sportType,
        esportGame: limitConfig.esportGame,
        customSportName: limitConfig.customSportName,
        minParticipants: limitConfig.min,
        maxParticipants: limitConfig.max,
      });

      const refreshedEvent = useEventStore.getState().getEventById(eventId);
      const contestants = refreshedEvent?.contestants || existing;
      await ensureEventTournamentAutomation(refreshedEvent || currentEvent, contestants);

      const identity = {
        eventId,
        name: registration.participantName || registration.teamName || registration.individualDetails?.name,
        participantId: registration.participantId || registration.id,
        type: effectiveRegType,
        subEventId: registration.subEventId,
        subEventName: registration.subEventName,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
      setRegistered(identity);
      setPhase('success');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectableSubEvents = (event?.subEvents || []).filter((subEvent) => getSubEventName(subEvent));
  const selectedSubEvent = selectableSubEvents.find((subEvent) => String(subEvent.id) === String(selectedSubEventId));
  const selectedSubEventFormat = String(selectedSubEvent?.format || '').toLowerCase();
  const eventType = event?.eventType || event?.type || '';
  const isTournamentLike = ['tournament', 'sportsfest', 'esports', 'sports'].includes(eventType);
  const effectiveRegType = selectableSubEvents.length > 0
    ? (selectedSubEventFormat === 'team' ? 'team' : 'individual')
    : isTournamentLike
      ? 'team'
      : forceTeamRegistration
        ? 'team'
        : forceIndividualRegistration
          ? 'individual'
          : regType;
  const showTypeToggle = selectableSubEvents.length === 0 && !isTournamentLike && !forceTeamRegistration && !forceIndividualRegistration;
  const showMissingSubEventsNotice = selectableSubEvents.length === 0 && isTournamentLike;
  const venueText = selectedSubEvent?.venue || event?.location || 'Venue TBD';
  const teamLimitConfig = inferTeamLimitConfig(event || {}, selectedSubEvent || null);
  const memberCountError = validateTeamMemberCount(teamMembers.length, teamLimitConfig);
  const membersRemaining = Math.max(0, teamLimitConfig.min - teamMembers.length);
  const maxReached = teamMembers.length >= teamLimitConfig.max;
  const positionOptions = teamLimitConfig.positions || [];

  function updatePerson(setter, field, value) {
    setter((current) => ({ ...current, [field]: value }));
  }

  function validateContactDraft(person, label) {
    if (person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) return `${label} email must be valid.`;
    if (person.phone && !/^[+0-9()\-\s]{7,20}$/.test(person.phone)) return `${label} phone number must be valid.`;
    return '';
  }

  function handleSaveMember() {
    const draft = {
      ...memberDraft,
      fullName: memberDraft.fullName.trim(),
      email: memberDraft.email.trim(),
      phone: memberDraft.phone.trim(),
      roleOrPosition: memberDraft.roleOrPosition.trim(),
    };
    if (!draft.fullName || !draft.age || !draft.schoolYear) {
      setErrorMsg('Team member full name, age, and school year are required.');
      return;
    }
    const contactError = validateContactDraft(draft, 'Team member');
    if (contactError) {
      setErrorMsg(contactError);
      return;
    }
    if (!editingMemberId && maxReached) {
      setErrorMsg('Maximum number of players reached.');
      return;
    }
    setTeamMembers((current) => {
      if (editingMemberId) {
        return current.map((member) => (member.id === editingMemberId ? { ...draft, id: editingMemberId } : member));
      }
      return [...current, { ...draft, id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }];
    });
    setMemberDraft(emptyMember);
    setEditingMemberId(null);
    setErrorMsg('');
  }

  function handleEditMember(member) {
    setMemberDraft({
      fullName: member.fullName || member.name || '',
      age: member.age || '',
      schoolYear: member.schoolYear || member.school_year || member.schoolId || member.school_id || '',
      phone: member.phone || member.phone_number || '',
      email: member.email || '',
      roleOrPosition: member.roleOrPosition || member.role_or_position || '',
    });
    setEditingMemberId(member.id);
  }

  /* ─── Loading ─── */
  if (phase === 'loading') {
    return (
      <div style={fullPage}>
        <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 40, color: '#2563eb' }} />
        <p style={{ color: '#64748b', marginTop: 16 }}>Loading event...</p>
      </div>
    );
  }

  /* ─── Error ─── */
  if (phase === 'error') {
    return (
      <div style={fullPage}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
        <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 8 }}>Event not found</div>
        <p style={{ color: '#64748b' }}>This registration link is invalid or has expired.</p>
      </div>
    );
  }

  if (phase === 'closed') {
    return (
      <div style={fullPage}>
        <div style={card}>
          <div style={{ textAlign: 'center' }}>
            <i className="bi bi-lock-fill" style={{ fontSize: 48, color: '#f59e0b', marginBottom: 16 }} />
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>Registration Closed</h1>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.7, marginBottom: 18 }}>
              {event?.title || 'This event'} is already ongoing, so new registrations are no longer accepted.
            </p>
            <a href={`/events/${eventId}`} style={{ ...secondaryActionButton, textDecoration: 'none' }}>
              <i className="bi bi-eye" />
              View Event Preview
            </a>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Already registered ─── */
  if (phase === 'already') {
    return (
      <div style={fullPage}>
        <div style={card}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <i className="bi bi-patch-check-fill" style={{ fontSize: 52, color: '#2563eb', display: 'block', marginBottom: 12 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Already Registered</h1>
            <p style={{ color: '#64748b', fontSize: 14 }}>{event?.title}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe', gap: 10 }}>
            <i className="bi bi-person-check" style={{ color: '#2563eb', fontSize: 18 }} />
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{registered?.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{registered?.type}</span>
          </div>
          {registered?.subEventName && (
            <div style={subEventPill}>
              <i className="bi bi-diagram-3" style={{ marginRight: 6 }} />
              {registered.subEventName}
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 16, lineHeight: 1.6 }}>
            You're all set! The organizer will contact you with further details.
          </p>
          <div style={datePill}>
            <i className="bi bi-calendar-event" style={{ marginRight: 6 }} />
            {formatDate(event?.startDate)} - {registered?.subEventName ? venueText : (event?.location || 'Venue TBD')}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Success ─── */
  if (phase === 'success') {
    return (
      <div style={fullPage}>
        <div style={card}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <i className="bi bi-check-circle-fill" style={{ fontSize: 52, color: '#10b981', display: 'block', marginBottom: 12 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Registration Successful!</h1>
            <p style={{ color: '#64748b', fontSize: 14 }}>{event?.title}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #86efac', gap: 10 }}>
            <i className="bi bi-person-check" style={{ color: '#10b981', fontSize: 18 }} />
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{registered?.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#16a34a', textTransform: 'uppercase', fontWeight: 600 }}>{registered?.type}</span>
          </div>
          {registered?.subEventName && (
            <div style={{ ...subEventPill, background: '#ecfdf5', borderColor: '#bbf7d0', color: '#047857' }}>
              <i className="bi bi-diagram-3" style={{ marginRight: 6 }} />
              {registered.subEventName}
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 16, lineHeight: 1.6 }}>
            You've been registered as a contestant. The organizer will reach out with event details.
          </p>
          <div style={datePill}>
            <i className="bi bi-calendar-event" style={{ marginRight: 6 }} />
            {formatDate(event?.startDate)} - {registered?.subEventName ? venueText : (event?.location || 'Venue TBD')}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Registration form ─── */
  return (
    <div style={fullPage}>
      <div style={card}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <i className="bi bi-person-plus" style={{ fontSize: 36, color: '#2563eb', display: 'block', marginBottom: 10 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Join the Competition</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>{event?.title}</p>
        </div>

        {showTypeToggle && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24, padding: 4, borderRadius: 14, background: '#f1f5f9' }}>
            {['individual', 'team'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setRegType(t); setErrorMsg(''); }}
                style={{
                  padding: '10px',
                  borderRadius: 11,
                  border: 'none',
                  background: regType === t ? '#ffffff' : 'transparent',
                  color: regType === t ? '#2563eb' : '#64748b',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: regType === t ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <i className={t === 'individual' ? 'bi bi-person' : 'bi bi-people'} />
                {t === 'individual' ? 'Individual' : 'Team'}
              </button>
            ))}
          </div>
        )}
        {showMissingSubEventsNotice && (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 14, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13, lineHeight: 1.5 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />
            No sub-events are configured for this event yet. Team registration is enabled for now.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {selectableSubEvents.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Sub-event to join <Req /></label>
              <select
                value={selectedSubEventId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const nextSubEvent = selectableSubEvents.find((subEvent) => String(subEvent.id) === String(nextId));
                  setSelectedSubEventId(nextId);
                  setRegType(String(nextSubEvent?.format || '').toLowerCase() === 'team' ? 'team' : 'individual');
                  setErrorMsg('');
                }}
                style={inputStyle}
                disabled={submitting}
                required
              >
                {selectableSubEvents.map((subEvent) => (
                  <option key={subEvent.id} value={subEvent.id}>
                    {getSubEventName(subEvent)}{subEvent.venue ? ` - ${subEvent.venue}` : ''}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={formatBadgeStyle}>
                  <i className={effectiveRegType === 'team' ? 'bi bi-people' : 'bi bi-person'} style={{ marginRight: 6 }} />
                  {effectiveRegType === 'team' ? 'Team registration' : 'Individual registration'}
                </span>
                {selectedSubEvent?.venue && (
                  <span style={venueBadgeStyle}>
                    <i className="bi bi-geo-alt" style={{ marginRight: 6 }} />
                    {selectedSubEvent.venue}
                  </span>
                )}
              </div>
            </div>
          )}

          {effectiveRegType === 'individual' ? (
            <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Full Name <Req /></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Juan dela Cruz" style={inputStyle} disabled={submitting} required />
              </div>
              <div>
                <label style={labelStyle}>Email Address <Req /></label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@email.com" style={inputStyle} disabled={submitting} required />
              </div>
              <div>
                <label style={labelStyle}>Phone Number <Opt /></label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="09XX XXX XXXX" style={inputStyle} disabled={submitting} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Team Name <Req /></label>
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Team Alpha" style={inputStyle} disabled={submitting} required />
              </div>
              <div>
                <label style={labelStyle}>School / Organization <Req /></label>
                <input value={schoolOrganization} onChange={(e) => setSchoolOrganization(e.target.value)} placeholder="School or organization name" style={inputStyle} disabled={submitting} required />
              </div>
              <div>
                <label style={labelStyle}>Division / Category <Opt /></label>
                <input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="e.g. Junior, Senior, Men's, Women's" style={inputStyle} disabled={submitting} />
              </div>

              <div style={teamInfoBox}>
                <strong>{teamLimitConfig.label}</strong>
                <span>Members added: {teamMembers.length} / {teamLimitConfig.max}</span>
                <span>Minimum required: {teamLimitConfig.min}</span>
                {membersRemaining > 0 && <span style={{ color: '#b45309' }}>You need to add at least {membersRemaining} more player{membersRemaining === 1 ? '' : 's'}.</span>}
                {maxReached && <span style={{ color: '#047857' }}>Maximum number of players reached.</span>}
                {memberCountError && teamMembers.length > 0 && <span style={{ color: '#dc2626' }}>{memberCountError}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 4, borderRadius: 14, background: '#f1f5f9' }}>
                {['Team Leader', 'Coach'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setRepresentativeType(type)}
                    style={{
                      padding: '10px',
                      borderRadius: 11,
                      border: 'none',
                      background: representativeType === type ? '#ffffff' : 'transparent',
                      color: representativeType === type ? '#2563eb' : '#64748b',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {type} submits
                  </button>
                ))}
              </div>

              <div style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
                <span style={sectionTitleStyle}>Team Leader Information</span>
                <div>
                  <label style={labelStyle}>Full Name <Req /></label>
                  <input type="text" value={teamLeader.fullName} onChange={(e) => updatePerson(setTeamLeader, 'fullName', e.target.value)}
                    placeholder="Juan dela Cruz" style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
                <div style={responsiveTwoColumnGrid}>
                  <div>
                    <label style={labelStyle}>Age <Req /></label>
                    <input type="number" min="1" value={teamLeader.age} onChange={(e) => updatePerson(setTeamLeader, 'age', e.target.value)} style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                  </div>
                  <div>
                    <label style={labelStyle}>School Year <Req /></label>
                    <select value={teamLeader.schoolYear} onChange={(e) => updatePerson(setTeamLeader, 'schoolYear', e.target.value)} style={{ ...inputStyle, background: '#fff' }} disabled={submitting}>
                      <option value="">Select school year</option>
                      {SCHOOL_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Phone Number <Opt /></label>
                  <input type="tel" value={teamLeader.phone} onChange={(e) => updatePerson(setTeamLeader, 'phone', e.target.value)} placeholder="09XX XXX XXXX" style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
                <div>
                  <label style={labelStyle}>Email Address <Opt /></label>
                  <input type="email" value={teamLeader.email} onChange={(e) => updatePerson(setTeamLeader, 'email', e.target.value)} placeholder="leader@email.com" style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
                <span style={sectionTitleStyle}>Coach Information <Opt /></span>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input value={coach.fullName} onChange={(e) => updatePerson(setCoach, 'fullName', e.target.value)} placeholder="Coach full name" style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
                <div>
                  <label style={labelStyle}>Age <Opt /></label>
                  <input type="number" min="1" value={coach.age} onChange={(e) => updatePerson(setCoach, 'age', e.target.value)} style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number <Opt /></label>
                  <input type="tel" value={coach.phone} onChange={(e) => updatePerson(setCoach, 'phone', e.target.value)} style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
                <div>
                  <label style={labelStyle}>Email Address <Opt /></label>
                  <input type="email" value={coach.email} onChange={(e) => updatePerson(setCoach, 'email', e.target.value)} style={{ ...inputStyle, background: '#fff' }} disabled={submitting} />
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 14, background: '#ffffff', border: '1px solid #bfdbfe', display: 'grid', gap: 12 }}>
                <span style={sectionTitleStyle}>{editingMemberId ? 'Edit Team Member' : 'Add Team Member'}</span>
                <div>
                  <label style={labelStyle}>Full Name <Req /></label>
                  <input value={memberDraft.fullName} onChange={(e) => setMemberDraft((current) => ({ ...current, fullName: e.target.value }))} style={inputStyle} disabled={submitting} />
                </div>
                <div style={responsiveTwoColumnGrid}>
                  <div>
                    <label style={labelStyle}>Age <Req /></label>
                    <input type="number" min="1" value={memberDraft.age} onChange={(e) => setMemberDraft((current) => ({ ...current, age: e.target.value }))} style={inputStyle} disabled={submitting} />
                  </div>
                  <div>
                    <label style={labelStyle}>School Year <Req /></label>
                    <select value={memberDraft.schoolYear} onChange={(e) => setMemberDraft((current) => ({ ...current, schoolYear: e.target.value }))} style={inputStyle} disabled={submitting}>
                      <option value="">Select school year</option>
                      {SCHOOL_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                </div>
                <div style={responsiveTwoColumnGrid}>
                  <div>
                    <label style={labelStyle}>Phone <Opt /></label>
                    <input value={memberDraft.phone} onChange={(e) => setMemberDraft((current) => ({ ...current, phone: e.target.value }))} style={inputStyle} disabled={submitting} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email <Opt /></label>
                    <input type="email" value={memberDraft.email} onChange={(e) => setMemberDraft((current) => ({ ...current, email: e.target.value }))} style={inputStyle} disabled={submitting} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Position / Role <Opt /></label>
                  <input
                    list="team-position-options"
                    value={memberDraft.roleOrPosition}
                    onChange={(e) => setMemberDraft((current) => ({ ...current, roleOrPosition: e.target.value }))}
                    placeholder={positionOptions[0] || 'Player'}
                    style={inputStyle}
                    disabled={submitting}
                  />
                  <datalist id="team-position-options">
                    {positionOptions.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </div>
                <button type="button" onClick={handleSaveMember} disabled={submitting || (!editingMemberId && maxReached)} style={secondaryActionButton}>
                  <i className={editingMemberId ? 'bi bi-check2-circle' : 'bi bi-plus-circle'} />
                  {editingMemberId ? 'Save Member' : 'Add Member'}
                </button>
              </div>

              {teamMembers.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {teamMembers.map((member, index) => (
                    <div key={member.id} style={memberRowStyle}>
                      <div>
                        <strong>{index + 1}. {member.fullName}</strong>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          Age {member.age} - {member.schoolYear || 'School year not set'}{member.roleOrPosition ? ` - ${member.roleOrPosition}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => handleEditMember(member)} style={smallButtonStyle}>Edit</button>
                        <button type="button" onClick={() => setTeamMembers((current) => current.filter((entry) => entry.id !== member.id))} style={{ ...smallButtonStyle, color: '#dc2626' }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={reviewBoxStyle}>
                <strong>Review before submitting</strong>
                <span>Team: {teamName || 'Not set'}</span>
                <span>Representative: {representativeType}</span>
                <span>Team Leader: {teamLeader.fullName || 'Not provided'}</span>
                <span>Coach: {coach.fullName || 'Not provided'}</span>
                <span>Status after submission: Pending</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
              <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              (selectableSubEvents.length > 0 && !selectedSubEventId) ||
              (effectiveRegType === 'individual' && (!name.trim() || !email.trim())) ||
              (effectiveRegType === 'team' && (!teamName.trim() || !schoolOrganization.trim() || Boolean(memberCountError)))
            }
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: submitting ? '#e2e8f0' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
              color: submitting ? '#94a3b8' : '#fff',
              fontWeight: 800, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.2s',
              boxShadow: submitting ? 'none' : '0 8px 20px rgba(37,99,235,0.25)',
            }}
          >
            {submitting
              ? <><i className="bi bi-arrow-repeat animate-spin" /> Registering...</>
              : <><i className="bi bi-send-check" /> Register Now</>
            }
          </button>
        </form>

        <div style={datePill}>
          <i className="bi bi-calendar-event" style={{ marginRight: 6 }} />
          {formatDate(event?.startDate)} - {venueText}
        </div>
      </div>
    </div>
  );
}

function Req() {
  return <span style={{ color: '#ef4444' }}>*</span>;
}
function Opt() {
  return <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>;
}

const fullPage = {
  minHeight: '100svh',
  background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: 'clamp(20px, 4vw, 48px) clamp(12px, 3vw, 28px)',
  overflowX: 'hidden',
  overflowY: 'auto',
  boxSizing: 'border-box',
};

const card = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 'clamp(18px, 3vw, 32px)',
  width: 'min(100%, 760px)',
  maxWidth: 760,
  margin: '0 auto',
  boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
  boxSizing: 'border-box',
};

const responsiveTwoColumnGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: '#2563eb',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const teamInfoBox = {
  display: 'grid',
  gap: 4,
  padding: 14,
  borderRadius: 14,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#1d4ed8',
  fontSize: 13,
};

const secondaryActionButton = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const smallButtonStyle = {
  border: '1px solid #dbeafe',
  background: '#ffffff',
  color: '#2563eb',
  borderRadius: 10,
  padding: '7px 10px',
  fontWeight: 800,
  cursor: 'pointer',
};

const memberRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'center',
  padding: 12,
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
  flexWrap: 'wrap',
};

const reviewBoxStyle = {
  display: 'grid',
  gap: 6,
  padding: 14,
  borderRadius: 14,
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534',
  fontSize: 13,
};

const datePill = {
  marginTop: 20,
  padding: '10px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  fontSize: 12,
  color: '#64748b',
  textAlign: 'center',
};

const subEventPill = {
  marginTop: 12,
  padding: '10px 14px',
  borderRadius: 12,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#1d4ed8',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'center',
};

const formatBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '7px 10px',
  borderRadius: 999,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#1d4ed8',
  fontSize: 12,
  fontWeight: 700,
};

const venueBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '7px 10px',
  borderRadius: 999,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#475569',
  fontSize: 12,
  fontWeight: 700,
};

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#334155',
  marginBottom: 8,
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#f8fafc',
};

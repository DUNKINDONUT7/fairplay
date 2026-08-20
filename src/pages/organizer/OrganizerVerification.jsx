import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAttendanceStore from '../../store/attendanceStore';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import useNotificationStore from '../../store/notificationStore';

function buildParticipantRecord({ token, events, registrations }) {
  for (const event of events) {
    const judgeInvite = (event.externalJudgeInvites || []).find((invite) => invite.token === token);
    if (judgeInvite) {
      return {
        id: judgeInvite.id,
        token,
        name: judgeInvite.judgeName,
        role: 'judge',
        team: judgeInvite.specialty || 'External Judge',
        eventId: event.id,
        event: event.title,
        status: judgeInvite.status === 'accepted' ? 'Access granted' : 'Invite issued',
        paymentStatus: judgeInvite.subEventId ? 'Sub-event judge access' : 'General judge access',
      };
    }

    const contestant = (event.contestants || []).find(
      (entry) => String(entry.id) === String(token) || String(entry.qrToken) === String(token)
    );

    if (contestant) {
      return {
        id: contestant.id,
        token,
        name: contestant.name,
        role: contestant.type || 'participant',
        team: contestant.teamName || contestant.name,
        eventId: event.id,
        event: event.title,
        status: 'Verified',
        paymentStatus: 'Ready for check-in',
      };
    }
  }

  const registration = registrations.find(
    (entry) => String(entry.id) === String(token) || String(entry.individualDetails?.qrToken) === String(token)
  );

  if (!registration) {
    return null;
  }

  const event = events.find((entry) => String(entry.id) === String(registration.eventId));
  const participantName = registration.registrationType === 'team'
    ? registration.teamName
    : registration.individualDetails?.name;

  return {
    id: registration.id,
    token,
    name: participantName || 'Registration Record',
    role: registration.registrationType === 'team' ? 'team' : 'participant',
    team: registration.teamName || participantName || 'Participant',
    eventId: registration.eventId,
    event: event?.title || 'Registered Event',
    status: registration.status || 'submitted',
    paymentStatus: 'Ready for check-in',
  };
}

export default function OrganizerVerification() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { checkInAttendee, attendance, fetchAttendance } = useAttendanceStore();
  const { success, error } = useNotificationStore();
  const [isCheckedIn, setCheckedIn] = useState(false);

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
    fetchRegistrations();
    fetchAttendance();
  }, [fetchAttendance, fetchEvents, fetchRegistrations, user?.id]);

  const participant = useMemo(
    () => buildParticipantRecord({ token, events, registrations }),
    [events, registrations, token]
  );

  const existingCheckIn = useMemo(() => {
    if (!participant) return null;
    return attendance.find(
      (entry) =>
        String(entry.eventId) === String(participant.eventId) &&
        String(entry.attendeeId) === String(participant.id)
    ) || null;
  }, [attendance, participant]);

  useEffect(() => {
    setCheckedIn(Boolean(existingCheckIn));
  }, [existingCheckIn]);

  const handleCheckIn = async () => {
    if (!participant) {
      error('Participant record is not available.');
      return;
    }

    try {
      const result = await checkInAttendee({
        eventId: participant.eventId,
        attendeeId: participant.id,
        attendeeName: participant.name,
        attendeeType: participant.role,
        role: participant.role,
        qrToken: token,
        scannerId: user?.id || user?.email || 'organizer',
        source: 'qr-scan',
        metadata: {
          token,
          verifiedBy: user?.name || 'Organizer',
        },
      });

      if (result?.duplicate) {
        setCheckedIn(true);
        error(result.message || 'This attendee is already checked in.');
        return;
      }

      setCheckedIn(true);
      success(`${participant.name} checked in successfully.`);
    } catch (checkInError) {
      error('Unable to save this check-in.');
    }
  };

  if (!participant) {
    return (
      <DashboardLayout title="Verification" subtitle="Resolve attendance and QR-based access validation">
        <div style={{ padding: 24, borderRadius: 20, background: '#ffffff', border: '1px solid #fecaca', color: '#64748b', boxShadow: '0 20px 45px rgba(37,99,235,0.08)' }}>
          Token not found in event contestants, registrations, or judge invites.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Verification and Check-In" subtitle="Confirm participant access and record attendance in the backend">
      <div style={{ width: '100%', maxWidth: '680px' }}>
        <button
          onClick={() => navigate('/organizer/judges')}
          style={{ background: 'transparent', color: '#64748b', marginBottom: 20, cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <i className="bi bi-arrow-left" />
          Back to Judges
        </button>

        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, padding: 24, boxShadow: '0 20px 45px rgba(37,99,235,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 18, gap: 12 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{participant.event}</div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{participant.name}</h2>
              <p style={{ color: '#2563eb', marginBottom: 0 }}>{participant.team}</p>
            </div>
            <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(34,197,94,0.14)', color: '#22c55e', fontSize: 12, fontWeight: 700 }}>
              {participant.status}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 12, marginBottom: 20, borderTop: '1px solid #e5efff', paddingTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Role</span>
              <span style={{ color: '#0f172a', fontWeight: 600 }}>{participant.role}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Token</span>
              <span style={{ color: '#0f172a', fontWeight: 600 }}>{participant.token}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Access Status</span>
              <span style={{ color: '#0f172a', fontWeight: 600 }}>{participant.paymentStatus}</span>
            </div>
            {existingCheckIn && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Latest Check-In</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{new Date(existingCheckIn.checkedInAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {isCheckedIn ? (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 12, padding: 14, textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>
              Check-in completed and saved to attendance records.
            </div>
          ) : (
            <button
              onClick={handleCheckIn}
              style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 16px 32px rgba(37,99,235,0.18)' }}
            >
              <i className="bi bi-check2-circle" />
              Check In Attendee
            </button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

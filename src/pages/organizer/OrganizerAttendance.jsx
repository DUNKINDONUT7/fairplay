import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useAttendanceStore from '../../store/attendanceStore';

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function AttendanceTable({ title, icon, rows, emptyLabel }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className={`bi ${icon}`} style={{ color: '#2563eb' }} /> {title}
      </h3>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>{rows.length} checked in</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
              {['Name', 'Role', 'Checked In', 'Source', 'Scanned By'].map((header) => (
                <th key={header} style={{ padding: '10px 12px' }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>{emptyLabel}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{row.attendeeName}</td>
                <td style={{ padding: '10px 12px', color: '#475569', textTransform: 'capitalize' }}>{row.role || row.attendeeType}</td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>{formatTimestamp(row.checkedInAt)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 999, background: row.source === 'qr-scan' ? '#eff6ff' : '#f1f5f9', color: row.source === 'qr-scan' ? '#2563eb' : '#64748b', fontSize: 11, fontWeight: 700 }}>
                    {row.source === 'qr-scan' ? 'QR Scan' : row.source === 'manual' ? 'Manual' : row.source || 'Manual'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>{row.scannerId || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OrganizerAttendance() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { attendance, fetchAttendance, getAttendanceSummary } = useAttendanceStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') || '');

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
  }, [fetchEvents, user?.id]);

  useEffect(() => {
    fetchAttendance(selectedEventId || undefined);
  }, [fetchAttendance, selectedEventId]);

  const eligibleEvents = useMemo(() => events.filter((event) => event.status !== 'draft'), [events]);

  useEffect(() => {
    if (!selectedEventId && eligibleEvents.length > 0) {
      setSelectedEventId(String(eligibleEvents[0].id));
    }
  }, [eligibleEvents, selectedEventId]);

  function handleEventChange(eventId) {
    setSelectedEventId(eventId);
    setSearchParams(eventId ? { eventId } : {});
  }

  const eventRows = useMemo(
    () => attendance.filter((row) => String(row.eventId) === String(selectedEventId)),
    [attendance, selectedEventId]
  );

  // Two separate tables (not one mixed list) — an organizer scanning
  // contestants at the door and an audience-impact tally at their seats are
  // different headcounts with different meanings, and mixing them made the
  // single combined table hard to read at a glance.
  const participantRows = useMemo(
    () => eventRows.filter((row) => row.attendeeType !== 'audience'),
    [eventRows]
  );
  const audienceRows = useMemo(
    () => eventRows.filter((row) => row.attendeeType === 'audience'),
    [eventRows]
  );

  const summary = selectedEventId ? getAttendanceSummary(selectedEventId) : { total: 0, participants: 0, audience: 0, judges: 0 };

  return (
    <DashboardLayout title="Attendance" subtitle="Monitor who has checked in — participants and audience, tracked separately">
      <div style={{ marginBottom: 20 }}>
        <select value={selectedEventId} onChange={(event) => handleEventChange(event.target.value)} style={selectStyle}>
          <option value="">Select an event</option>
          {eligibleEvents.map((event) => (
            <option key={event.id} value={event.id}>{event.title}</option>
          ))}
        </select>
      </div>

      {!selectedEventId ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b' }}>Select an event to view its attendance.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div style={statCardStyle}>
              <p style={statLabelStyle}>Total Checked In</p>
              <p style={statValueStyle}>{summary.total}</p>
            </div>
            <div style={statCardStyle}>
              <p style={statLabelStyle}>Participants</p>
              <p style={statValueStyle}>{participantRows.length}</p>
            </div>
            <div style={statCardStyle}>
              <p style={statLabelStyle}>Audience</p>
              <p style={statValueStyle}>{audienceRows.length}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <AttendanceTable
              title="Participant Attendance"
              icon="bi-people-fill"
              rows={participantRows}
              emptyLabel="No participants checked in yet — scan their QR at the door to record attendance."
            />
            <AttendanceTable
              title="Audience Attendance"
              icon="bi-person-video3"
              rows={audienceRows}
              emptyLabel="No audience check-ins recorded yet."
            />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(37,99,235,0.06)' };
const selectStyle = { padding: '10px 16px', borderRadius: 12, background: '#ffffff', border: '1px solid #bfdbfe', color: '#0f172a', fontSize: 13, outline: 'none', width: 320, boxShadow: '0 10px 30px rgba(37,99,235,0.08)' };
const statCardStyle = { padding: 18, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' };
const statLabelStyle = { margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' };
const statValueStyle = { margin: '8px 0 0', color: '#0f172a', fontSize: 26, fontWeight: 800 };

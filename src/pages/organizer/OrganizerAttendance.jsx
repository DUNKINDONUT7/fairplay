import EventPicker from '../../components/common/EventPicker';
import useRememberedEvent from '../../hooks/useRememberedEvent';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PaginationControls from '../../components/admin/PaginationControls';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useAttendanceStore from '../../store/attendanceStore';

const PAGE_SIZES = [10, 25, 50];

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function getInitials(name) {
  const source = String(name || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// A handful of pleasant, low-saturation tones cycled by name so avatars
// don't all look identical but stay stable across re-renders (no randomness).
const AVATAR_TONES = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#fae8ff', fg: '#a21caf' },
  { bg: '#ffe4e6', fg: '#be123c' },
  { bg: '#e0f2fe', fg: '#0369a1' },
];

function avatarTone(name) {
  const code = String(name || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_TONES[code % AVATAR_TONES.length];
}

function AttendanceTable({ title, icon, allRows, rows, search, filtersActive, emptyLabel, page, pageSize, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className={`bi ${icon}`} style={{ color: '#2563eb' }} /> {title}
        </h3>
        <span style={countPillStyle}>{allRows.length} checked in</span>
      </div>
      {search && rows.length !== allRows.length && (
        <p style={{ margin: '4px 0 12px', color: '#64748b', fontSize: 12 }}>Showing {rows.length} matching "{search}"</p>
      )}
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
              {['Attendee', 'Role', 'Checked In', 'Source', 'Scanned By'].map((header) => (
                <th key={header} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '36px 12px', textAlign: 'center', color: '#94a3b8' }}>
                  <i className={filtersActive ? 'bi bi-search' : icon} style={{ fontSize: 26, display: 'block', marginBottom: 8, color: '#cbd5e1' }} />
                  {filtersActive ? 'No check-ins match your search.' : emptyLabel}
                </td>
              </tr>
            ) : pagedRows.map((row) => {
              const tone = avatarTone(row.attendeeName);
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ ...avatarStyle, background: tone.bg, color: tone.fg }}>{getInitials(row.attendeeName)}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.attendeeName}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569', textTransform: 'capitalize' }}>{row.role || row.attendeeType}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{formatTimestamp(row.checkedInAt)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 999, background: row.source === 'qr-scan' ? '#eff6ff' : '#f1f5f9', color: row.source === 'qr-scan' ? '#2563eb' : '#64748b', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <i className={row.source === 'qr-scan' ? 'bi bi-qr-code-scan' : 'bi bi-pencil-square'} style={{ marginRight: 5 }} />
                      {row.source === 'qr-scan' ? 'QR Scan' : row.source === 'manual' ? 'Manual' : row.source || 'Manual'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{row.scannerId || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <PaginationControls
          page={currentPage}
          totalPages={totalPages}
          limit={pageSize}
          totalItems={rows.length}
          onPageChange={onPageChange}
          onLimitChange={onPageSizeChange}
          pageSizes={PAGE_SIZES}
        />
      )}
    </div>
  );
}

export default function OrganizerAttendance() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { attendance, fetchAttendance, getAttendanceSummary } = useAttendanceStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEventId, setSelectedEventId] = useRememberedEvent(searchParams.get('eventId') || '');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [participantPage, setParticipantPage] = useState(1);
  const [participantPageSize, setParticipantPageSize] = useState(10);
  const [audiencePage, setAudiencePage] = useState(1);
  const [audiencePageSize, setAudiencePageSize] = useState(10);

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

  const filtersActive = Boolean(search.trim() || sourceFilter !== 'all');
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return eventRows.filter((row) => {
      if (sourceFilter !== 'all' && (row.source || 'manual') !== sourceFilter) return false;
      if (!term) return true;
      return String(row.attendeeName || '').toLowerCase().includes(term);
    });
  }, [eventRows, search, sourceFilter]);

  // Two separate tables (not one mixed list) — an organizer scanning
  // contestants at the door and an audience-impact tally at their seats are
  // different headcounts with different meanings, and mixing them made the
  // single combined table hard to read at a glance.
  const allParticipantRows = useMemo(() => eventRows.filter((row) => row.attendeeType !== 'audience'), [eventRows]);
  const allAudienceRows = useMemo(() => eventRows.filter((row) => row.attendeeType === 'audience'), [eventRows]);
  const participantRows = useMemo(() => filteredRows.filter((row) => row.attendeeType !== 'audience'), [filteredRows]);
  const audienceRows = useMemo(() => filteredRows.filter((row) => row.attendeeType === 'audience'), [filteredRows]);

  useEffect(() => { setParticipantPage(1); setAudiencePage(1); }, [search, sourceFilter, selectedEventId]);

  const summary = selectedEventId ? getAttendanceSummary(selectedEventId) : { total: 0, participants: 0, audience: 0, judges: 0 };

  return (
    <DashboardLayout title="Attendance" subtitle="Monitor who has checked in — participants and audience, tracked separately">
      <div style={{ marginBottom: 20 }}>
        <EventPicker events={eligibleEvents} value={selectedEventId} onChange={handleEventChange} />
      </div>

      {!selectedEventId ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-calendar-check" style={{ fontSize: 28, display: 'block', marginBottom: 10, color: '#cbd5e1' }} />
          Select an event to view its attendance.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={statIconStyle}><i className="bi bi-check2-circle" /></span>
                <div>
                  <p style={statLabelStyle}>Total Checked In</p>
                  <p style={statValueStyle}>{summary.total}</p>
                </div>
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={statIconStyle}><i className="bi bi-people-fill" /></span>
                <div>
                  <p style={statLabelStyle}>Participants</p>
                  <p style={statValueStyle}>{allParticipantRows.length}</p>
                </div>
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={statIconStyle}><i className="bi bi-person-video3" /></span>
                <div>
                  <p style={statLabelStyle}>Audience</p>
                  <p style={statValueStyle}>{allAudienceRows.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 240px' }}>
                <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                  aria-label="Search attendees"
                  style={{ ...fieldStyle, paddingLeft: 34 }}
                />
              </div>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Filter by check-in source" style={{ ...fieldStyle, flex: '0 1 180px' }}>
                <option value="all">All sources</option>
                <option value="qr-scan">QR Scan</option>
                <option value="manual">Manual</option>
              </select>
              {filtersActive && (
                <button type="button" onClick={() => { setSearch(''); setSourceFilter('all'); }} style={ghostButtonStyle}>
                  <i className="bi bi-x-lg" /> Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <AttendanceTable
              title="Participant Attendance"
              icon="bi-people-fill"
              allRows={allParticipantRows}
              rows={participantRows}
              search={search}
              filtersActive={filtersActive}
              emptyLabel="No participants checked in yet — scan their QR at the door to record attendance."
              page={participantPage}
              pageSize={participantPageSize}
              onPageChange={setParticipantPage}
              onPageSizeChange={(size) => { setParticipantPageSize(size); setParticipantPage(1); }}
            />
            <AttendanceTable
              title="Audience Attendance"
              icon="bi-person-video3"
              allRows={allAudienceRows}
              rows={audienceRows}
              search={search}
              filtersActive={filtersActive}
              emptyLabel="No audience check-ins recorded yet."
              page={audiencePage}
              pageSize={audiencePageSize}
              onPageChange={setAudiencePage}
              onPageSizeChange={(size) => { setAudiencePageSize(size); setAudiencePage(1); }}
            />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(37,99,235,0.06)' };

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
};

const selectStyle = { padding: '10px 16px', borderRadius: 12, background: '#ffffff', border: '1px solid #bfdbfe', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%', boxShadow: '0 10px 30px rgba(37,99,235,0.08)' };

const statCardStyle = { padding: 18, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' };
const statIconStyle = { width: 40, height: 40, borderRadius: 12, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: 18, flexShrink: 0, boxShadow: '0 4px 10px rgba(37,99,235,0.12)' };
const statLabelStyle = { margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' };
const statValueStyle = { margin: '2px 0 0', color: '#0f172a', fontSize: 24, fontWeight: 800 };

const countPillStyle = { fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: 999 };

const avatarStyle = { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 };

const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  color: '#475569',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

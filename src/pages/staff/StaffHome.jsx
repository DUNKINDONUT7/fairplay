import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { listMyAssignments } from '../../services/staffService';
import { subscribeToTable } from '../../utils/supabaseClient';

const STATUS_META = {
  active: { label: 'Active', color: '#15803d', background: '#dcfce7' },
  invited: { label: 'Not activated', color: '#b45309', background: '#fef3c7' },
  revoked: { label: 'Access revoked', color: '#b91c1c', background: '#fee2e2' },
  replaced: { label: 'Replaced', color: '#64748b', background: '#f1f5f9' },
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

// The judge's or scorer's own assignments. Only events this account is
// assigned to are listed, and only an ACTIVE assignment opens a scoring
// page — the database refuses scores for anything else anyway.
export default function StaffHome({ role }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await listMyAssignments();
      setAssignments(rows.filter((row) => row.role === role));
      setFailure('');
    } catch (error) {
      setFailure(error.message);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
    const stopStaff = subscribeToTable({ table: 'event_staff', onChange: load });
    const stopEvents = subscribeToTable({ table: 'events', onChange: load });
    return () => { stopStaff?.(); stopEvents?.(); };
  }, [load]);

  const title = role === 'scorer' ? 'My Scoring Assignments' : 'My Judging Assignments';
  const subtitle = role === 'scorer'
    ? 'Events where you record the official match results'
    : 'Events where you score contestants on the rubric';

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      {failure && (
        <div role="alert" style={{ ...cardStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>
          {failure}
        </div>
      )}

      {loading ? (
        <div style={{ ...cardStyle, color: '#64748b' }}>Loading your assignments…</div>
      ) : assignments.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48, color: '#64748b' }}>
          <i className="bi bi-inbox" style={{ fontSize: 40, display: 'block', color: '#cbd5e1', marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No assignments yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>
            When an organizer assigns you as {role === 'scorer' ? 'a scorer' : 'a judge'}, open the activation link in your invitation and the event appears here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {assignments.map((assignment) => {
            const status = STATUS_META[assignment.status] || STATUS_META.invited;
            const canOpen = assignment.status === 'active';
            const open = canOpen && assignment.scoringActive;
            return (
              <div key={assignment.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', lineHeight: 1.3 }}>{assignment.eventTitle}</div>
                  <span style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: status.color, background: status.background }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', display: 'grid', gap: 4, marginBottom: 14 }}>
                  {assignment.subEventName && <span><i className="bi bi-diagram-3" style={{ marginRight: 6 }} />{assignment.subEventName}</span>}
                  {assignment.startDate && <span><i className="bi bi-calendar-event" style={{ marginRight: 6 }} />{formatDate(assignment.startDate)}</span>}
                  {assignment.location && <span><i className="bi bi-geo-alt" style={{ marginRight: 6 }} />{assignment.location}</span>}
                  <span>
                    <i className={open ? 'bi bi-broadcast' : 'bi bi-pause-circle'} style={{ marginRight: 6 }} />
                    {open ? 'Scoring is open' : assignment.eventStatus === 'completed' ? 'Event completed' : 'Scoring not open yet'}
                  </span>
                </div>
                {canOpen ? (
                  <Link
                    to={`/${role}/events/${assignment.eventId}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#ffffff', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}
                  >
                    <i className={role === 'scorer' ? 'bi bi-clipboard-data' : 'bi bi-pencil-square'} />
                    {role === 'scorer' ? 'Open score sheet' : 'Open judging sheet'}
                  </Link>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {assignment.status === 'invited' ? 'Open the activation link from your invitation to start.' : 'This assignment no longer gives access.'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 20 };

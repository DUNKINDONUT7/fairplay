import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';

export default function OrganizerSchedule() {
  const navigate = useNavigate();
  const { events, updateEvent } = useEventStore();
  const { success } = useNotificationStore();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingConflict, setPendingConflict] = useState(null);

  const activeEvents = events.filter((event) => event.status === 'active' || event.status === 'upcoming');
  const cardStyle = {
    background: '#ffffff',
    border: '1px solid #dbeafe',
    borderRadius: 20,
    padding: 24,
    boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
  };

  const checkConflicts = (eventToSchedule, targetDate) => {
    const conflicts = [];
    activeEvents.forEach(evt => {
      if (evt.id !== eventToSchedule.id && evt.scheduledDate === targetDate) {
        if (evt.location === eventToSchedule.location) {
          conflicts.push(`Venue overlap with "${evt.title}" at ${evt.location}`);
        }
        if (evt.eventType === eventToSchedule.eventType && eventToSchedule.eventType !== 'contest') {
          conflicts.push(`Category overlap: "${evt.title}" is also a ${evt.eventType} event today`);
        }
      }
    });
    return conflicts;
  };

  const applySchedule = async (event) => {
    await updateEvent(event.id, {
      scheduledDate: selectedDate,
      status: event.status === 'upcoming' ? 'active' : event.status,
    });
    success(`Schedule updated for ${event.title}.`);
  };

  const handleSchedule = async (event) => {
    const conflicts = checkConflicts(event, selectedDate);
    if (conflicts.length > 0) {
      setPendingConflict({ event, conflicts });
      return;
    }
    await applySchedule(event);
  };

  return (
    <DashboardLayout title="Match Scheduling" subtitle="Assign active dates and jump directly into scoring or brackets">
      <ConfirmDialog
        open={Boolean(pendingConflict)}
        title="Scheduling conflict detected"
        message={pendingConflict ? `${pendingConflict.conflicts.join(' ')} Assign "${pendingConflict.event.title}" to this date anyway?` : ''}
        confirmLabel="Assign Anyway"
        onCancel={() => setPendingConflict(null)}
        onConfirm={() => {
          const target = pendingConflict.event;
          setPendingConflict(null);
          applySchedule(target);
        }}
      />
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          style={{ padding: '10px 16px', borderRadius: 12, background: '#ffffff', border: '1px solid #bfdbfe', color: '#0f172a', fontSize: 13, outline: 'none', boxShadow: '0 10px 30px rgba(37,99,235,0.08)' }}
        />
        <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-robot" style={{ color: '#2563eb' }}></i> AI Conflict Detection Active
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
        {activeEvents.map((event, index) => {
          const simulatedConflicts = checkConflicts(event, selectedDate);
          
          return (
            <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>{event.title}</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{event.type} | {event.format || 'In-person'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{event.startDate} to {event.endDate}</span>
                <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>{event.participants || 0} participants</span>
              </div>
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: '#64748b' }}>
                Scheduled date: {event.scheduledDate || 'Not assigned'}
              </p>
              
              {simulatedConflicts.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}><i className="bi bi-exclamation-triangle-fill"></i> Conflict Detected</div>
                  {simulatedConflicts.map(c => (
                    <div key={c} style={{ fontSize: 11, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="bi bi-dot" />
                      {c}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => handleSchedule(event)} style={{ flex: 1, padding: '8px', borderRadius: 10, background: simulatedConflicts.length > 0 ? '#fef2f2' : '#eff6ff', border: `1px solid ${simulatedConflicts.length > 0 ? '#fecaca' : '#bfdbfe'}`, color: simulatedConflicts.length > 0 ? '#dc2626' : '#2563eb', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  Assign to Date
                </button>
                <button onClick={() => navigate(`/organizer/brackets?eventId=${event.id}`)} style={{ flex: 1, padding: '8px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Open Bracket</button>
                <button onClick={() => navigate(`/organizer/events/${event.id}`)} style={{ flex: 1, padding: '8px', borderRadius: 10, background: '#ffffff', border: '1px solid #dbeafe', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>View Event</button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

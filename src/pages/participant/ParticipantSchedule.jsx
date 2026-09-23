import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';

const TYPE_ICON = {
  Contest: 'bi-mic-fill',
  Sports: 'bi-award-fill',
};

export default function ParticipantSchedule() {
  const schedule = [
    { date: '2025-06-01', time: '09:00', event: 'National Coding Challenge', venue: 'Online', type: 'Contest' },
    { date: '2025-06-01', time: '14:00', event: 'National Coding Challenge', venue: 'Online', type: 'Contest' },
    { date: '2025-07-15', time: '08:00', event: 'City Basketball Tournament', venue: 'Sports Complex', type: 'Sports' },
  ];

  return (
    <DashboardLayout title="My Schedule" subtitle="View your upcoming events and matches">
      <div style={{ display: 'grid', gap: 12 }}>
        {schedule.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2, boxShadow: '0 16px 34px rgba(37,99,235,0.1)' }}
            transition={{ delay: i * 0.05 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 14,
              padding: '16px 20px', boxShadow: '0 10px 30px rgba(37,99,235,0.06)',
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 12, flexShrink: 0,
              background: '#eff6ff', border: '1px solid #dbeafe',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', lineHeight: 1 }}>
                {new Date(s.date).toLocaleDateString('en-US', { month: 'short' })}
              </span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {new Date(s.date).getDate()}
              </span>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{s.event}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 12.5, color: '#64748b', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-clock" style={{ color: '#94a3b8' }} /> {s.time}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-geo-alt" style={{ color: '#94a3b8' }} /> {s.venue}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#2563eb' }}>
                <i className={`bi ${TYPE_ICON[s.type] || 'bi-flag-fill'}`} /> {s.type}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>
                <i className="bi bi-hourglass-split" /> Upcoming
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </DashboardLayout>
  );
}

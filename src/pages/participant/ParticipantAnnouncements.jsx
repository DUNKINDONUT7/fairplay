import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';

export default function ParticipantAnnouncements() {
  const announcements = [
    { id: 1, title: 'Schedule Update: National Coding Challenge', text: 'The schedule for the National Coding Challenge has been updated. Please check the schedule tab for the latest information.', date: '2025-05-20', type: 'update', author: 'Event Admin' },
    { id: 2, title: 'Welcome to FairPlay!', text: 'Welcome to the FairPlay event management platform. We are excited to have you participate in our upcoming events.', date: '2025-05-15', type: 'info', author: 'System' },
    { id: 3, title: 'Results Published', text: 'The results for the Inter-School Debate Cup have been published. Check your scores tab to see how you performed.', date: '2025-04-12', type: 'result', author: 'Judging Panel' },
  ];

  const typeColor = (type) => {
    if (type === 'update') return '#d97706';
    if (type === 'result') return '#15803d';
    return '#2563eb';
  };

  const typeBackground = (type) => {
    if (type === 'update') return '#fef3c7';
    if (type === 'result') return '#dcfce7';
    return '#dbeafe';
  };

  return (
    <DashboardLayout title="Announcements" subtitle="Latest updates and notifications">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {announcements.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            style={{
              background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)',
              borderRadius: 16, padding: 20, borderLeft: `3px solid ${typeColor(a.type)}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{a.title}</h3>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                background: typeBackground(a.type), color: typeColor(a.type),
              }}>
                {a.type}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>{a.text}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
              <span>By {a.author}</span>
              <span>{a.date}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </DashboardLayout>
  );
}

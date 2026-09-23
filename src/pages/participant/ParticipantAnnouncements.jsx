import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';

const TYPE_META = {
  update: { color: '#d97706', background: '#fef3c7', icon: 'bi-arrow-repeat' },
  result: { color: '#15803d', background: '#dcfce7', icon: 'bi-trophy-fill' },
  info: { color: '#2563eb', background: '#dbeafe', icon: 'bi-info-circle-fill' },
};

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.info;
}

export default function ParticipantAnnouncements() {
  const announcements = [
    { id: 1, title: 'Schedule Update: National Coding Challenge', text: 'The schedule for the National Coding Challenge has been updated. Please check the schedule tab for the latest information.', date: '2025-05-20', type: 'update', author: 'Event Admin' },
    { id: 2, title: 'Welcome to FairPlay!', text: 'Welcome to the FairPlay event management platform. We are excited to have you participate in our upcoming events.', date: '2025-05-15', type: 'info', author: 'System' },
    { id: 3, title: 'Results Published', text: 'The results for the Inter-School Debate Cup have been published. Check your scores tab to see how you performed.', date: '2025-04-12', type: 'result', author: 'Judging Panel' },
  ];

  return (
    <DashboardLayout title="Announcements" subtitle="Latest updates and notifications">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {announcements.map((a, i) => {
          const meta = typeMeta(a.type);
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2, boxShadow: '0 16px 34px rgba(37,99,235,0.1)' }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: 'flex', gap: 16,
                background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)',
                borderRadius: 16, padding: 20, borderLeft: `3px solid ${meta.color}`,
              }}
            >
              <span style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: meta.background, color: meta.color, fontSize: 17,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className={`bi ${meta.icon}`} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 6 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{a.title}</h3>
                  <span style={{
                    padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                    background: meta.background, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.03em',
                  }}>
                    {a.type}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>{a.text}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="bi bi-person-circle" /> {a.author}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="bi bi-calendar3" /> {a.date}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

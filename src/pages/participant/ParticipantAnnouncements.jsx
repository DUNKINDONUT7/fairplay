import { useEffect } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';

const TYPE_META = {
  success: { color: '#15803d', background: '#dcfce7', icon: 'bi-check-circle-fill' },
  warning: { color: '#d97706', background: '#fef3c7', icon: 'bi-exclamation-triangle-fill' },
  error: { color: '#dc2626', background: '#fee2e2', icon: 'bi-x-circle-fill' },
  info: { color: '#2563eb', background: '#dbeafe', icon: 'bi-info-circle-fill' },
};

const CATEGORY_ICON = {
  'event-published': 'bi-calendar-plus-fill',
  'certificate-ready': 'bi-award-fill',
  'registration-confirmed': 'bi-patch-check-fill',
};

function typeMeta(notification) {
  const base = TYPE_META[notification.type] || TYPE_META.info;
  const icon = CATEGORY_ICON[notification.category] || base.icon;
  return { ...base, icon };
}

function formatTime(time) {
  if (!time) return '';
  try {
    return new Date(time).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ParticipantAnnouncements() {
  const { user } = useAuthStore();
  const { loadNotifications, subscribeToNotifications, getNotificationsForUser, markAsRead } = useNotificationStore();

  useEffect(() => {
    if (!user) return undefined;
    loadNotifications(user);
    return subscribeToNotifications(user);
  }, [loadNotifications, subscribeToNotifications, user]);

  const announcements = getNotificationsForUser(user);

  if (announcements.length === 0) {
    return (
      <DashboardLayout title="Announcements" subtitle="Latest updates and notifications">
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="bi bi-bell-slash" style={{ fontSize: 40, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No announcements yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Updates about your events and certificates will show up here.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Announcements" subtitle="Latest updates and notifications">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {announcements.map((a, i) => {
          const meta = typeMeta(a);
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2, boxShadow: '0 16px 34px rgba(37,99,235,0.1)' }}
              transition={{ delay: i * 0.05 }}
              onClick={() => { if (!a.read) markAsRead(a.id); }}
              style={{
                display: 'flex', gap: 16, cursor: a.read ? 'default' : 'pointer',
                background: a.read ? '#ffffff' : '#f8fbff',
                border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)',
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
                  {!a.read && (
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: 5 }} />
                  )}
                </div>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>{a.message}</p>
                <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-calendar3" /> {formatTime(a.time)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

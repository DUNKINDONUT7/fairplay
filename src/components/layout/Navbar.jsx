import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';

const ROLE_COLORS = {
  admin: '#2563eb',
  organizer: '#0ea5e9',
  judge: '#1d4ed8',
  participant: '#3b82f6',
  'institute-coordinator': '#2563eb',
  'sports-head': '#0ea5e9',
  osds: '#1d4ed8',
};

const ROLE_LABELS = {
  admin: 'Super Admin',
  organizer: 'Organizer',
  judge: 'Judge',
  participant: 'Participant',
  'institute-coordinator': 'Institute Coordinator',
  'sports-head': 'Sports Head',
  osds: 'OSDS',
};

export default function Navbar({ isMobile = false, onMenuToggle }) {
  const navigate = useNavigate();
  const { user, userRole } = useAuthStore();
  const { loadNotifications, subscribeToNotifications, getNotificationsForUser, markAsRead, markAllAsRead } = useNotificationStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const dropdownLinks = userRole === 'admin'
    ? [
        { label: 'Profile', path: '/admin/profile', icon: 'bi bi-person' },
        { label: 'Settings', path: '/admin/settings', icon: 'bi bi-gear' },
      ]
    : userRole === 'organizer'
      ? [
          { label: 'Profile', path: '/organizer/profile', icon: 'bi bi-person' },
          { label: 'Settings', path: '/organizer/settings', icon: 'bi bi-gear' },
        ]
      : userRole === 'judge'
        ? [
            { label: 'Profile', path: '/judge/profile', icon: 'bi bi-person' },
            { label: 'Settings', path: '/judge/settings', icon: 'bi bi-gear' },
          ]
        : userRole === 'participant'
          ? [{ label: 'Profile', path: '/participant/profile', icon: 'bi bi-person' }]
          : [];

  useEffect(() => {
    const closeAll = () => {
      setShowDropdown(false);
      setShowNotif(false);
    };

    window.addEventListener('resize', closeAll);
    window.addEventListener('scroll', closeAll, { passive: true });
    return () => {
      window.removeEventListener('resize', closeAll);
      window.removeEventListener('scroll', closeAll);
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    loadNotifications(user);
    return subscribeToNotifications(user);
  }, [loadNotifications, subscribeToNotifications, user]);

  const notifications = getNotificationsForUser(user);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const avatarLetter = String(user?.avatar || user?.name || 'U').charAt(0).toUpperCase();

  return (
    <motion.header
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: isMobile ? 64 : 72,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 24px',
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {isMobile && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onMenuToggle}
            aria-label="Open navigation"
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#1d4ed8',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 19,
              flex: '0 0 auto',
            }}
          >
            <i className="bi bi-list" />
          </motion.button>
        )}
        {isMobile && (
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, textDecoration: 'none' }}>
            <img src="/icon.svg" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
            <span style={{ color: '#1d4ed8', fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>FairPlay</span>
          </Link>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowNotif((current) => !current)}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#60a5fa',
              width: 42,
              height: 42,
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: 17,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <i className="bi bi-bell" />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>

          {showNotif && (
            <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.16 }} style={{ position: 'absolute', top: 52, right: 0, width: 320, maxHeight: 400, overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(59,130,246,0.15)', zIndex: 1200 }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1d4ed8' }}>Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllAsRead(user)}
                      style={{ border: 'none', background: 'transparent', color: '#2563eb', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No notifications yet</div>
              ) : (
                notifications.slice(0, 8).map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => {
                      markAsRead(notification.id);
                      if (notification.actionUrl) {
                        setShowNotif(false);
                        navigate(notification.actionUrl);
                      }
                    }}
                    style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: notification.read ? 'transparent' : 'rgba(37,99,235,0.06)', cursor: 'pointer' }}
                  >
                    <p style={{ fontSize: 12, color: notification.read ? '#64748b' : '#1d4ed8', margin: '0 0 4px', fontWeight: 800 }}>{notification.title || 'Notification'}</p>
                    <p style={{ fontSize: 13, color: '#0f172a', margin: 0, lineHeight: 1.35 }}>{notification.message}</p>
                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 0 }}>{new Date(notification.time).toLocaleString()}</p>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowDropdown((current) => !current)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: isMobile ? '8px 10px' : '8px 14px', cursor: 'pointer', color: '#1d4ed8' }}
          >
            <span style={{ width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(14,165,233,0.18))', color: '#1d4ed8', fontWeight: 800, fontSize: 14 }}>
              {avatarLetter}
            </span>
            <div style={{ textAlign: 'left', display: isMobile ? 'none' : 'block' }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1d4ed8' }}>{user?.name || 'User'}</p>
              <p style={{ fontSize: 11, color: ROLE_COLORS[userRole] || '#64748b', fontWeight: 700, margin: 0 }}>{ROLE_LABELS[userRole] || 'Guest'}</p>
            </div>
          </motion.button>

          {showDropdown && (
            <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.16 }} style={{ position: 'absolute', top: 56, right: 0, width: 210, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(59,130,246,0.15)', zIndex: 1200 }}>
              {dropdownLinks.map((item) => (
                <Link key={item.label} to={item.path} onClick={() => setShowDropdown(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', color: '#60a5fa', fontSize: 13, textDecoration: 'none' }}>
                  <i className={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
              <div style={{ borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={async () => {
                    setShowDropdown(false);
                    await useAuthStore.getState().logout();
                    navigate('/');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', color: '#ef4444', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                >
                  <i className="bi bi-box-arrow-right" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.header>
  );
}

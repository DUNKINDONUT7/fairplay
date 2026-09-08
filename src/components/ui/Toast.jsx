import { motion, AnimatePresence } from 'framer-motion';
import useNotificationStore from '../../store/notificationStore';

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

// Solid, dark, high-contrast backgrounds — a fixed-position overlay must stay
// readable regardless of what page it floats over. The previous version used
// near-transparent tinted backgrounds with hardcoded white message text; that
// only works over a dark page. Over the app's many light-themed pages
// (OrganizerEventDetail, judge/organizer forms, etc.) the white text on a
// barely-tinted light background was effectively invisible — every
// notifySuccess/notifyError call was firing correctly but never legible,
// which read as the whole action silently doing nothing.
const COLORS = {
  success: { bg: '#065f46', border: 'rgba(52,211,153,0.5)', icon: '#6ee7b7' },
  error: { bg: '#7f1d1d', border: 'rgba(248,113,113,0.5)', icon: '#fca5a5' },
  warning: { bg: '#78350f', border: 'rgba(251,191,36,0.5)', icon: '#fcd34d' },
  info: { bg: '#164e63', border: 'rgba(34,211,238,0.5)', icon: '#67e8f9' },
};

export default function ToastContainer() {
  const { toasts, removeToast } = useNotificationStore();

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <AnimatePresence>
        {toasts.map((toast) => {
          const colors = COLORS[toast.type] || COLORS.info;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: '14px 18px',
                minWidth: 300,
                maxWidth: 420,
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.12)', border: `1px solid ${colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.icon, fontWeight: 700, fontSize: 14,
              }}>
                {ICONS[toast.type]}
              </span>
              <p style={{ flex: 1, fontSize: 14, color: '#fff', lineHeight: 1.4 }}>{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none', color: '#a0aec0',
                  width: 24, height: 24, borderRadius: 6,
                  cursor: 'pointer', fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
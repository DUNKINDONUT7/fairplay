import { motion, AnimatePresence } from 'framer-motion';
import useNotificationStore from '../../store/notificationStore';

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const COLORS = {
  success: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  warning: { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
  info: { bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)', text: '#06b6d4' },
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
                width: 28, height: 28, borderRadius: 8,
                background: colors.bg, border: `1px solid ${colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.text, fontWeight: 700, fontSize: 14,
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
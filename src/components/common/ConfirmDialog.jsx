import { useEffect } from 'react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', padding: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'grid', placeItems: 'center', fontSize: 18,
            background: danger ? '#fef2f2' : '#eff6ff', color: danger ? '#dc2626' : '#2563eb',
          }}>
            <i className={danger ? 'bi bi-exclamation-triangle' : 'bi bi-question-circle'} />
          </span>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
        </div>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', color: '#fff',
              background: danger ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

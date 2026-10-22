import { useEffect, useState } from 'react';

const MIN_REASON = 5;

// A confirmation that needs a written reason — for corrections, undo,
// redraws, revoking or replacing staff. The reason is saved with the change
// in the change log. `onConfirm(reason)` may throw; the message is shown
// here and the dialog stays open so nothing looks saved when it isn't.
export default function ReasonDialog({
  open,
  title,
  message,
  confirmLabel = 'Save Change',
  danger = true,
  reasonLabel = 'Reason (saved in the change log)',
  reasonPlaceholder = 'e.g. Scorer typed 12 instead of 21; confirmed with the referee sheet.',
  requireText = '',
  children,
  canConfirm = true,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
      setFailure('');
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= MIN_REASON;
  const textOk = !requireText || typed.trim().toLowerCase() === String(requireText).trim().toLowerCase();
  const disabled = busy || !reasonOk || !textOk || !canConfirm;

  const submit = async () => {
    if (disabled) return;
    setBusy(true);
    setFailure('');
    try {
      await onConfirm(reason.trim());
    } catch (error) {
      setFailure(String(error?.message || 'The change was not saved.'));
      setBusy(false);
    }
  };

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-dialog-title"
        onClick={(event) => event.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', padding: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18,
            background: danger ? '#fef2f2' : '#eff6ff', color: danger ? '#dc2626' : '#2563eb',
          }}>
            <i className={danger ? 'bi bi-pencil-square' : 'bi bi-question-circle'} />
          </span>
          <h2 id="reason-dialog-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
        </div>
        {message && <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>{message}</p>}

        {children}

        <label htmlFor="reason-dialog-reason" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', margin: '4px 0 8px' }}>
          {reasonLabel}
        </label>
        <textarea
          id="reason-dialog-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder={reasonPlaceholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 12, border: `1px solid ${reasonOk ? '#10b981' : '#cbd5e1'}`, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ fontSize: 12, color: reasonOk ? '#64748b' : '#b45309', margin: '6px 0 14px' }}>
          {reasonOk ? `${reason.trim().length}/500` : `At least ${MIN_REASON} characters.`}
        </div>

        {requireText && (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="reason-dialog-text" style={{ display: 'block', fontSize: 13, color: '#334155', marginBottom: 8 }}>
              To confirm, type <strong style={{ color: '#0f172a' }}>{requireText}</strong>:
            </label>
            <input
              id="reason-dialog-text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 12, border: `1px solid ${textOk ? '#10b981' : '#cbd5e1'}`, fontSize: 14, outline: 'none' }}
            />
          </div>
        )}

        {failure && (
          <div role="alert" style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, lineHeight: 1.5 }}>
            <i className="bi bi-x-circle" style={{ marginRight: 6 }} />{failure}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 13, color: '#fff',
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
              background: danger ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
            }}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

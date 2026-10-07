// Score entry for criteria scored on a long scale (e.g. 1-50 or 1-100), where
// one button per point would be a wall of buttons. A slider for the rough
// value, a number box for the exact one, and steps for nudging it.
// Short scales keep their one-tap buttons on each judge page.

export const LONG_SCALE_FROM = 21;

// "1-100" -> 100, "10" -> 10. Falls back to 10, the system default.
export function getRangeMax(scoringRange) {
  const numbers = String(scoringRange || '').match(/\d+(\.\d+)?/g) || [];
  return Number(numbers[numbers.length - 1]) || 10;
}

export default function LargeScoreInput({ value, max, onChange, disabled = false, label = 'Score' }) {
  const current = Math.min(Math.max(Number(value) || 0, 0), max);
  const set = (next) => {
    if (disabled) return;
    const clamped = Math.min(Math.max(Math.round(Number(next) || 0), 0), max);
    onChange(clamped);
  };
  const stepStyle = {
    minWidth: 46,
    height: 44,
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#334155',
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={current}
          disabled={disabled}
          onChange={(event) => set(event.target.value)}
          aria-label={`${label} slider, 0 to ${max}`}
          style={{ flex: 1, minWidth: 0, accentColor: '#2563eb', height: 28 }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={current}
            disabled={disabled}
            onChange={(event) => set(event.target.value)}
            onFocus={(event) => event.target.select()}
            aria-label={`${label}, 0 to ${max}`}
            style={{ width: 76, padding: '9px 8px', borderRadius: 10, border: '2px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontFamily: 'monospace', fontSize: 20, fontWeight: 800, textAlign: 'center', outline: 'none' }}
          />
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>/ {max}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[-10, -5, -1].map((step) => (
          <button key={step} type="button" disabled={disabled} onClick={() => set(current + step)} style={stepStyle}>{step}</button>
        ))}
        {[1, 5, 10].map((step) => (
          <button key={step} type="button" disabled={disabled} onClick={() => set(current + step)} style={stepStyle}>+{step}</button>
        ))}
        <button type="button" disabled={disabled} onClick={() => set(max)} style={{ ...stepStyle, color: '#1d4ed8', borderColor: '#bfdbfe', background: '#eff6ff' }}>Max</button>
      </div>
    </div>
  );
}

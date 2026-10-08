// What each score level means for one criterion, shown to judges while they
// score. Renders nothing for criteria without a score guide.
import { useState } from 'react';
import { describeScoreBands } from '../../utils/rubricTools';

export default function ScoreGuide({ criterion, score, defaultOpen = false, style }) {
  const [open, setOpen] = useState(defaultOpen);
  const bands = describeScoreBands(criterion?.scoreGuide, criterion?.scoringRange).filter((band) => band.description);
  if (bands.length === 0) return null;

  const value = Number(score) || 0;
  const active = value > 0 ? bands.find((band) => value >= band.from && value <= band.to) : null;
  const visible = open ? bands : active ? [active] : [];

  return (
    <div style={{ ...style }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 0',
          border: 'none',
          background: 'transparent',
          color: '#2563eb',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <i className={open ? 'bi bi-chevron-up' : 'bi bi-info-circle'} />
        <span>{open ? 'Hide score guide' : 'Score guide'}</span>
      </button>

      {visible.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {visible.map((band) => {
            const isActive = active?.key === band.key;
            return (
              <div
                key={band.key}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: isActive ? band.soft : '#f8fafc',
                  border: `1px solid ${isActive ? band.tone : '#e2e8f0'}`,
                }}
              >
                <span style={{ flexShrink: 0, minWidth: 54, textAlign: 'center', padding: '2px 8px', borderRadius: 999, background: '#ffffff', border: `1px solid ${band.tone}`, color: band.tone, fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>
                  {band.rangeLabel}
                </span>
                <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
                  <strong style={{ color: band.tone }}>{band.label}.</strong> {band.description}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Building blocks of the criteria maker (Create Event, step 3): the weight
// bar, the rubric health panel, the "tell the AI what to change" bar, and
// the card used to edit one criterion.
import { useState } from 'react';
import { MIN_CRITERIA, describeScoreBands, hasScoreGuide, normalizeScoreGuide } from '../../utils/rubricTools';

export const CRITERION_COLORS = ['#2563eb', '#0ea5e9', '#7c3aed', '#059669', '#d97706', '#db2777', '#0d9488', '#4f46e5', '#ca8a04', '#dc2626'];

export const criterionColor = (index) => CRITERION_COLORS[index % CRITERION_COLORS.length];

const fieldStyle = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  color: '#64748b',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
};

const toolButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#475569',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

const linkButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: '#2563eb',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const smallButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 10,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 700,
  fontSize: 13,
  padding: '8px 12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const disabledLook = (disabled) => (disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null);

// One coloured segment per criterion, sized by its weight.
export function WeightBar({ criteria = [], height = 12, showLegend = false }) {
  const total = criteria.reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0);
  const scale = Math.max(total, 100);

  return (
    <div>
      <div
        role="img"
        aria-label={`Weights total ${total}%`}
        style={{ display: 'flex', height, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0' }}
      >
        {criteria.map((criterion, index) => {
          const weight = Math.max(Number(criterion.weight) || 0, 0);
          if (weight === 0) return null;
          return (
            <div
              key={criterion.id || index}
              title={`${criterion.name}: ${weight}%`}
              style={{ width: `${(weight / scale) * 100}%`, background: criterionColor(index), borderRight: '1px solid #ffffff' }}
            />
          );
        })}
      </div>
      {showLegend && (
        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          {criteria.map((criterion, index) => (
            <div key={criterion.id || index} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: criterionColor(index), flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{criterion.name || `Criterion ${index + 1}`}</span>
              <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{Number(criterion.weight) || 0}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SEVERITY_LOOK = {
  error: { icon: 'bi bi-exclamation-octagon-fill', tone: '#b91c1c', soft: '#fef2f2', border: '#fecaca' },
  high: { icon: 'bi bi-exclamation-octagon-fill', tone: '#b91c1c', soft: '#fef2f2', border: '#fecaca' },
  warning: { icon: 'bi bi-exclamation-triangle-fill', tone: '#b45309', soft: '#fffbeb', border: '#fde68a' },
  medium: { icon: 'bi bi-exclamation-triangle-fill', tone: '#b45309', soft: '#fffbeb', border: '#fde68a' },
  tip: { icon: 'bi bi-lightbulb-fill', tone: '#1d4ed8', soft: '#eff6ff', border: '#bfdbfe' },
  low: { icon: 'bi bi-lightbulb-fill', tone: '#1d4ed8', soft: '#eff6ff', border: '#bfdbfe' },
};

function IssueRow({ severity, children, action }) {
  const look = SEVERITY_LOOK[severity] || SEVERITY_LOOK.tip;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: look.soft, border: `1px solid ${look.border}` }}>
      <i className={look.icon} style={{ color: look.tone, marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
        {children}
        {action && <div style={{ marginTop: 6 }}>{action}</div>}
      </div>
    </div>
  );
}

// Live checks on the rubric, plus the optional AI review and its fixes.
export function RubricHealthPanel({
  criteria,
  issues,
  busy,
  onScaleWeights,
  onWriteGuides,
  isWritingGuides,
  onReview,
  isReviewing,
  review,
  onApplyFix,
  onDismissReview,
}) {
  const total = criteria.reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0);
  const balanced = total === 100;
  const guided = criteria.filter(hasScoreGuide).length;

  if (criteria.length === 0) {
    return <div style={{ color: '#64748b', fontSize: 14 }}>Generate or upload criteria to see the weight breakdown and rubric checks here.</div>;
  }

  const fixButton = (issue) => {
    if (issue.fix === 'scale') {
      return <button type="button" onClick={onScaleWeights} disabled={busy} style={{ ...linkButtonStyle, ...disabledLook(busy) }}><i className="bi bi-magic" />Scale to 100%</button>;
    }
    if (issue.fix === 'guides') {
      return (
        <button type="button" onClick={onWriteGuides} disabled={busy} style={{ ...linkButtonStyle, ...disabledLook(busy) }}>
          <i className={isWritingGuides ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-stars'} />
          {isWritingGuides ? 'Writing score guides...' : 'Write score guides with AI'}
        </button>
      );
    }
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: balanced ? '#0f172a' : '#b45309', fontFamily: 'monospace' }}>{total}%</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: balanced ? '#047857' : '#b45309' }}>
          <i className={balanced ? 'bi bi-check-circle-fill' : 'bi bi-exclamation-triangle-fill'} /> {balanced ? 'Weights total 100%' : `${total > 100 ? total - 100 : 100 - total}% ${total > 100 ? 'over' : 'short'}`}
        </div>
      </div>
      <WeightBar criteria={criteria} showLegend />

      <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 13, color: '#64748b' }}>
        <span><strong style={{ color: '#0f172a' }}>{criteria.length}</strong> criteria</span>
        <span><strong style={{ color: '#0f172a' }}>{guided}/{criteria.length}</strong> with score guide</span>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {issues.length === 0 ? (
          <IssueRow severity="tip"><span style={{ color: '#047857', fontWeight: 700 }}>No problems found by the quick checks.</span></IssueRow>
        ) : issues.map((issue) => (
          <IssueRow key={issue.id} severity={issue.severity} action={fixButton(issue)}>{issue.message}</IssueRow>
        ))}
      </div>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
        <button type="button" onClick={onReview} disabled={busy} style={{ ...smallButtonStyle, width: '100%', ...disabledLook(busy) }}>
          <i className={isReviewing ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-clipboard-check'} />
          <span>{isReviewing ? 'Reviewing rubric...' : review ? 'Review again' : 'Review my rubric with AI'}</span>
        </button>

        {review && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 700, lineHeight: 1.45 }}>{review.verdict || 'AI review'}</div>
              <button type="button" onClick={onDismissReview} aria-label="Dismiss review" style={{ ...linkButtonStyle, color: '#94a3b8' }}><i className="bi bi-x-lg" /></button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {review.issues.length === 0 ? (
                <IssueRow severity="tip"><span style={{ color: '#047857', fontWeight: 700 }}>The AI found nothing that needs changing.</span></IssueRow>
              ) : review.issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  severity={issue.severity}
                  action={issue.fix && (
                    <button type="button" onClick={() => onApplyFix(issue)} disabled={busy} style={{ ...linkButtonStyle, textAlign: 'left', ...disabledLook(busy) }}>
                      <i className="bi bi-magic" />Apply: {issue.fix}
                    </button>
                  )}
                >
                  {issue.criterion && <strong style={{ color: '#0f172a' }}>{issue.criterion}: </strong>}
                  {issue.problem}
                </IssueRow>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const REFINE_SUGGESTIONS = [
  'Make the descriptions more specific to this event',
  'Give more weight to technical skill',
  'Add a criterion for audience impact',
  'Use simpler wording for judges',
];

// Free-text instruction for the AI, applied to the rubric being edited.
export function RefineBar({ value, onChange, onSubmit, busy, isRefining, canUndo, onUndo, lastChange }) {
  const submit = (event) => {
    event.preventDefault();
    if (!busy && value.trim()) onSubmit(value);
  };

  return (
    <form onSubmit={submit} style={{ padding: 14, borderRadius: 16, background: 'linear-gradient(135deg, rgba(37,99,235,0.07), rgba(14,165,233,0.06))', border: '1px solid rgba(37,99,235,0.18)', marginBottom: 16 }}>
      <label htmlFor="rubric-refine" style={{ ...labelStyle, color: '#1d4ed8' }}>
        <i className="bi bi-stars" /> Tell the AI what to change — your other edits stay as they are
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id="rubric-refine"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="e.g. Add a criterion for costume and make vocals 40%"
          disabled={isRefining}
          style={{ ...fieldStyle, flex: '1 1 260px', width: 'auto' }}
        />
        <button type="submit" disabled={busy || !value.trim()} style={{ ...smallButtonStyle, background: '#2563eb', color: '#ffffff', border: '1px solid #2563eb', padding: '10px 16px', ...disabledLook(busy || !value.trim()) }}>
          <i className={isRefining ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-send'} />
          <span>{isRefining ? 'Applying...' : 'Apply'}</span>
        </button>
        {canUndo && (
          <button type="button" onClick={onUndo} disabled={busy} style={{ ...smallButtonStyle, background: '#ffffff', ...disabledLook(busy) }}>
            <i className="bi bi-arrow-counterclockwise" />
            <span>Undo</span>
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {REFINE_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChange(suggestion)}
            disabled={isRefining}
            style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid #dbeafe', background: '#ffffff', color: '#475569', fontSize: 12, cursor: 'pointer' }}
          >
            {suggestion}
          </button>
        ))}
      </div>
      {lastChange && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#047857' }}>
          <i className="bi bi-check2-circle" /> {lastChange}
        </div>
      )}
    </form>
  );
}

function ScoreGuideEditor({ criterion, onChange, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const guided = hasScoreGuide(criterion);

  if (!guided) {
    return (
      <button type="button" onClick={() => { onAdd(); setOpen(true); }} style={linkButtonStyle}>
        <i className="bi bi-plus-circle" />Add a score guide
      </button>
    );
  }

  const levels = normalizeScoreGuide(criterion.scoreGuide);
  const bands = describeScoreBands(levels, criterion.scoringRange);
  const bandFor = (key) => bands.find((band) => band.key === key);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} style={linkButtonStyle}>
          <i className={open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'} />
          Score guide
          <span style={{ color: '#94a3b8', fontWeight: 600 }}>— what each score means</span>
        </button>
        {open && (
          <button type="button" onClick={onRemove} style={{ ...linkButtonStyle, color: '#94a3b8' }}>
            <i className="bi bi-trash3" />Remove guide
          </button>
        )}
      </div>

      {!open && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {bands.map((band) => (
            <span key={band.key} title={band.description} style={{ padding: '3px 9px', borderRadius: 999, background: band.soft, color: band.tone, fontSize: 12, fontWeight: 700 }}>
              {band.rangeLabel} {band.label}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {levels.map((level) => {
            const band = bandFor(level.key);
            if (!band) return null;
            return (
              <div key={level.key} style={{ display: 'grid', gridTemplateColumns: '132px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
                <div style={{ padding: '8px 10px', borderRadius: 10, background: band.soft, border: `1px solid ${band.tone}33` }}>
                  <div style={{ color: band.tone, fontWeight: 800, fontSize: 13 }}>{band.label}</div>
                  <div style={{ color: '#475569', fontSize: 12, fontFamily: 'monospace' }}>Score {band.rangeLabel}</div>
                </div>
                <textarea
                  value={level.description}
                  onChange={(event) => onChange(level.key, event.target.value)}
                  rows={2}
                  aria-label={`${band.label} description for ${criterion.name}`}
                  placeholder={`What a judge sees at the ${band.label.toLowerCase()} level`}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CriterionCard({
  criterion,
  index,
  count,
  busy,
  isRewriting,
  onChange,
  onMove,
  onRemove,
  onRewrite,
  onGuideChange,
  onGuideAdd,
  onGuideRemove,
}) {
  const color = criterionColor(index);
  const canRemove = count > MIN_CRITERIA;

  return (
    <div style={{ borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0', borderLeft: `5px solid ${color}`, padding: 16, opacity: isRewriting ? 0.55 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ width: 36, height: 42, borderRadius: 10, background: color, color: '#ffffff', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>
          {index + 1}
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label style={labelStyle} htmlFor={`criterion-name-${index}`}>Criterion name</label>
          <input
            id={`criterion-name-${index}`}
            value={criterion.name}
            onChange={(event) => onChange('name', event.target.value)}
            style={{ ...fieldStyle, height: 42, fontWeight: 700 }}
          />
        </div>
        <div style={{ width: 104 }}>
          <label style={labelStyle} htmlFor={`criterion-weight-${index}`}>Weight</label>
          <div style={{ position: 'relative' }}>
            <input
              id={`criterion-weight-${index}`}
              type="number"
              min="0"
              max="100"
              value={criterion.weight}
              onChange={(event) => onChange('weight', event.target.value)}
              style={{ ...fieldStyle, height: 42, paddingRight: 28, fontWeight: 800, fontFamily: 'monospace' }}
            />
            <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 700, pointerEvents: 'none' }}>%</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 3 }}>
          <button type="button" onClick={onRewrite} disabled={busy} title="Rewrite this criterion with AI" aria-label={`Rewrite ${criterion.name} with AI`} style={{ ...toolButtonStyle, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff', ...disabledLook(busy) }}>
            <i className={isRewriting ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-stars'} />
          </button>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Move up" aria-label={`Move ${criterion.name} up`} style={{ ...toolButtonStyle, ...disabledLook(index === 0) }}>
            <i className="bi bi-arrow-up" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} title="Move down" aria-label={`Move ${criterion.name} down`} style={{ ...toolButtonStyle, ...disabledLook(index === count - 1) }}>
            <i className="bi bi-arrow-down" />
          </button>
          <button type="button" onClick={onRemove} disabled={!canRemove} title={canRemove ? 'Remove criterion' : `A rubric needs at least ${MIN_CRITERIA} criteria`} aria-label={`Remove ${criterion.name}`} style={{ ...toolButtonStyle, color: '#b91c1c', ...disabledLook(!canRemove) }}>
            <i className="bi bi-trash3" />
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle} htmlFor={`criterion-description-${index}`}>What is being judged</label>
        <textarea
          id={`criterion-description-${index}`}
          value={criterion.description}
          onChange={(event) => onChange('description', event.target.value)}
          rows={2}
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: '0 1 150px', minWidth: 110 }}>
          <label style={labelStyle} htmlFor={`criterion-range-${index}`}>Scoring range</label>
          <input
            id={`criterion-range-${index}`}
            value={criterion.scoringRange}
            onChange={(event) => onChange('scoringRange', event.target.value)}
            style={{ ...fieldStyle, fontFamily: 'monospace' }}
          />
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label style={labelStyle} htmlFor={`criterion-instructions-${index}`}>Instructions for judges</label>
          <textarea
            id={`criterion-instructions-${index}`}
            value={criterion.judgeInstructions}
            onChange={(event) => onChange('judgeInstructions', event.target.value)}
            rows={2}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      <div style={{ paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
        <ScoreGuideEditor criterion={criterion} onChange={onGuideChange} onAdd={onGuideAdd} onRemove={onGuideRemove} />
      </div>
    </div>
  );
}

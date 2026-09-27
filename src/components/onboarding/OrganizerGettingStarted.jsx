import { useNavigate } from 'react-router-dom';

// Dashboard checklist for new organizers. Each step is ticked off from the
// organizer's own events, so it tracks real progress, not clicks.
function buildSteps(events, judgeAssignments) {
  const hasEvent = events.length > 0;
  const eventIds = new Set(events.map((event) => String(event.id)));
  return [
    {
      key: 'event',
      title: 'Create your first event',
      description: 'Add the event type, schedule, venue and registration deadline.',
      done: hasEvent,
      to: '/organizer/create-event',
      cta: 'Create event',
    },
    {
      key: 'criteria',
      title: 'Set judging criteria',
      description: 'Build or generate the rubric judges will score with.',
      done: events.some((event) => Array.isArray(event.criteria) && event.criteria.length > 0),
      to: '/organizer/events',
      cta: 'Open events',
    },
    {
      key: 'judges',
      title: 'Invite your judges',
      description: 'Send invites from the event page so judges can sign in.',
      done: judgeAssignments.some((assignment) => eventIds.has(String(assignment.eventId)))
        || events.some((event) => Array.isArray(event.judges) && event.judges.length > 0),
      to: '/organizer/events',
      cta: 'Invite judges',
    },
    {
      key: 'participants',
      title: 'Get participants registered',
      description: 'Share the registration link and review sign-ups.',
      done: events.some((event) => Number(event.participants || 0) > 0),
      to: '/organizer/contestants',
      cta: 'View contestants',
    },
    {
      key: 'scoring',
      title: 'Run live scoring',
      description: 'Follow scores in real time and publish the results.',
      done: events.some((event) => event.status === 'active' || event.status === 'completed'),
      to: '/organizer/scoring',
      cta: 'Open scoring',
    },
  ];
}

export default function OrganizerGettingStarted({ events, judgeAssignments = [], onReplayTour, onDismiss }) {
  const navigate = useNavigate();
  const steps = buildSteps(events, judgeAssignments);
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <section style={cardStyle} aria-labelledby="getting-started-title">
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrowStyle}>Getting started</div>
          <h2 id="getting-started-title" style={titleStyle}>
            {nextStep ? 'Set up your first competition' : "You're all set!"}
          </h2>
          <p style={subtitleStyle}>
            {doneCount} of {steps.length} steps done
          </p>
        </div>
        <div style={headerActionsStyle}>
          <button type="button" onClick={onReplayTour} style={linkButtonStyle}>
            <i className="bi bi-play-circle" /> Watch tutorial
          </button>
          <button type="button" onClick={onDismiss} style={linkButtonStyle} aria-label="Hide getting started">
            <i className="bi bi-x-lg" /> Hide
          </button>
        </div>
      </div>

      <div style={progressTrackStyle} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ ...progressFillStyle, width: `${percent}%` }} />
      </div>

      <ol style={listStyle}>
        {steps.map((step, index) => {
          const isNext = step === nextStep;
          return (
            <li
              key={step.key}
              style={{
                ...itemStyle,
                borderColor: isNext ? '#93c5fd' : '#e2e8f0',
                background: isNext ? '#eff6ff' : '#ffffff',
              }}
            >
              <span
                style={{
                  ...badgeStyle,
                  background: step.done ? '#10b981' : isNext ? '#2563eb' : '#e2e8f0',
                  color: step.done || isNext ? '#ffffff' : '#64748b',
                }}
              >
                {step.done ? <i className="bi bi-check-lg" /> : index + 1}
              </span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div
                  style={{
                    ...itemTitleStyle,
                    color: step.done ? '#64748b' : '#0f172a',
                    textDecoration: step.done ? 'line-through' : 'none',
                  }}
                >
                  {step.title}
                </div>
                <div style={itemDescriptionStyle}>{step.description}</div>
              </div>
              {!step.done && (
                <button
                  type="button"
                  onClick={() => navigate(step.to)}
                  style={isNext ? primaryButtonStyle : secondaryButtonStyle}
                >
                  {step.cta}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const cardStyle = {
  marginBottom: 28,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 22,
  padding: 22,
  boxShadow: '0 12px 32px rgba(15,23,42,0.06)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  flexWrap: 'wrap',
};

const headerActionsStyle = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};

const eyebrowStyle = {
  color: '#2563eb',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 700,
  marginBottom: 6,
};

const titleStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  color: '#0f172a',
};

const subtitleStyle = {
  margin: '4px 0 0',
  fontSize: 13,
  color: '#64748b',
};

const linkButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  color: '#2563eb',
  fontWeight: 700,
  fontSize: 13,
  padding: '6px 8px',
  borderRadius: 8,
  cursor: 'pointer',
};

const progressTrackStyle = {
  height: 8,
  borderRadius: 999,
  background: '#e2e8f0',
  overflow: 'hidden',
  margin: '16px 0 18px',
};

const progressFillStyle = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg,#2563eb,#0ea5e9)',
  transition: 'width 0.3s ease',
};

const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 10,
};

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '12px 14px',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  flexWrap: 'wrap',
};

const badgeStyle = {
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: 13,
  fontWeight: 800,
};

const itemTitleStyle = {
  fontSize: 14,
  fontWeight: 700,
};

const itemDescriptionStyle = {
  fontSize: 12,
  lineHeight: 1.5,
  color: '#64748b',
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 10,
  padding: '9px 14px',
  background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  marginLeft: 'auto',
};

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '8px 13px',
  background: '#ffffff',
  color: '#334155',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  marginLeft: 'auto',
};

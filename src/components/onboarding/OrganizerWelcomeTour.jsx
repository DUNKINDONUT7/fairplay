import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

// First-run walkthrough for organizers. It explains the whole event flow in
// order, one step per slide, and ends on "create your first event".
const STEPS = [
  {
    icon: 'bi-stars',
    color: '#2563eb',
    title: 'Welcome to FairPlay!',
    body: 'FairPlay helps you run fair, transparent competitions — from registration to judging to certificates. This quick tour shows you how it works in 5 simple steps.',
    tips: ['Takes about a minute', 'You can replay it anytime from your dashboard'],
  },
  {
    icon: 'bi-calendar-plus',
    color: '#2563eb',
    title: '1. Create your event',
    body: 'Pick the event type (sports fest, pageant, singing contest, and more), then add the title, description, schedule and venue.',
    tips: ['Events must start at least 2 days from today', 'Set a registration deadline on or before the start date'],
  },
  {
    icon: 'bi-list-check',
    color: '#7c3aed',
    title: '2. Set the judging criteria',
    body: 'Decide how contestants are scored. Let FairPlay draft a rubric from your event description, or upload your own criteria.',
    tips: ['Criteria weights must add up to 100%', 'You can edit any AI-generated criterion'],
  },
  {
    icon: 'bi-person-badge',
    color: '#0f766e',
    title: '3. Invite your judges',
    body: 'Send judges an invite by email. They get their own account and only see the events you assign to them.',
    tips: ['Judges sign in with a secure QR/session code on event day', 'Track who has scored from Judge Management'],
  },
  {
    icon: 'bi-people',
    color: '#b45309',
    title: '4. Get participants registered',
    body: 'Share the event link so contestants or teams can register. Review sign-ups and check them in with QR codes on the day.',
    tips: ['Share the link well before your registration deadline', 'See everyone in Contestants and Attendance'],
  },
  {
    icon: 'bi-trophy',
    color: '#dc2626',
    title: '5. Score live & publish results',
    body: 'Judges score in real time and FairPlay ranks everyone automatically. When you finalize, results and certificates are ready to share.',
    tips: ['Watch scores come in from Scoring', 'Download reports and certificates after the event'],
  },
];

export default function OrganizerWelcomeTour({ open, userName, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setStep((current) => Math.min(current + 1, STEPS.length - 1));
      if (event.key === 'ArrowLeft') setStep((current) => Math.max(current - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const firstName = String(userName || '').trim().split(/\s+/)[0];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(event) => event.stopPropagation()}
        style={cardStyle}
      >
        <div style={topBarStyle}>
          <span style={stepCounterStyle}>
            {isFirst ? 'Getting started' : `Step ${step} of ${STEPS.length - 1}`}
          </span>
          <button type="button" onClick={onClose} style={skipButtonStyle}>
            Skip tour
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            <div style={{ ...iconWrapStyle, background: `${current.color}14`, color: current.color }}>
              <i className={`bi ${current.icon}`} />
            </div>
            <h2 id="welcome-tour-title" style={titleStyle}>
              {isFirst && firstName ? `Welcome, ${firstName}!` : current.title}
            </h2>
            <p style={bodyStyle}>{current.body}</p>
            <ul style={tipListStyle}>
              {current.tips.map((tip) => (
                <li key={tip} style={tipStyle}>
                  <i className="bi bi-check-circle-fill" style={{ color: current.color, marginTop: 2 }} />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>

        <div style={dotsStyle} aria-hidden="true">
          {STEPS.map((item, index) => (
            <button
              key={item.title}
              type="button"
              tabIndex={-1}
              onClick={() => setStep(index)}
              style={{
                ...dotStyle,
                width: index === step ? 22 : 8,
                background: index === step ? '#2563eb' : index < step ? '#93c5fd' : '#e2e8f0',
              }}
            />
          ))}
        </div>

        <div style={footerStyle}>
          {isFirst ? (
            <span />
          ) : (
            <button type="button" onClick={() => setStep(step - 1)} style={secondaryButtonStyle}>
              <i className="bi bi-arrow-left" /> Back
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/organizer/create-event');
              }}
              style={primaryButtonStyle}
            >
              Create my first event <i className="bi bi-arrow-right" />
            </button>
          ) : (
            <button type="button" onClick={() => setStep(step + 1)} style={primaryButtonStyle}>
              {isFirst ? 'Show me how' : 'Next'} <i className="bi bi-arrow-right" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(15,23,42,0.45)',
  backdropFilter: 'blur(4px)',
  display: 'grid',
  placeItems: 'center',
  padding: 16,
};

const cardStyle = {
  width: '100%',
  maxWidth: 480,
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  background: '#ffffff',
  borderRadius: 24,
  padding: 24,
  boxShadow: '0 30px 80px rgba(15,23,42,0.25)',
};

const topBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 18,
};

const stepCounterStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#2563eb',
};

const skipButtonStyle = {
  border: 'none',
  background: 'transparent',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 4,
};

const iconWrapStyle = {
  width: 56,
  height: 56,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  fontSize: 26,
  marginBottom: 16,
};

const titleStyle = {
  margin: '0 0 8px',
  fontSize: 22,
  fontWeight: 800,
  color: '#0f172a',
};

const bodyStyle = {
  margin: '0 0 16px',
  fontSize: 14,
  lineHeight: 1.7,
  color: '#475569',
};

const tipListStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 14,
  display: 'grid',
  gap: 10,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
};

const tipStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  fontSize: 13,
  lineHeight: 1.5,
  color: '#334155',
};

const dotsStyle = {
  display: 'flex',
  justifyContent: 'center',
  gap: 6,
  margin: '22px 0 18px',
};

const dotStyle = {
  height: 8,
  borderRadius: 999,
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  transition: 'width 0.2s ease, background 0.2s ease',
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: 'none',
  borderRadius: 12,
  padding: '12px 18px',
  background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#ffffff',
  color: '#334155',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

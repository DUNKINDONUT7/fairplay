import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const LAST_UPDATED = 'October 8, 2026';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of These Terms',
    body: [
      'By creating a FairPlay account or registering for an event through FairPlay, you agree to these Terms and Conditions and to the Privacy Policy below. If you do not agree, please do not create an account or register for events.',
    ],
  },
  {
    title: '2. What FairPlay Does',
    body: [
      'FairPlay is an event and tournament management platform. It lets organizers create events, accept registrations, manage brackets and schedules, record scores, and publish results, and it lets participants register for events and follow their schedules, scores, and announcements.',
      'Events are run by their organizers, not by FairPlay. The organizer decides the rules, eligibility, schedule, venue, and results of each event.',
    ],
  },
  {
    title: '3. Your Account',
    list: [
      'Provide accurate information when you create an account, and keep it up to date.',
      'Keep your password private. You are responsible for activity that happens under your account.',
      'Self-registration creates a participant account. Organizer accounts are created and approved by an administrator.',
      'Tell an administrator right away if you think someone else has used your account.',
    ],
  },
  {
    title: '4. Registering for Events',
    list: [
      'Register only with your own details, or with the details of team members who have agreed to be registered.',
      'If you register a team, you confirm that every listed member, team leader, and coach knows their information is being submitted and agrees to it.',
      'Registration may close when an event starts, when it reaches its participant limit, or when the organizer closes it.',
      'A registration may be reviewed by the organizer and can be approved, declined, or removed if it is incomplete, duplicated, or does not meet the event requirements.',
    ],
  },
  {
    title: '5. Fair Play and Conduct',
    body: ['When you use FairPlay you agree not to:'],
    list: [
      'Submit false, misleading, or duplicate registrations.',
      'Impersonate another person, team, school, or organization.',
      'Tamper with, or attempt to tamper with, scores, brackets, rankings, attendance, or certificates.',
      'Access accounts, events, or data that you are not authorized to access.',
      'Disrupt the platform or interfere with other people using it.',
    ],
  },
  {
    title: '6. Scores, Rankings, and Results',
    body: [
      'Scores, rankings, brackets, and results shown in FairPlay are entered by organizers, judges, and scorers. Questions or disputes about a result should be raised with the event organizer, whose decision applies to that event.',
    ],
  },
  {
    title: '7. Suspension and Removal',
    body: [
      'An account or registration may be suspended or removed if these terms are broken, or if that is needed to protect an event, other users, or the platform.',
    ],
  },
  {
    title: '8. Availability',
    body: [
      'We work to keep FairPlay available and accurate, but the platform is provided as is. It may be unavailable at times for maintenance or for reasons outside our control, and features may change.',
    ],
  },
  {
    title: '9. Changes to These Terms',
    body: [
      'These terms may be updated from time to time. The date at the top of this page shows when they were last changed. Continuing to use FairPlay after a change means you accept the updated terms.',
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    title: 'Information We Collect',
    list: [
      'Account details: your full name, email address, and password.',
      'Registration details: phone number, age, school year, school or organization, team name, division, and position or role, for you and for the team members you register.',
      'Event activity: the events you join, attendance, scores, rankings, and certificates.',
    ],
  },
  {
    title: 'How We Use It',
    list: [
      'To create and secure your account.',
      'To register you for events and show you your schedule, scores, and announcements.',
      'To let organizers manage their events, contact registered participants, and publish results.',
      'To keep the platform secure and working properly.',
    ],
  },
  {
    title: 'Who Can See It',
    body: [
      'Your registration details are visible to the organizer of the event you register for and to the platform administrators. Participant or team names, brackets, scores, and rankings may be displayed publicly as part of an event. We do not sell your personal information.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can review and update your details from your profile. To ask for your information to be corrected or deleted, contact the organizer of your event or a platform administrator.',
    ],
  },
];

export default function Terms() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.hash]);

  // Opened in its own tab (e.g. from the sign-up form) there is no in-app
  // history to go back to, so fall back to the home page.
  const handleBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <button type="button" onClick={handleBack} style={backButtonStyle}>
          <i className="bi bi-arrow-left" />
          Back
        </button>

        <div style={{ textAlign: 'center', margin: '18px 0 28px' }}>
          <i className="bi bi-file-earmark-text" style={{ fontSize: 40, color: '#2563eb', display: 'block', marginBottom: 10 }} />
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: '0 0 6px' }}>Terms and Conditions</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Last updated: {LAST_UPDATED}</p>
        </div>

        {TERMS_SECTIONS.map((section) => <Section key={section.title} {...section} />)}

        <div id="privacy" style={{ borderTop: '1px solid #e2e8f0', marginTop: 32, paddingTop: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 6px' }}>Privacy Policy</h1>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.7, margin: '0 0 8px' }}>
            This explains what personal information FairPlay collects and how it is used.
          </p>
          {PRIVACY_SECTIONS.map((section) => <Section key={section.title} {...section} />)}
        </div>

        <button type="button" onClick={handleBack} style={{ ...backButtonStyle, width: '100%', justifyContent: 'center', marginTop: 32, padding: '12px 14px' }}>
          <i className="bi bi-arrow-left" />
          Back
        </button>
      </div>
    </div>
  );
}

function Section({ title, body = [], list = [] }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{title}</h2>
      {body.map((paragraph) => (
        <p key={paragraph} style={textStyle}>{paragraph}</p>
      ))}
      {list.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          {list.map((item) => <li key={item} style={{ ...textStyle, margin: 0 }}>{item}</li>)}
        </ul>
      )}
    </section>
  );
}

const pageStyle = {
  minHeight: '100svh',
  background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
  padding: 'clamp(20px, 4vw, 48px) clamp(12px, 3vw, 28px)',
  boxSizing: 'border-box',
};

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 'clamp(18px, 3vw, 36px)',
  width: 'min(100%, 760px)',
  margin: '0 auto',
  boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
  boxSizing: 'border-box',
};

const backButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 14px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 800,
  fontSize: 14,
  cursor: 'pointer',
};

const textStyle = {
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.75,
  margin: '0 0 8px',
};

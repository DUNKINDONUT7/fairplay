import React, { useEffect, useMemo, useState } from 'react';
import Icons from './Icons';

const CERTIFICATE_COPY = {
  participant: {
    title: 'Certificate of Participation',
    recipientLabel: 'Participant',
    body: 'For active participation and valuable contribution to the event.',
    issuerLeft: 'FairPlay Platform',
    issuerLeftRole: 'Platform Signature',
    issuerRight: 'Event Director',
    issuerRightRole: 'Organizer Signature',
  },
  judge: {
    title: 'Certificate of Appreciation',
    recipientLabel: 'Judge',
    body: 'For expert judging, fair evaluation, and outstanding service.',
    issuerLeft: 'FairPlay Platform',
    issuerLeftRole: 'Platform Signature',
    issuerRight: 'Chief Judge',
    issuerRightRole: 'Judging Panel Signature',
  },
};

const CRITERIA_LIBRARY = [
  {
    name: 'Creativity & Originality',
    weight: '30%',
    desc: 'Measures fresh ideas, unique interpretation, and originality.',
  },
  {
    name: 'Technical Execution',
    weight: '25%',
    desc: 'Checks polish, accuracy, and overall implementation quality.',
  },
  {
    name: 'Clarity & Presentation',
    weight: '20%',
    desc: 'Evaluates how clearly the entry communicates its message.',
  },
  {
    name: 'Impact & Relevance',
    weight: '15%',
    desc: 'Measures how well the entry connects with the event keywords.',
  },
  {
    name: 'Consistency & Detail',
    weight: '10%',
    desc: 'Rewards attention to detail and consistent quality.',
  },
];

const CARD_STYLE = {
  background: 'rgba(26, 31, 46, 0.82)',
  border: '1px solid rgba(6, 182, 212, 0.14)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--spacing-lg)',
  transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
};

const BUTTON_STYLE = {
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--spacing-sm) var(--spacing-md)',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 'var(--font-size-sm)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  transition: 'all 0.2s ease',
};

function toTitleCase(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function parseKeywords(input) {
  return input
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function buildCriteriaFromKeywords(input) {
  const tokens = parseKeywords(input);
  const source = tokens.length ? tokens : ['event'];

  return CRITERIA_LIBRARY.map((criterion, index) => {
    const keyword = source[index % source.length];
    const prefix = toTitleCase(keyword);
    return {
      name: `${prefix} ${criterion.name}`,
      weight: criterion.weight,
      desc: `${criterion.desc} Focus keyword: "${keyword}".`,
    };
  }).slice(0, Math.max(3, Math.min(source.length + 1, 5)));
}

function formatDate(value) {
  if (!value) return 'Pending completion';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function CertificateModal({
  isOpen,
  onClose,
  role,
  recipientName,
  eventName,
  date,
}) {
  if (!isOpen) return null;

  const copy = CERTIFICATE_COPY[role] || CERTIFICATE_COPY.participant;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1f2e, #0f1419)',
          border: '2px solid #fbbf24',
          borderRadius: '18px',
          padding: '36px',
          maxWidth: '820px',
          width: '100%',
          textAlign: 'center',
          position: 'relative',
          boxShadow: '0 0 40px rgba(251, 191, 36, 0.2)',
          animation: 'fadeInUp 0.25s ease-out',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#a0aec0',
            fontSize: '22px',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            cursor: 'pointer',
          }}
          aria-label="Close certificate preview"
        >
          ✕
        </button>

        <div
          style={{
            color: '#fbbf24',
            marginBottom: '18px',
            display: 'inline-flex',
            padding: '14px',
            borderRadius: '999px',
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
          }}
        >
          <Icons.Award size={56} />
        </div>

        <p
          style={{
            color: '#fbbf24',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '10px',
          }}
        >
          FairPlay Certificate
        </p>

        <h2
          style={{
            fontSize: 'clamp(28px, 4vw, 40px)',
            color: '#fbbf24',
            fontFamily: 'serif',
            marginBottom: '12px',
            lineHeight: 1.1,
          }}
        >
          {copy.title}
        </h2>

        <p style={{ color: '#a0aec0', fontSize: '16px', marginBottom: '14px' }}>
          This certificate is proudly presented to
        </p>

        <h1
          style={{
            fontSize: 'clamp(34px, 5vw, 54px)',
            color: '#fff',
            marginBottom: '18px',
            borderBottom: '1px solid #fbbf24',
            display: 'inline-block',
            paddingBottom: '10px',
            lineHeight: 1.1,
          }}
        >
          {recipientName}
        </h1>

        <p style={{ color: '#a0aec0', fontSize: '16px', marginBottom: '10px' }}>
          {copy.body}
        </p>

        <div
          style={{
            display: 'grid',
            gap: '10px',
            background: 'rgba(6, 182, 212, 0.06)',
            border: '1px solid rgba(6, 182, 212, 0.14)',
            borderRadius: '14px',
            padding: '18px',
            margin: '24px 0 28px',
          }}
        >
          <p style={{ color: '#06b6d4', fontSize: '18px', fontWeight: 700 }}>
            {eventName}
          </p>
          <p style={{ color: '#a0aec0', fontSize: '15px' }}>
            Awarded on {formatDate(date)}
          </p>
          <p style={{ color: '#a0aec0', fontSize: '14px' }}>
            Recipient type: {copy.recipientLabel}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginTop: '32px',
            borderTop: '1px solid rgba(251, 191, 36, 0.25)',
            paddingTop: '20px',
          }}
        >
          <div>
            <p style={{ color: '#fff', fontWeight: 700 }}>{copy.issuerLeft}</p>
            <p style={{ color: '#a0aec0', fontSize: '14px' }}>{copy.issuerLeftRole}</p>
          </div>
          <div>
            <p style={{ color: '#fff', fontWeight: 700 }}>{copy.issuerRight}</p>
            <p style={{ color: '#a0aec0', fontSize: '14px' }}>{copy.issuerRightRole}</p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          style={{
            marginTop: '28px',
            background: 'var(--accent-blue)',
            color: '#fff',
            border: 'none',
            padding: '12px 22px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: '700',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0, 132, 255, 0.25)',
          }}
        >
          <Icons.Download size={18} /> Download / Print
        </button>
      </div>
    </div>
  );
}

function AutoCriteriaGenerator() {
  const [keywords, setKeywords] = useState('');
  const [criteria, setCriteria] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const trimmed = keywords.trim();

    if (!trimmed) {
      setCriteria([]);
      setStatus('idle');
      return undefined;
    }

    setStatus('generating');

    const timer = window.setTimeout(() => {
      setCriteria(buildCriteriaFromKeywords(trimmed));
      setStatus('ready');
    }, 350);

    return () => window.clearTimeout(timer);
  }, [keywords]);

  const keywordChips = useMemo(() => parseKeywords(keywords), [keywords]);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.08), rgba(6, 182, 212, 0.06))',
        border: '1px solid rgba(147, 51, 234, 0.22)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-lg)',
        marginTop: 'var(--spacing-xl)',
        animation: 'fadeInUp 0.3s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: 'var(--spacing-md)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <Icons.Zap size={24} color="var(--accent-purple)" />
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
            Automatic Criteria Generator
          </h2>
        </div>

        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            padding: '6px 10px',
            borderRadius: '999px',
            color: status === 'ready' ? 'var(--accent-green)' : 'var(--accent-cyan)',
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.18)',
          }}
        >
          {status === 'generating' ? 'Generating automatically' : 'Words-only input'}
        </span>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
        Type only keywords separated by commas. The rubric is generated automatically, so no manual criteria editing is needed.
      </p>

      <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
        <input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="innovation, design, teamwork, accuracy"
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'white',
            fontSize: '16px',
            outline: 'none',
          }}
        />

        {keywordChips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {keywordChips.map((chip) => (
              <span
                key={chip}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '999px',
                  background: 'rgba(6, 182, 212, 0.08)',
                  color: 'var(--accent-cyan)',
                  border: '1px solid rgba(6, 182, 212, 0.16)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                <Icons.CheckCircle size={14} /> {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      {criteria.length > 0 && (
        <div
          style={{
            marginTop: 'var(--spacing-lg)',
            background: 'rgba(15, 20, 25, 0.62)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-md)',
            animation: 'fadeIn 0.25s ease-out',
            border: '1px solid rgba(6, 182, 212, 0.2)',
          }}
        >
          <h3
            style={{
              marginBottom: 'var(--spacing-md)',
              color: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Icons.CheckCircle size={18} /> Generated Rubric
          </h3>

          <div style={{ display: 'grid', gap: '10px' }}>
            {criteria.map((criterion, index) => (
              <div
                key={criterion.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '14px',
                  borderBottom:
                    index < criteria.length - 1 ? '1px solid var(--border-color)' : 'none',
                  background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderRadius: '12px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, color: 'white', fontSize: '16px' }}>
                    {criterion.name}
                  </span>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {criterion.desc}
                  </p>
                </div>
                <span
                  style={{
                    fontWeight: 900,
                    color: 'var(--accent-green)',
                    fontSize: '16px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {criterion.weight}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const [stats] = useState({
    totalUsers: 1284,
    activeEvents: 12,
    totalEvents: 47,
    completedEvents: 28,
    systemUptime: '99.9%',
    totalTabulations: 3842,
  });

  return (
    <div style={{ padding: 'var(--spacing-xl)', background: 'var(--bg-primary)' }}>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 700,
            marginBottom: 'var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
          }}
        >
          <Icons.BarChart size={32} color="var(--accent-cyan)" />
          System Analytics
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Monitor platform health and performance metrics
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-2xl)',
        }}
      >
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: Icons.Users, color: 'var(--accent-cyan)' },
          { label: 'Active Events', value: stats.activeEvents, icon: Icons.PlayCircle, color: 'var(--accent-blue)' },
          { label: 'Total Events', value: stats.totalEvents, icon: Icons.Calendar, color: 'var(--accent-purple)' },
          { label: 'Completed', value: stats.completedEvents, icon: Icons.CheckCircle, color: 'var(--accent-green)' },
          { label: 'System Uptime', value: stats.systemUptime, icon: Icons.Zap, color: 'var(--accent-yellow)' },
          { label: 'Total Scores', value: stats.totalTabulations, icon: Icons.BarChart, color: 'var(--accent-pink)' },
        ].map((stat) => (
          <div key={stat.label} style={{ ...CARD_STYLE, cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                >
                  {stat.label}
                </p>
                <p style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </p>
              </div>
              <div style={{ opacity: 0.35 }}>
                <stat.icon size={40} color={stat.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'rgba(26, 31, 46, 0.8)',
          border: '1px solid rgba(6, 182, 212, 0.1)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 700,
            marginBottom: 'var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
          }}
        >
          <Icons.Lock size={20} color="var(--accent-cyan)" />
          Recent User Activity
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {[
            { user: 'John Doe', action: 'Created Event: National Coding Challenge', time: '2 mins ago', type: 'organizer' },
            { user: 'Jane Smith', action: 'Submitted Scores for 5 participants', time: '15 mins ago', type: 'judge' },
            { user: 'Admin Panel', action: 'Approved 12 new user registrations', time: '1 hour ago', type: 'admin' },
          ].map((activity) => (
            <div
              key={`${activity.user}-${activity.time}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                padding: 'var(--spacing-md)',
                background: 'rgba(15, 20, 25, 0.6)',
                borderRadius: 'var(--radius-md)',
                borderLeft: `3px solid ${
                  activity.type === 'admin' ? 'var(--accent-red)' : 'var(--accent-cyan)'
                }`,
              }}
            >
              <div>
                <p style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>
                  {activity.user}
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {activity.action}
                </p>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>
                {activity.time}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrganizerDashboard() {
  const [events] = useState([
    {
      id: 1,
      title: 'National Coding Challenge',
      status: 'active',
      participants: 128,
      maxParticipants: 200,
      startDate: '2025-06-01',
    },
    {
      id: 2,
      title: 'City Basketball Tournament',
      status: 'upcoming',
      participants: 64,
      maxParticipants: 64,
      startDate: '2025-07-15',
    },
    {
      id: 3,
      title: 'Valorant Championship Series',
      status: 'completed',
      participants: 32,
      maxParticipants: 32,
      startDate: '2025-05-20',
    },
  ]);

  return (
    <div style={{ padding: 'var(--spacing-xl)', background: 'var(--bg-primary)' }}>
      <div
        style={{
          marginBottom: 'var(--spacing-xl)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--font-size-3xl)',
              fontWeight: 700,
              marginBottom: 'var(--spacing-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-md)',
            }}
          >
            <Icons.Calendar size={32} color="var(--accent-cyan)" />
            My Events
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage and monitor all your events</p>
        </div>

        <button
          style={{
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
            color: 'var(--text-dark)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-md) var(--spacing-lg)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
          }}
        >
          <Icons.Plus size={20} />
          Create Event
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
        }}
      >
        {events.map((event) => {
          const progress = Math.round((event.participants / event.maxParticipants) * 100);

          return (
            <div key={event.id} style={CARD_STYLE}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: 'var(--spacing-md)',
                  gap: '12px',
                }}
              >
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{event.title}</h3>
                <span
                  style={{
                    background:
                      event.status === 'active'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : event.status === 'upcoming'
                          ? 'rgba(6, 182, 212, 0.2)'
                          : 'rgba(107, 114, 128, 0.2)',
                    color:
                      event.status === 'active'
                        ? 'var(--accent-green)'
                        : event.status === 'upcoming'
                          ? 'var(--accent-cyan)'
                          : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {event.status === 'active' && <Icons.PlayCircle size={12} />}
                  {event.status === 'upcoming' && <Icons.Clock size={12} />}
                  {event.status === 'completed' && <Icons.CheckCircle size={12} />}
                  {event.status}
                </span>
              </div>

              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: 'var(--spacing-sm)',
                  }}
                >
                  <Icons.Calendar size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Starts: {event.startDate}
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  <Icons.Users size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  {event.participants}/{event.maxParticipants} participants
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(15, 20, 25, 0.6)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-md)',
                  marginBottom: 'var(--spacing-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Registration Progress
                  </p>
                  <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {progress}%
                  </p>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    background: 'rgba(6, 182, 212, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                <button
                  style={{
                    ...BUTTON_STYLE,
                    background: 'transparent',
                    border: '1px solid var(--accent-cyan)',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  <Icons.BarChart size={14} /> Scores
                </button>

                <button
                  style={{
                    ...BUTTON_STYLE,
                    background: 'transparent',
                    border: '1px solid var(--accent-green)',
                    color: 'var(--accent-green)',
                  }}
                >
                  <Icons.Download size={14} /> Cert
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AutoCriteriaGenerator />
    </div>
  );
}

export function JudgeDashboard() {
  const [assignedEvents] = useState([
    {
      id: 1,
      title: 'National Coding Challenge',
      status: 'completed',
      participants: 12,
      submitted: 12,
      remaining: 0,
      completedDate: '2025-06-03',
    },
    {
      id: 2,
      title: 'Inter-School Debate Cup',
      status: 'active',
      participants: 6,
      submitted: 4,
      remaining: 2,
      completedDate: '2025-04-12',
    },
  ]);

  const [certificate, setCertificate] = useState({
    isOpen: false,
    role: 'judge',
    recipientName: 'Judge User',
    eventName: '',
    date: '',
  });

  const openCertificate = (event) => {
    setCertificate({
      isOpen: true,
      role: 'judge',
      recipientName: 'Judge User',
      eventName: event.title,
      date: event.completedDate || event.startDate || new Date().toISOString(),
    });
  };

  const closeCertificate = () => {
    setCertificate((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div style={{ padding: 'var(--spacing-xl)', background: 'var(--bg-primary)' }}>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 700,
            marginBottom: 'var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
          }}
        >
          <Icons.Award size={32} color="var(--accent-cyan)" />
          Scoring Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Review and submit scores for assigned events</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
        }}
      >
        {assignedEvents.map((event) => {
          const progress = Math.round((event.submitted / event.participants) * 100);

          return (
            <div
              key={event.id}
              style={{
                ...CARD_STYLE,
                background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(0,132,255,0.05))',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: 'var(--spacing-md)',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                    {event.title}
                  </h3>
                  <span
                    style={{
                      background:
                        event.status === 'active'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : 'rgba(6, 182, 212, 0.2)',
                      color: event.status === 'active' ? 'var(--accent-green)' : 'var(--accent-cyan)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {event.status}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(15, 20, 25, 0.6)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-md)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-md)' }}>
                  <div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                      Total Participants
                    </p>
                    <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      {event.participants}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                      Scores Submitted
                    </p>
                    <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--accent-green)' }}>
                      {event.submitted}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                      Remaining
                    </p>
                    <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--accent-yellow)' }}>
                      {event.remaining}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 'var(--spacing-md)',
                    width: '100%',
                    height: '6px',
                    background: 'rgba(6, 182, 212, 0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--accent-green), var(--accent-cyan))',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                <button
                  style={{
                    ...BUTTON_STYLE,
                    background: 'transparent',
                    border: '1px solid var(--accent-cyan)',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  <Icons.FileText size={14} /> Open Scorecard
                </button>
                <button
                  style={{
                    ...BUTTON_STYLE,
                    background: 'transparent',
                    border: '1px solid var(--accent-blue)',
                    color: 'var(--accent-blue)',
                  }}
                  onClick={() => openCertificate(event)}
                >
                  <Icons.Download size={14} /> Cert
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <CertificateModal
        isOpen={certificate.isOpen}
        onClose={closeCertificate}
        role={certificate.role}
        recipientName={certificate.recipientName}
        eventName={certificate.eventName}
        date={certificate.date}
      />
    </div>
  );
}

export function ParticipantDashboard() {
  const [myEvents] = useState([
    {
      id: 1,
      title: 'National Coding Challenge',
      status: 'active',
      score: 95,
      rank: 5,
      totalParticipants: 128,
      certificateReady: true,
      completedDate: '2025-06-03',
    },
    {
      id: 2,
      title: 'City Basketball Tournament',
      status: 'upcoming',
      score: null,
      rank: null,
      totalParticipants: 64,
      certificateReady: false,
      completedDate: '2025-07-20',
    },
  ]);

  const [certificate, setCertificate] = useState({
    isOpen: false,
    role: 'participant',
    recipientName: 'Participant User',
    eventName: '',
    date: '',
  });

  const openCertificate = (event) => {
    if (!event.certificateReady) return;
    setCertificate({
      isOpen: true,
      role: 'participant',
      recipientName: 'Participant User',
      eventName: event.title,
      date: event.completedDate || new Date().toISOString(),
    });
  };

  const closeCertificate = () => {
    setCertificate((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div style={{ padding: 'var(--spacing-xl)', background: 'var(--bg-primary)' }}>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 700,
            marginBottom: 'var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
          }}
        >
          <Icons.Trophy size={32} color="var(--accent-cyan)" />
          My Competitions
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>View your registered events and standings</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
        }}
      >
        {myEvents.map((event) => {
          const hasScore = event.score !== null;

          return (
            <div key={event.id} style={CARD_STYLE}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: 'var(--spacing-md)',
                  gap: '12px',
                }}
              >
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{event.title}</h3>
                <span
                  style={{
                    background:
                      event.status === 'active'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(6, 182, 212, 0.2)',
                    color: event.status === 'active' ? 'var(--accent-green)' : 'var(--accent-cyan)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {event.status}
                </span>
              </div>

              {hasScore ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1))',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-md)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>
                        Your Score
                      </p>
                      <p style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                        {event.score}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>
                        Your Rank
                      </p>
                      <p style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 700, color: 'var(--accent-green)' }}>
                        #{event.rank}
                      </p>
                    </div>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-md)' }}>
                    Out of {event.totalParticipants} total participants
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(6, 182, 212, 0.05)',
                    border: '1px dashed var(--accent-cyan)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-md)',
                    textAlign: 'center',
                  }}
                >
                  <Icons.Clock
                    size={24}
                    color="var(--accent-cyan)"
                    style={{ margin: '0 auto', marginBottom: '8px' }}
                  />
                  <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Event starts soon. Scores will appear here.
                  </p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                <button
                  style={{
                    ...BUTTON_STYLE,
                    background: 'transparent',
                    border: '1px solid var(--accent-cyan)',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  <Icons.Trophy size={14} /> Leaderboard
                </button>
                <button
                  style={{
                    ...BUTTON_STYLE,
                    background: event.certificateReady ? 'transparent' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${event.certificateReady ? 'var(--accent-green)' : 'var(--border-color)'}`,
                    color: event.certificateReady ? 'var(--accent-green)' : 'var(--text-secondary)',
                    cursor: event.certificateReady ? 'pointer' : 'not-allowed',
                    opacity: event.certificateReady ? 1 : 0.7,
                  }}
                  onClick={() => openCertificate(event)}
                  disabled={!event.certificateReady}
                >
                  <Icons.Download size={14} /> Certificate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <CertificateModal
        isOpen={certificate.isOpen}
        onClose={closeCertificate}
        role={certificate.role}
        recipientName={certificate.recipientName}
        eventName={certificate.eventName}
        date={certificate.date}
      />
    </div>
  );
}

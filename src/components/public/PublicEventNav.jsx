import { Link } from 'react-router-dom';

const THEMES = {
  light: {
    header: { background: 'rgba(255,255,255,0.94)', borderBottom: '1px solid #dbeafe', backdropFilter: 'blur(16px)' },
    brandText: '#0f172a',
    tabInactive: { color: '#64748b', background: 'transparent', border: '1px solid transparent' },
    tabActive: { color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe' },
    signIn: { color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe' },
    register: { color: '#fff', background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', border: 'none' },
  },
  dark: {
    header: { background: 'rgba(15,20,25,0.95)', borderBottom: '1px solid rgba(6,182,212,0.15)' },
    brandText: '#f8fbff',
    tabInactive: { color: '#a0aec0', background: 'transparent', border: '1px solid transparent' },
    tabActive: { color: '#67e8f9', background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)' },
    signIn: { color: '#67e8f9', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.3)' },
    register: { color: '#000', background: 'linear-gradient(135deg,#06b6d4,#0084ff)', border: 'none' },
  },
};

export default function PublicEventNav({
  eventId,
  eventTitle,
  activeTab, // 'preview' | 'leaderboard' | 'brackets'
  showBrackets = false,
  showRegister = false,
  theme = 'light',
  fixed = false,
}) {
  const t = THEMES[theme] || THEMES.light;

  const tabs = [
    { key: 'preview', label: 'Event Preview', icon: 'bi-eye', to: `/events/${eventId}` },
    { key: 'leaderboard', label: 'Leaderboard', icon: 'bi-bar-chart-line', to: `/events/${eventId}/leaderboard` },
    ...(showBrackets ? [{ key: 'brackets', label: 'Brackets', icon: 'bi-diagram-3', to: `/events/${eventId}/brackets` }] : []),
  ];

  return (
    <header
      style={{
        height: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        gap: 16,
        flexWrap: 'wrap',
        position: fixed ? 'fixed' : 'sticky',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        ...t.header,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, minWidth: 0 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>F</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: t.brandText }}>FairPlay</span>
        </Link>

        {eventTitle && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: t.brandText, opacity: 0.55, fontSize: 13, fontWeight: 700 }}>
            <i className="bi bi-chevron-right" style={{ fontSize: 11 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{eventTitle}</span>
          </span>
        )}
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 10, fontWeight: 800, fontSize: 13, textDecoration: 'none',
              ...(activeTab === tab.key ? t.tabActive : t.tabInactive),
            }}
          >
            <i className={`bi ${tab.icon}`} />
            {tab.label}
          </Link>
        ))}

        <Link to="/#features" style={{ padding: '9px 14px', borderRadius: 10, fontWeight: 800, fontSize: 13, textDecoration: 'none', ...t.tabInactive }}>
          <i className="bi bi-collection" /> All Events
        </Link>

        {showRegister && (
          <Link
            to={`/participant/register?eventId=${eventId}`}
            style={{ padding: '9px 16px', borderRadius: 10, fontWeight: 900, fontSize: 13, textDecoration: 'none', ...t.register }}
          >
            <i className="bi bi-person-plus" /> Register
          </Link>
        )}

        <Link to="/?modal=login" style={{ padding: '9px 16px', borderRadius: 10, fontWeight: 800, fontSize: 13, textDecoration: 'none', ...t.signIn }}>
          Sign In
        </Link>
      </nav>
    </header>
  );
}

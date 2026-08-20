import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import useAuthStore from '../../store/authStore';

const SIDEBAR_WIDTH = 250;
const RAIL_WIDTH = 76;

const NAV_GROUPS = {
  admin: {
    label: 'Super Admin',
    icon: 'bi bi-shield-lock',
    groups: [
      {
        label: 'Dashboard',
        icon: 'bi bi-grid',
        items: [{ label: 'Overview', path: '/admin', icon: 'bi bi-grid' }],
      },
      {
        label: 'Users',
        icon: 'bi bi-people',
        items: [
          { label: 'User Management', path: '/admin/users', icon: 'bi bi-people' },
          { label: 'Approval Board', path: '/admin/roles', icon: 'bi bi-diagram-3' },
        ],
      },
      {
        label: 'Platform',
        icon: 'bi bi-sliders',
        items: [
          { label: 'System Analytics', path: '/admin/analytics', icon: 'bi bi-graph-up' },
          { label: 'Activity Log', path: '/admin/audit', icon: 'bi bi-journal-text' },
          { label: 'Platform Settings', path: '/admin/settings', icon: 'bi bi-gear' },
          { label: 'Backup and Restore', path: '/admin/backup', icon: 'bi bi-database' },
        ],
      },
      {
        label: 'Reports',
        icon: 'bi bi-file-earmark-bar-graph',
        items: [
          { label: 'AI Usage Monitoring', path: '/admin/ai-monitor', icon: 'bi bi-cpu' },
          { label: 'Reports', path: '/admin/reports', icon: 'bi bi-file-earmark-text' },
        ],
      },
    ],
  },
  organizer: {
    label: 'Event Organizer',
    icon: 'bi bi-kanban',
    groups: [
      {
        label: 'Dashboard',
        icon: 'bi bi-grid',
        items: [{ label: 'Overview', path: '/organizer', icon: 'bi bi-grid' }],
      },
      {
        label: 'Events',
        icon: 'bi bi-calendar-event',
        items: [
          { label: 'Create Event', path: '/organizer/create-event', icon: 'bi bi-plus-circle' },
          { label: 'My Events', path: '/organizer/events', icon: 'bi bi-calendar-event' },
          { label: 'Venues', path: '/organizer/venues', icon: 'bi bi-geo-alt' },
        ],
      },
      {
        label: 'People and Access',
        icon: 'bi bi-person-badge',
        items: [
          { label: 'Contestants', path: '/organizer/contestants', icon: 'bi bi-people' },
          { label: 'Judges', path: '/organizer/judges', icon: 'bi bi-person-workspace' },
        ],
      },
      {
        label: 'Scoring',
        icon: 'bi bi-bar-chart-line',
        items: [
          { label: 'Live Scoring', path: '/organizer/scoring', icon: 'bi bi-bar-chart-line' },
          { label: 'Schedule', path: '/organizer/schedule', icon: 'bi bi-calendar-week' },
          { label: 'Brackets', path: '/organizer/brackets', icon: 'bi bi-diagram-3' },
          { label: 'Reports', path: '/organizer/reports', icon: 'bi bi-file-earmark-text' },
          { label: 'Certificates', path: '/organizer/certificates', icon: 'bi bi-award' },
        ],
      },
      {
        label: 'Settings',
        icon: 'bi bi-gear',
        items: [{ label: 'Settings', path: '/organizer/settings', icon: 'bi bi-gear' }],
      },
    ],
  },
  judge: {
    label: 'Judge',
    icon: 'bi bi-person-check',
    groups: [
      {
        label: 'Dashboard',
        icon: 'bi bi-grid',
        items: [{ label: 'Overview', path: '/judge', icon: 'bi bi-grid' }],
      },
      {
        label: 'Judging',
        icon: 'bi bi-pencil-square',
        items: [
          { label: 'Assigned Events', path: '/judge/events', icon: 'bi bi-calendar-event' },
          { label: 'Score Entry', path: '/judge/scoring', icon: 'bi bi-pencil-square' },
          { label: 'Score Review', path: '/judge/review', icon: 'bi bi-search' },
          { label: 'Submission History', path: '/judge/history', icon: 'bi bi-clock-history' },
        ],
      },
      {
        label: 'Settings',
        icon: 'bi bi-gear',
        items: [{ label: 'Settings', path: '/judge/settings', icon: 'bi bi-gear' }],
      },
    ],
  },
  participant: {
    label: 'Participant',
    icon: 'bi bi-person',
    groups: [
      {
        label: 'Dashboard',
        icon: 'bi bi-grid',
        items: [{ label: 'Overview', path: '/participant', icon: 'bi bi-grid' }],
      },
      {
        label: 'Events',
        icon: 'bi bi-journal-plus',
        items: [
          { label: 'Event Registration', path: '/participant/events', icon: 'bi bi-journal-plus' },
          { label: 'Schedule', path: '/participant/schedule', icon: 'bi bi-calendar-week' },
          { label: 'Scores and Results', path: '/participant/scores', icon: 'bi bi-trophy' },
          { label: 'Announcements', path: '/participant/announcements', icon: 'bi bi-megaphone' },
        ],
      },
      {
        label: 'Profile',
        icon: 'bi bi-person',
        items: [{ label: 'Profile', path: '/participant/profile', icon: 'bi bi-person' }],
      },
    ],
  },
  'institute-coordinator': {
    label: 'Institute Coordinator',
    icon: 'bi bi-building',
    groups: [
      {
        label: 'Approvals',
        icon: 'bi bi-diagram-3',
        items: [
          { label: 'Approval Dashboard', path: '/institute-coordinator', icon: 'bi bi-grid' },
        ],
      },
    ],
  },
  'sports-head': {
    label: 'Sports Head',
    icon: 'bi bi-trophy',
    groups: [
      {
        label: 'Approvals',
        icon: 'bi bi-diagram-3',
        items: [
          { label: 'Approval Dashboard', path: '/sports-head', icon: 'bi bi-grid' },
        ],
      },
    ],
  },
  osds: {
    label: 'OSDS',
    icon: 'bi bi-briefcase',
    groups: [
      {
        label: 'Approvals',
        icon: 'bi bi-diagram-3',
        items: [
          { label: 'Approval Dashboard', path: '/osds', icon: 'bi bi-grid' },
        ],
      },
    ],
  },
};

const EXACT_PATHS = new Set([
  '/admin',
  '/organizer',
  '/judge',
  '/participant',
  '/institute-coordinator',
  '/sports-head',
  '/osds',
]);

function groupIsActive(group, pathname) {
  return group.items.some((item) => {
    if (EXACT_PATHS.has(item.path)) return pathname === item.path;
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  });
}

function NavItem({ item, compact = false }) {
  const isExact = EXACT_PATHS.has(item.path);

  return (
    <NavLink
      to={item.path}
      end={isExact}
      title={compact ? item.label : undefined}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: compact ? 0 : 3 }}
          style={{
            height: 38,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: compact ? 'center' : 'flex-start',
            gap: 10,
            padding: compact ? 0 : '0 12px',
            color: isActive ? '#0f172a' : '#374151',
            background: isActive ? 'rgba(15,23,42,0.06)' : 'transparent',
            boxShadow: isActive ? 'inset 3px 0 0 #0f172a' : 'none',
            fontSize: 13,
            fontWeight: isActive ? 700 : 500,
          }}
        >
          <i className={item.icon} style={{ fontSize: 15, width: compact ? 'auto' : 18, textAlign: 'center' }} />
          {!compact && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
        </motion.div>
      )}
    </NavLink>
  );
}

export default function Sidebar({ isOpen, isMobile, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userRole } = useAuthStore();
  const role = user?.role || userRole || 'participant';
  const menu = NAV_GROUPS[role] || NAV_GROUPS.participant;
  const mobile = typeof isMobile === 'boolean' ? isMobile : typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
  const expanded = isOpen;
  const visible = !mobile || expanded;
  const [openGroups, setOpenGroups] = useState({});
  const [hoveredGroup, setHoveredGroup] = useState(null);

  const groups = useMemo(
    () => menu.groups.map((group) => ({ ...group, active: groupIsActive(group, location.pathname) })),
    [location.pathname, menu.groups]
  );

  const avatarLetter = String(user?.avatar || user?.name || menu.label || 'U').charAt(0).toUpperCase();
  const sidebarWidth = expanded ? SIDEBAR_WIDTH : RAIL_WIDTH;

  return (
    <>
      {expanded && mobile && (
        <div
          onClick={onToggle}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.15)',
            zIndex: 1090,
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      <motion.aside
        initial={false}
        animate={{
          width: sidebarWidth,
          x: visible ? 0 : -SIDEBAR_WIDTH,
        }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          height: '100vh',
          padding: expanded ? 12 : '12px 9px',
          background: '#ffffff',
          borderRight: '1px solid #dbe3f0',
          boxShadow: '18px 0 50px rgba(0,0,0,0.08)',
          overflow: 'visible',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            height: expanded ? 62 : 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            gap: 12,
            padding: expanded ? '0 4px 0 10px' : 0,
            color: '#0f172a',
          }}
        >
          {expanded ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <img src="/icon.svg" alt="" style={{ width: 34, height: 34 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0 }}>{menu.label}</div>
                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{user?.name || 'Workspace'}</div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-label="Toggle sidebar"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#374151',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 18,
              flex: '0 0 auto',
            }}
          >
            <i className="bi bi-list" />
          </button>
          {!expanded && (
            <img
              src="/icon.svg"
              alt=""
              style={{
                position: 'absolute',
                top: 64,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 30,
                height: 30,
              }}
            />
          )}
        </div>

        <nav style={{ flex: 1, overflowY: expanded ? 'auto' : 'visible', overflowX: 'visible', paddingTop: expanded ? 10 : 52 }}>
          {groups.map((group) => {
            const groupOpen = expanded && (openGroups[group.label] ?? group.active);
            const singleItem = group.items.length === 1;
            const showFlyout = !expanded && hoveredGroup === group.label;

            if (singleItem) {
              return (
                <div key={group.label} style={{ marginBottom: 6 }}>
                  <NavItem item={{ ...group.items[0], label: group.label, icon: group.icon }} compact={!expanded} />
                </div>
              );
            }

            return (
              <div
                key={group.label}
                onMouseEnter={() => setHoveredGroup(group.label)}
                onMouseLeave={() => setHoveredGroup(null)}
                style={{ position: 'relative', marginBottom: 6 }}
              >
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !groupOpen }))}
                  title={!expanded ? group.label : undefined}
                  style={{
                    width: '100%',
                    height: 42,
                    border: 'none',
                    borderRadius: 12,
                    padding: expanded ? '0 12px' : 0,
                    background: group.active ? 'rgba(15,23,42,0.06)' : 'transparent',
                    color: group.active ? '#0f172a' : '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: expanded ? 'flex-start' : 'center',
                    gap: 12,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 750,
                  }}
                >
                  <i className={group.icon} style={{ fontSize: 16, width: expanded ? 18 : 'auto', textAlign: 'center' }} />
                  {expanded && (
                    <>
                      <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{group.label}</span>
                      <i className={`bi ${groupOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 12, color: '#6b7280' }} />
                    </>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {groupOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ display: 'grid', gap: 2, padding: '4px 0 8px 22px' }}>
                        {group.items.map((item) => (
                          <NavItem key={item.path} item={item} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showFlyout && (
                    <motion.div
                      initial={{ opacity: 0, x: -8, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -8, scale: 0.98 }}
                      transition={{ duration: 0.14 }}
                      style={{
                        position: 'absolute',
                        left: RAIL_WIDTH - 4,
                        top: 0,
                        width: 210,
                        padding: 10,
                        borderRadius: 12,
                        background: '#ffffff',
                        border: '1px solid #dbe3f0',
                        boxShadow: '0 18px 55px rgba(59,130,246,0.14)',
                        zIndex: 1300,
                      }}
                    >
                      <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 14, padding: '4px 8px 8px' }}>{group.label}</div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        {group.items.map((item) => (
                          <NavItem key={item.path} item={item} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: '#f1f5f9',
                color: '#0f172a',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
              }}
            >
              {avatarLetter}
            </span>
            {expanded && (
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || 'User'}
                </div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>{menu.label}</div>
              </div>
            )}
          </div>

          {expanded && (
            <button
              type="button"
              onClick={async () => {
                await useAuthStore.getState().logout();
                navigate('/');
              }}
              title="Sign Out"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                color: '#ef4444',
                textDecoration: 'none',
                background: 'rgba(239,68,68,0.08)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <i className="bi bi-box-arrow-right" />
            </button>
          )}
        </div>
      </motion.aside>
    </>
  );
}

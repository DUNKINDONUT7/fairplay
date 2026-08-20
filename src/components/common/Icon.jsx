import React from 'react';
import './Icon.css';

const SVG_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
};

const ICONS = {
  brand: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
    </svg>
  ),
  dashboard: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  analytics: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <polyline points="3 17 9 11 13 15 21 7" />
      <path d="M21 17H3" />
    </svg>
  ),
  users: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  calendar: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 11h18" />
    </svg>
  ),
  judges: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M6 3h12" />
      <path d="M12 3v6" />
      <path d="M6 9l3 7" />
      <path d="M18 9l-3 7" />
      <path d="M9 16h6" />
    </svg>
  ),
  reports: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  ),
  settings: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 8.6 15a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 15 8.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9z" />
    </svg>
  ),
  create: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  ),
  user: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  trophy: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M8 7V4h8v3" />
      <path d="M6 7h12v5a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V7z" />
      <path d="M9 19h6" />
      <path d="M12 14v5" />
    </svg>
  ),
  chart: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M3 17h18" />
      <path d="M6 13v4" />
      <path d="M12 9v8" />
      <path d="M18 5v12" />
    </svg>
  ),
  menu: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  ),
  default: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  ),
  brain: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M6 12a6 6 0 0 1 12 0" />
      <path d="M9 7h6" />
      <path d="M9 17h6" />
    </svg>
  ),
  gamepad: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <rect x="4" y="7" width="16" height="10" rx="3" />
      <circle cx="8.5" cy="11" r="1" />
      <circle cx="15.5" cy="11" r="1" />
      <path d="M12 14v2" />
      <path d="M14.5 15.5h-5" />
    </svg>
  ),
  star: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M12 3l2.6 7.4H22l-5.8 4.3L17.8 21 12 16.6 6.2 21l1.6-6.3L2 10.4h7.4z" />
    </svg>
  ),
  globe: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a18 18 0 0 1 0 18" />
      <path d="M7 5a15 15 0 0 0 10 14" />
    </svg>
  ),
  lock: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  mobile: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="18" r="1" />
    </svg>
  ),
  info: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M12 12v4" />
    </svg>
  ),
  warning: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  success: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  error: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </svg>
  ),
  close: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  ),
  bell: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  speech: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M4 4h16v12H9l-5 5V4z" />
    </svg>
  ),
  globe: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a18 18 0 0 1 0 18" />
      <path d="M7 5a15 15 0 0 0 10 14" />
    </svg>
  ),
  medal: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="9" r="5" />
      <path d="M8 14l-4 7h7l1-4 1 4h7l-4-7" />
    </svg>
  ),
  checklist: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M4 12l4 4 8-8" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
    </svg>
  ),
  clipboard: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M9 2h6a2 2 0 0 1 2 2v2H7V4a2 2 0 0 1 2-2z" />
      <rect x="5" y="6" width="14" height="16" rx="2" />
    </svg>
  ),
  clock: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  trophyFilled: (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M8 7V4h8v3" />
      <path d="M6 7h12v5a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V7z" />
      <path d="M9 19h6" />
      <path d="M12 14v5" />
    </svg>
  )
};

const ALIASES = {
  '⚡': 'brand',
  '📊': 'dashboard',
  '📈': 'analytics',
  '👥': 'users',
  '🎯': 'calendar',
  '⚖️': 'judges',
  '📋': 'reports',
  '⚙️': 'settings',
  '✨': 'create',
  '👤': 'user',
  '🏆': 'trophy',
  '📄': 'reports',
  '📝': 'clipboard',
  '⏰': 'clock',
  '📱': 'mobile',
  '🔔': 'bell',
  '⚠': 'warning',
  'ℹ': 'info',
  '✓': 'success',
  '✕': 'error',
  '📅': 'calendar',
  '🧠': 'brain',
  '🎮': 'gamepad',
  '🎨': 'star',
  '🏅': 'medal',
  '🔐': 'lock',
  '🎛️': 'settings',
  '🌏': 'globe'
};

export const renderIcon = (icon, className = '') => {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;

  const key = ALIASES[icon] || icon;
  const svg = ICONS[key] || ICONS.default || null;

  return (
    <span className={`fp-icon ${className}`.trim()} aria-hidden="true">
      {svg}
    </span>
  );
};

const Icon = ({ name, className = '' }) => renderIcon(name, className);

export default Icon;

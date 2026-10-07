import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A searchable replacement for the plain event <select>. A dropdown only
// shows titles in whatever order they arrive; with dozens of events that is a
// long scroll through look-alike names. This one can be searched, narrowed by
// status, and shows each event's type, date and status so the right one is
// recognisable at a glance.

const STATUS_TONES = {
  completed: { color: '#047857', background: '#ecfdf5' },
  active: { color: '#1d4ed8', background: '#eff6ff' },
  approved: { color: '#1d4ed8', background: '#eff6ff' },
  published: { color: '#1d4ed8', background: '#eff6ff' },
  upcoming: { color: '#1d4ed8', background: '#eff6ff' },
  pending: { color: '#b45309', background: '#fffbeb' },
  rejected: { color: '#b91c1c', background: '#fef2f2' },
};
const DEFAULT_TONE = { color: '#475569', background: '#f1f5f9' };

const label = (value) => String(value || '').replace(/[-_]/g, ' ');

function eventDate(event) {
  const raw = event.startDate || event.start_date || event.scheduledDate || null;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set';
}

export default function EventPicker({
  events = [],
  value = '',
  onChange,
  placeholder = 'Select an event',
  // When set, the list starts with a "show everything" choice.
  allLabel = '',
  allValue = '',
  ariaLabel = 'Event',
  style,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const sorted = useMemo(
    // Newest first: the event someone is working on is almost always recent.
    () => [...events].sort((left, right) => (eventDate(right)?.getTime() || 0) - (eventDate(left)?.getTime() || 0)),
    [events]
  );
  const statuses = useMemo(
    () => Array.from(new Set(sorted.map((event) => String(event.status || 'draft')))),
    [sorted]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sorted.filter((event) => {
      if (status !== 'all' && String(event.status || 'draft') !== status) return false;
      if (!term) return true;
      return [event.title, event.eventType || event.type, event.status, event.location]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [query, sorted, status]);

  // The rows the keyboard moves through: the optional "all" row, then events.
  const showAllRow = Boolean(allLabel) && !query.trim() && status === 'all';
  const rows = useMemo(
    () => [...(showAllRow ? [{ id: allValue, isAll: true }] : []), ...filtered],
    [allValue, filtered, showAllRow]
  );

  const selected = events.find((event) => String(event.id) === String(value)) || null;
  const showingAll = Boolean(allLabel) && String(value) === String(allValue);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const inTrigger = rootRef.current?.contains(event.target);
      const inPopover = popoverRef.current?.contains(event.target);
      if (!inTrigger && !inPopover) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // The list is drawn on top of the whole page (a portal with fixed
  // positioning) rather than inside the picker, so a card with clipped
  // corners or its own scrolling can never cut it off. It follows the button
  // when the page scrolls or resizes, and opens upward when there is no room
  // below.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(Math.max(box.width, 340), window.innerWidth - 16, 440);
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
      const roomBelow = window.innerHeight - box.bottom;
      const openUp = roomBelow < 320 && box.top > roomBelow;
      setAnchor({
        left,
        width,
        ...(openUp ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }),
        maxListHeight: Math.max(140, Math.min(300, (openUp ? box.top : roomBelow) - 150)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    setQuery('');
    setStatus('all');
  }, [open]);

  // The list only exists once it has been positioned, so focus waits for that.
  const placed = Boolean(anchor);
  useEffect(() => {
    if (open && placed) searchRef.current?.focus();
  }, [open, placed]);

  useEffect(() => {
    // Start on the current choice, or the top of the list after a new search.
    const current = rows.findIndex((row) => String(row.id) === String(value));
    setActiveIndex(current >= 0 && !query && status === 'all' ? current : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, status]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (row) => {
    onChange?.(String(row.id));
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (rows[activeIndex]) choose(rows[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} data-tour="event-picker" style={{ position: 'relative', minWidth: 0, width: 320, maxWidth: '100%', ...style }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{ ...triggerStyle, borderColor: open ? '#60a5fa' : '#bfdbfe', boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : triggerStyle.boxShadow }}
      >
        <i className="bi bi-calendar-event" style={{ color: '#64748b', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected || showingAll ? 700 : 500, color: selected || showingAll ? '#0f172a' : '#64748b' }}>
            {selected ? selected.title : showingAll ? allLabel : placeholder}
          </span>
        </span>
        <i className={open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'} style={{ color: '#64748b', fontSize: 12, flexShrink: 0 }} />
      </button>

      {open && anchor && createPortal((
        <div
          ref={popoverRef}
          style={{ ...popoverStyle, left: anchor.left, width: anchor.width, top: anchor.top, bottom: anchor.bottom }}
          onKeyDown={onKeyDown}
        >
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ position: 'relative' }}>
              <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events by name, type or venue"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                style={searchStyle}
              />
            </div>
            {statuses.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {['all', ...statuses].map((entry) => {
                  const active = status === entry;
                  return (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setStatus(entry)}
                      aria-pressed={active}
                      style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer', border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569' }}
                    >
                      {entry === 'all' ? `All (${sorted.length})` : label(entry)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} style={{ maxHeight: anchor.maxListHeight, overflowY: 'auto', padding: 6 }}>
            {rows.length === 0 ? (
              <div style={{ padding: '22px 12px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                {events.length === 0 ? 'No events yet.' : 'No events match. Try a different search.'}
              </div>
            ) : rows.map((row, index) => {
              const isSelected = String(row.id) === String(value);
              const isActive = index === activeIndex;
              const date = row.isAll ? null : eventDate(row);
              const tone = row.isAll ? DEFAULT_TONE : STATUS_TONES[row.status] || DEFAULT_TONE;
              return (
                <button
                  key={row.isAll ? '__all' : row.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  onClick={() => choose(row)}
                  onMouseEnter={() => setActiveIndex(index)}
                  style={{ ...rowStyle, background: isActive ? '#f1f5f9' : 'transparent' }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#0f172a', overflowWrap: 'anywhere' }}>
                      {row.isAll ? allLabel : row.title}
                    </span>
                    {!row.isAll && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3, fontSize: 12, color: '#64748b' }}>
                        <span style={{ textTransform: 'capitalize' }}>{label(row.eventType || row.type || 'event')}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(date)}</span>
                        <span style={{ padding: '1px 8px', borderRadius: 999, fontWeight: 700, textTransform: 'capitalize', ...tone }}>{label(row.status || 'draft')}</span>
                      </span>
                    )}
                  </span>
                  {isSelected && <i className="bi bi-check-lg" style={{ color: '#2563eb', fontSize: 16, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {events.length > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8' }}>
              {filtered.length} of {events.length} event{events.length === 1 ? '' : 's'} · newest first
            </div>
          )}
        </div>
      ), document.body)}
    </div>
  );
}

const triggerStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#ffffff',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 6px 18px rgba(37, 99, 235, 0.06)',
  boxSizing: 'border-box',
};

const popoverStyle = {
  position: 'fixed',
  zIndex: 4000,
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 14,
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
  overflow: 'hidden',
};

const searchStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px 9px 34px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  fontSize: 13,
  fontFamily: 'inherit',
  color: '#0f172a',
  outline: 'none',
};

const rowStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 10px',
  border: 'none',
  borderRadius: 10,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

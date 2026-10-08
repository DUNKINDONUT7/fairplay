import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import useAuthStore from '../../store/authStore';
import useParticipantTourStore from '../../store/participantTourStore';
import { TOUR_CHAPTERS, buildTourSteps } from './participantTourSteps';

const CARD_WIDTH = 380;
const GAP = 16;
const EDGE = 12;

// Where the highlighted element is on screen, trimmed to what is visible.
function measure(selector) {
  const element = selector ? document.querySelector(selector) : null;
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (box.width < 4 || box.height < 4) return null;
  const top = Math.max(box.top, EDGE);
  const left = Math.max(box.left, EDGE);
  const right = Math.min(box.right, window.innerWidth - EDGE);
  const bottom = Math.min(box.bottom, window.innerHeight - EDGE);
  if (right - left < 24 || bottom - top < 24) return null;
  return { top, left, width: right - left, height: bottom - top };
}

// Put the card beside the highlight, on whichever side has room. A highlight
// that fills most of the screen (a whole page) gets the card in its corner.
function placeCard(rect, cardHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - EDGE * 2);
  const clampX = (x) => Math.max(EDGE, Math.min(x, vw - width - EDGE));
  const clampY = (y) => Math.max(EDGE, Math.min(y, vh - cardHeight - EDGE));
  if (!rect) return { left: (vw - width) / 2, top: Math.max(EDGE, (vh - cardHeight) / 2), width, centered: true };

  const room = {
    right: vw - (rect.left + rect.width),
    left: rect.left,
    bottom: vh - (rect.top + rect.height),
    top: rect.top,
  };
  if (room.right >= width + GAP + EDGE) return { left: rect.left + rect.width + GAP, top: clampY(rect.top), width };
  if (room.left >= width + GAP + EDGE) return { left: rect.left - width - GAP, top: clampY(rect.top), width };
  if (room.bottom >= cardHeight + GAP + EDGE) return { left: clampX(rect.left), top: rect.top + rect.height + GAP, width };
  if (room.top >= cardHeight + GAP + EDGE) return { left: clampX(rect.left), top: rect.top - cardHeight - GAP, width };
  return { left: vw - width - EDGE * 2, top: vh - cardHeight - EDGE * 2, width, inside: true };
}

export default function ParticipantTour() {
  const { active, index, stop, goTo } = useParticipantTourStore();
  const role = useAuthStore((state) => state.user?.role);
  const navigate = useNavigate();
  const location = useLocation();
  const cardRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [searching, setSearching] = useState(false);
  const [cardHeight, setCardHeight] = useState(320);

  const steps = useMemo(() => buildTourSteps(), []);

  const running = active && role === 'participant';
  const step = running ? steps[Math.min(index, steps.length - 1)] : null;
  const isFirst = index === 0;
  const isLast = index >= steps.length - 1;

  // The tour belongs to the participant's own pages.
  useEffect(() => {
    if (active && role && role !== 'participant') stop();
  }, [active, role, stop]);

  // Open the step's page, then find and follow its element.
  useEffect(() => {
    if (!step) return undefined;
    if (step.route && location.pathname !== step.route) {
      setRect(null);
      setSearching(true);
      navigate(step.route);
      return undefined;
    }
    if (!step.target) {
      setRect(null);
      setSearching(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return undefined;
    }

    let cancelled = false;
    let scrolled = false;
    const startedAt = Date.now();
    setSearching(true);

    const update = () => {
      if (cancelled) return;
      const element = document.querySelector(step.target);
      if (element && !scrolled) {
        scrolled = true;
        // A whole page is shown from its top; anything smaller is centred.
        if (element.getBoundingClientRect().height > window.innerHeight * 0.7) window.scrollTo({ top: 0 });
        else element.scrollIntoView({ block: 'center' });
      }
      const next = measure(step.target);
      if (next) {
        setRect((current) => (current && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next));
        setSearching(false);
      } else if (Date.now() - startedAt > 2500) {
        // Not on this screen (for example the menu on a phone): centre the card instead.
        setRect(null);
        setSearching(false);
      }
    };

    update();
    // Pages load and animate in, so keep following the element.
    const timer = window.setInterval(update, 200);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, location.pathname, navigate]);

  const next = useCallback(() => { if (!isLast) goTo(index + 1); }, [goTo, index, isLast]);
  const back = useCallback(() => { if (!isFirst) goTo(index - 1); }, [goTo, index, isFirst]);

  useEffect(() => {
    if (!running) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') stop();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, stop, next, back]);

  useEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, rect, searching]);

  // Keyboard users start on the card, not behind the overlay.
  useEffect(() => {
    if (running && !searching) cardRef.current?.focus({ preventScroll: true });
  }, [running, index, searching]);

  if (!running || !step) return null;

  const chapterIndex = TOUR_CHAPTERS.findIndex((chapter) => chapter.key === step.chapter);
  const chapter = TOUR_CHAPTERS[chapterIndex];
  const percent = Math.round(((index + 1) / steps.length) * 100);
  const spot = rect ? { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 } : null;
  const position = placeCard(spot, cardHeight);
  const firstName = String(useAuthStore.getState().user?.name || '').trim().split(/\s+/)[0];

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }}>
      {/* Blocks the page while the tour is talking; the dark area is drawn by the spotlight's shadow. */}
      <div style={{ position: 'absolute', inset: 0, background: spot ? 'transparent' : 'rgba(8,15,35,0.66)', backdropFilter: spot ? 'none' : 'blur(3px)' }} />

      {spot && (
        <motion.div
          initial={false}
          animate={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={{ position: 'absolute', borderRadius: 16, boxShadow: '0 0 0 9999px rgba(8,15,35,0.66)', pointerEvents: 'none' }}
        >
          <motion.div
            animate={{ opacity: [0.9, 0.35, 0.9], scale: [1, 1.012, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: 16, border: '2px solid #38bdf8', boxShadow: '0 0 0 4px rgba(56,189,248,0.25), 0 0 28px rgba(56,189,248,0.55)' }}
          />
        </motion.div>
      )}

      <motion.div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-tour-title"
        initial={false}
        animate={{ top: position.top, left: position.left, opacity: searching ? 0 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        style={{ position: 'absolute', width: position.width, maxHeight: `calc(100vh - ${EDGE * 2}px)`, overflowY: 'auto', background: '#ffffff', borderRadius: 20, boxShadow: '0 30px 80px rgba(2,6,23,0.45)', outline: 'none' }}
      >
        {/* Chapter + progress */}
        <div style={{ padding: '16px 18px 14px', borderRadius: '20px 20px 0 0', background: 'linear-gradient(135deg, #0b1b3f 0%, #1e3a8a 100%)', color: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#bae6fd' }}>
              <i className={`bi ${chapter.icon}`} />
              Part {chapterIndex + 1} of {TOUR_CHAPTERS.length} · {chapter.label}
            </span>
            <button type="button" onClick={stop} style={{ border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 4 }}>
              Skip <i className="bi bi-x-lg" />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }} aria-hidden="true">
            {TOUR_CHAPTERS.map((entry, entryIndex) => {
              const total = steps.filter((item) => item.chapter === entry.key).length;
              const done = entryIndex < chapterIndex ? total : entryIndex > chapterIndex ? 0 : steps.slice(0, index + 1).filter((item) => item.chapter === entry.key).length;
              return (
                <div key={entry.key} style={{ flex: total || 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                  <motion.div initial={false} animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={{ duration: 0.3 }} style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #38bdf8, #34d399)' }} />
                </div>
              );
            })}
          </div>
          <div role="progressbar" aria-label="Tour progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} style={{ marginTop: 8, fontSize: 11, color: '#cbd5e1' }}>
            Step {index + 1} of {steps.length} · {percent}% complete
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <AnimatePresence mode="wait">
            <motion.div key={index} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 20, background: '#eff6ff', color: '#2563eb' }}>
                  <i className={`bi ${step.icon}`} />
                </span>
                <h2 id="participant-tour-title" style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                  {isFirst && firstName ? `Welcome, ${firstName}!` : step.title}
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#475569' }}>{step.body}</p>
              {step.tips.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 12, display: 'grid', gap: 9, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14 }}>
                  {step.tips.map((tip) => (
                    <li key={tip} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
                      <i className="bi bi-check-circle-fill" style={{ color: '#2563eb', marginTop: 2 }} />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            {isFirst ? <span /> : (
              <button type="button" onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <i className="bi bi-arrow-left" /> Back
              </button>
            )}
            {step.final ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={stop} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Finish
                </button>
                <button type="button" onClick={() => { stop(); navigate('/participant/events'); }} style={primaryButtonStyle}>
                  Browse events <i className="bi bi-arrow-right" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={next} style={primaryButtonStyle}>
                {isFirst ? 'Start the tour' : 'Next'} <i className="bi bi-arrow-right" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)', color: '#ffffff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 10px 22px rgba(37,99,235,0.3)' };

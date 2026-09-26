// Data stores keep their last-loaded records in localStorage so pages open
// instantly with them and refresh in the background. Those records belong to
// one signed-in user: they are emptied on sign-out and whenever a different
// user signs in on the same browser. Other persisted fields (form drafts, the
// certificate template) are left alone.
const OWNER_KEY = 'fairplay_cache_owner';
const RESET_EVENT = 'fairplay:cache-reset';

const DATA_FIELDS = {
  fairplay_events: ['events'],
  fairplay_registrations: ['registrations'],
  fairplay_teams: ['teams'],
  fairplay_scores: ['scores', 'leaderboard'],
  fairplay_judges: ['judges', 'assignments', 'invites'],
  fairplay_attendance: ['attendance'],
  fairplay_certificates: ['certificates'],
  fairplay_tournaments: ['tournaments'],
  fairplay_venues: ['venues'],
};

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function emptyFields(state, fields) {
  const next = {};
  fields.forEach((field) => {
    next[field] = Array.isArray(state?.[field]) ? [] : {};
  });
  return next;
}

export function resetDataCaches() {
  const storage = safeStorage();
  if (storage) {
    Object.entries(DATA_FIELDS).forEach(([key, fields]) => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.state) {
          parsed.state = { ...parsed.state, ...emptyFields(parsed.state, fields) };
          storage.setItem(key, JSON.stringify(parsed));
        }
      } catch {
        storage.removeItem(key);
      }
    });
    storage.removeItem(OWNER_KEY);
  }
  // Stores already in memory empty themselves on this event.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESET_EVENT));
}

export function claimDataCache(userId) {
  if (!userId) return;
  const storage = safeStorage();
  if (storage?.getItem(OWNER_KEY) === String(userId)) return;
  resetDataCaches();
  storage?.setItem(OWNER_KEY, String(userId));
}

// Registers a store so it empties its cached records on reset.
export function bindDataCacheReset(useStore, fields) {
  if (typeof window === 'undefined') return;
  window.addEventListener(RESET_EVENT, () => {
    useStore.setState((state) => emptyFields(state, fields));
  });
}

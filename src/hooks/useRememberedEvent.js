import { useCallback, useEffect, useState } from 'react';
import useAuthStore from '../store/authStore';

// The event an organizer last worked on, kept across pages and visits so they
// don't have to pick it again on every screen. A page opened with a specific
// event (a link carrying ?eventId=) uses that one, and it becomes the
// remembered event from then on.
// Kept per account: two organizers sharing a browser must never be handed
// each other's event.
const storageKey = () => `fairplay_last_event_id_${useAuthStore.getState().user?.id || 'guest'}`;

function readRemembered() {
  try {
    return window.localStorage.getItem(storageKey()) || '';
  } catch {
    return '';
  }
}

function remember(eventId) {
  if (!eventId) return;
  try {
    window.localStorage.setItem(storageKey(), String(eventId));
  } catch {
    // Private browsing or blocked storage: the picker simply starts empty next time.
  }
}

export default function useRememberedEvent(fromUrl = '') {
  const [eventId, setEventId] = useState(() => String(fromUrl || readRemembered() || ''));

  useEffect(() => {
    if (fromUrl) remember(fromUrl);
  }, [fromUrl]);

  const choose = useCallback((next) => {
    const value = next === null || next === undefined ? '' : String(next);
    setEventId(value);
    remember(value);
  }, []);

  return [eventId, choose];
}

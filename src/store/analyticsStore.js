import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAnalyticsStore = create(
  persist(
    (set, get) => ({
      events: [],
      loading: false,

      logEvent: (event) => {
        set((state) => ({
          events: [
            { id: Date.now(), timestamp: new Date().toISOString(), ...event },
            ...state.events,
          ].slice(0, 1000), // Keep last 1000 events
        }));
      },

      getAnalytics: () => {
        const { events } = get();
        const nowTime = Date.now();
        let last24h = 0;
        let last7d = 0;
        const byType = {};

        for (let i = 0; i < events.length; i++) {
          const e = events[i];
          const eventTime = e.id || new Date(e.timestamp).getTime();
          const diff = nowTime - eventTime;
          
          if (diff < 86400000) last24h++;
          if (diff < 604800000) last7d++;
          
          if (e.type) {
            byType[e.type] = (byType[e.type] || 0) + 1;
          }
        }

        return {
          total: events.length,
          last24h,
          last7d,
          byType,
        };
      },

      clearEvents: () => set({ events: [] }),
    }),
    { name: 'fairplay_analytics' }
  )
);

export default useAnalyticsStore;
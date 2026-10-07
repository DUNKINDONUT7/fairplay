import { create } from 'zustand';

// The organizer tour moves between pages, so its progress lives outside any
// one page. Nothing is persisted: a reload simply ends the tour.
const useTourStore = create((set) => ({
  active: false,
  index: 0,
  start: () => set({ active: true, index: 0 }),
  stop: () => set({ active: false, index: 0 }),
  goTo: (index) => set({ index: Math.max(0, index) }),
}));

export default useTourStore;

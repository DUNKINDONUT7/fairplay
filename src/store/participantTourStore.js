import { create } from 'zustand';

// The participant tour moves between pages, so its progress lives outside any
// one page. Kept separate from the organizer tour store so the two never
// fight over the same active/index state. Nothing is persisted: a reload
// simply ends the tour.
const useParticipantTourStore = create((set) => ({
  active: false,
  index: 0,
  start: () => set({ active: true, index: 0 }),
  stop: () => set({ active: false, index: 0 }),
  goTo: (index) => set({ index: Math.max(0, index) }),
}));

export default useParticipantTourStore;

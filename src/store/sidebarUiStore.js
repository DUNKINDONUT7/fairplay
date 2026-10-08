import { create } from 'zustand';

// Lets something outside the sidebar (the guided tours) force it open and
// reveal a specific nav link, without touching the user's own collapsed/
// expanded preference — release() simply hands control back to it.
const useSidebarUiStore = create((set) => ({
  forcedOpen: false,
  revealPath: null,
  reveal: (path) => set({ forcedOpen: true, revealPath: path }),
  release: () => set({ forcedOpen: false, revealPath: null }),
}));

export default useSidebarUiStore;

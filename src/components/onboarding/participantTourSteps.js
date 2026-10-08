// The guided tour for participants. It walks through the real pages in the
// order a participant actually uses them: find and join an event, check its
// schedule, then come back for scores and certificates.
//
// A step may have:
//   route   – page to open first
//   target  – CSS selector of the element to spotlight; without one (or when
//             it isn't on screen, e.g. the sidebar on a phone) the card is centred
const nav = (path) => `[data-tour="sidebar"] a[href="${path}"]`;
const PAGE = '.fairplay-dashboard-content';

export const TOUR_CHAPTERS = [
  { key: 'start', label: 'Home base', icon: 'bi-house-door' },
  { key: 'join', label: 'Find & join events', icon: 'bi-calendar-plus' },
  { key: 'schedule', label: 'Your schedule', icon: 'bi-calendar-week' },
  { key: 'results', label: 'Results & certificates', icon: 'bi-trophy' },
];

const STEPS = [
  // ------------------------------------------------------------ Home base
  {
    chapter: 'start',
    icon: 'bi-stars',
    route: '/participant',
    title: 'Welcome to FairPlay',
    body: 'This tour takes you through every part of your participant account — on the real pages, in the order you will use them: join an event, check your schedule, then come back for your scores and certificate.',
    tips: ['Use Next and Back, or the arrow keys on your keyboard', 'Press Esc or Skip to leave at any time', 'You can replay it from the dashboard whenever you like'],
  },
  {
    chapter: 'start',
    icon: 'bi-speedometer2',
    route: '/participant',
    target: '[data-tour="dash-hero"]',
    title: 'Your dashboard',
    body: 'This is where you land every time you sign in. It shows your next event, how many are open to join, and your current ranking once scores come in.',
    tips: ['Browse Events and My Schedule are always one click away here'],
  },
  {
    chapter: 'start',
    icon: 'bi-grid',
    route: '/participant',
    target: '[data-tour="dash-stats"]',
    title: 'Your numbers at a glance',
    body: 'Open events, your registrations, how many events you have completed, and your current ranking — each one jumps straight to the matching page.',
    tips: [],
  },
  {
    chapter: 'start',
    icon: 'bi-layout-sidebar',
    route: '/participant',
    target: '[data-tour="sidebar"]',
    title: 'The menu',
    body: 'Everything you need: register for events, check your schedule, view scores and certificates, read announcements, and manage your profile.',
    tips: [],
  },
  {
    chapter: 'start',
    icon: 'bi-bell',
    route: '/participant',
    target: '[data-tour="notifications"]',
    title: 'Notifications',
    body: 'The bell tells you when your registration is approved, when scores come in, and when a certificate is ready.',
    tips: [],
  },
  {
    chapter: 'start',
    icon: 'bi-question-circle',
    route: '/participant',
    target: '[aria-label="Open FairPlay support assistant"]',
    title: 'Stuck? Ask the assistant',
    body: 'The help button is on every page. Ask it how to do something in FairPlay and it answers right there.',
    tips: [],
  },

  // ------------------------------------------------------------ Find & join events
  {
    chapter: 'join',
    icon: 'bi-journal-plus',
    route: '/participant',
    target: nav('/participant/events'),
    title: 'Step 1 — Find an event',
    body: 'Every event open for registration is listed here. Let’s open it.',
    tips: [],
  },
  {
    chapter: 'join',
    icon: 'bi-calendar-event',
    route: '/participant/events',
    target: PAGE,
    title: 'Event Registration',
    body: 'Search or filter by status, then register for the ones that interest you.',
    tips: [
      'Open means you can still register; Full or Closed means the window has passed',
      'Team events (tournaments, sports fest, esports) ask you to register a team; the rest register you individually',
      'Already Registered shows on events you have joined',
    ],
  },

  // ------------------------------------------------------------ Your schedule
  {
    chapter: 'schedule',
    icon: 'bi-calendar-week',
    route: '/participant',
    target: nav('/participant/schedule'),
    title: 'Step 2 — Check your schedule',
    body: 'Once you are registered, this is where every event you joined shows up with its date, time and venue.',
    tips: [],
  },
  {
    chapter: 'schedule',
    icon: 'bi-calendar-check',
    route: '/participant/schedule',
    target: PAGE,
    title: 'My Schedule',
    body: 'Filter by Ongoing, Upcoming or Completed to see where each of your events stands.',
    tips: [],
  },
  {
    chapter: 'schedule',
    icon: 'bi-megaphone',
    route: '/participant',
    target: nav('/participant/announcements'),
    title: 'Announcements',
    body: 'Updates about your events and certificates also collect here, in case you miss the notification bell.',
    tips: [],
  },

  // ------------------------------------------------------------ Results & certificates
  {
    chapter: 'results',
    icon: 'bi-trophy',
    route: '/participant',
    target: nav('/participant/scores'),
    title: 'Step 3 — Scores and Results',
    body: 'After judging, your score, rank and leaderboard position for each event you joined appear here.',
    tips: [],
  },
  {
    chapter: 'results',
    icon: 'bi-bar-chart-line',
    route: '/participant/scores',
    target: PAGE,
    title: 'Scores and Results',
    body: 'Each card shows your score and rank once it is in, with a link to the full leaderboard.',
    tips: ['A certificate becomes available here once the event is finalized'],
  },
  {
    chapter: 'results',
    icon: 'bi-person',
    route: '/participant',
    target: nav('/participant/profile'),
    title: 'Step 4 — Your profile',
    body: 'Update your details here, and this is also where your certificates live.',
    tips: [],
  },
  {
    chapter: 'results',
    icon: 'bi-award',
    route: '/participant/profile',
    target: PAGE,
    title: 'Profile and certificates',
    body: 'Edit your bio, phone number, email and password, and view or verify any certificate you have earned.',
    tips: ['Each certificate carries a verification link anyone can use to confirm it is genuine'],
  },
  {
    chapter: 'results',
    icon: 'bi-rocket-takeoff',
    route: '/participant',
    final: true,
    title: 'You’re ready',
    body: 'That is the whole flow: find an event, register, follow your schedule, then come back here for your scores and certificate.',
    tips: ['Replay this tour anytime with “Take the tour” on your dashboard'],
  },
];

export function buildTourSteps() {
  return STEPS;
}

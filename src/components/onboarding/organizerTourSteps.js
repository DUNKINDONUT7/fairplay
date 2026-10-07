// The guided tour for organizers. It walks through the real pages in the order
// an event is actually run, pointing at the real controls.
//
// A step may have:
//   route   – page to open first (string, or a function of { eventId })
//   target  – CSS selector of the element to spotlight; without one (or when
//             it isn't on screen, e.g. the sidebar on a phone) the card is centred
//   needsEvent / noEventOnly – shown only when the organizer has / hasn't an event
const nav = (path) => `[data-tour="sidebar"] a[href="${path}"]`;
const PAGE = '.fairplay-dashboard-content';
const eventPage = ({ eventId }) => `/organizer/events/${eventId}`;

export const TOUR_CHAPTERS = [
  { key: 'start', label: 'Home base', icon: 'bi-house-door' },
  { key: 'setup', label: 'Set up an event', icon: 'bi-calendar-plus' },
  { key: 'people', label: 'People', icon: 'bi-people' },
  { key: 'day', label: 'Event day', icon: 'bi-broadcast' },
  { key: 'after', label: 'After the event', icon: 'bi-trophy' },
];

const STEPS = [
  // ------------------------------------------------------------ Home base
  {
    chapter: 'start',
    icon: 'bi-stars',
    route: '/organizer',
    title: 'Welcome to FairPlay',
    body: 'This tour takes you through every part of the organizer side — on the real pages, in the order you will use them to run an event from start to finish.',
    tips: ['Use Next and Back, or the arrow keys on your keyboard', 'Press Esc or Skip to leave at any time', 'You can replay it from the dashboard whenever you like'],
  },
  {
    chapter: 'start',
    icon: 'bi-speedometer2',
    route: '/organizer',
    target: '[data-tour="dash-hero"]',
    title: 'Your dashboard',
    body: 'This is where you land every time you sign in. The top shows your next event with a countdown, and how many events are live, upcoming and completed.',
    tips: ['Click a number to filter the event list below', 'Create Event is always one click away here'],
  },
  {
    chapter: 'start',
    icon: 'bi-pie-chart',
    route: '/organizer',
    target: '[data-tour="dash-insights"]',
    title: 'Insights at a glance',
    body: 'Three cards summarise everything: your events by status, how many registration slots are filled, and the champions of your latest finished events.',
    tips: ['Click a status in the chart to see only those events', 'Click a champion to open that event’s full ranking'],
  },
  {
    chapter: 'start',
    icon: 'bi-calendar-week',
    route: '/organizer',
    target: '[data-tour="dash-events"]',
    title: 'All your events',
    body: 'Every event you own, with its date, venue, participant count and status. Search by title, type or venue, or switch status tabs.',
    tips: ['Open goes to the event’s control page', 'The chart icon jumps straight to its scoring'],
  },
  {
    chapter: 'start',
    icon: 'bi-layout-sidebar',
    route: '/organizer',
    target: '[data-tour="sidebar"]',
    title: 'The menu',
    body: 'Everything is grouped the way an event flows: set it up, manage the people, run the competition, then hand out results. We will visit each one next.',
    tips: [],
  },
  {
    chapter: 'start',
    icon: 'bi-bell',
    route: '/organizer',
    target: '[data-tour="notifications"]',
    title: 'Notifications',
    body: 'The bell tells you when an event is approved or rejected, when scores come in, when a bracket is ready and when results are final.',
    tips: ['Results and brackets open in a pop-up, so you never leave your dashboard'],
  },
  {
    chapter: 'start',
    icon: 'bi-question-circle',
    route: '/organizer',
    target: '[aria-label="Open FairPlay support assistant"]',
    title: 'Stuck? Ask the assistant',
    body: 'The help button is on every page. Ask it how to do something in FairPlay and it answers right there.',
    tips: [],
  },

  // ------------------------------------------------------------ Set up an event
  {
    chapter: 'setup',
    icon: 'bi-calendar-plus',
    route: '/organizer',
    target: nav('/organizer/create-event'),
    title: 'Step 1 — Create an event',
    body: 'Every competition starts here. Let’s open it.',
    tips: [],
  },
  {
    chapter: 'setup',
    icon: 'bi-ui-checks',
    route: '/organizer/create-event',
    target: PAGE,
    title: 'The event builder',
    body: 'A step-by-step form. You pick the event type first, and the rest of the form adapts to it.',
    tips: [
      'Tournament and Sports Fest use brackets; singing, dance, pageant and academic contests are judged with scores',
      'Add the schedule, venue, an event image and the maximum number of participants — registration stops by itself once it is full',
      'A Sports Fest can hold several sports, each with its own bracket',
    ],
  },
  {
    chapter: 'setup',
    icon: 'bi-list-check',
    route: '/organizer/create-event',
    target: PAGE,
    title: 'Criteria, rounds and bracket format',
    body: 'Further along the same form you decide how a champion is chosen.',
    tips: [
      'Judged events: write the criteria yourself or let the AI draft them from your description, then download them as a formal PDF',
      'Criteria weights add up to 100%, and the point scale you pick becomes the range judges score in',
      'Multi-round events: set each round and how many advance — the system cuts the field for you',
      'Bracket events: choose Single Elimination, Round Robin, or Group Stage + Knockout',
    ],
  },
  {
    chapter: 'setup',
    icon: 'bi-shield-check',
    route: '/organizer/create-event',
    target: PAGE,
    title: 'Approval',
    body: 'When you submit, the event goes to the approvers. It becomes public and open for registration only after it is approved.',
    tips: ['You can still edit the details while it is a draft, pending or rejected', 'Once approved, the details are locked so nothing changes under the participants'],
  },
  {
    chapter: 'setup',
    icon: 'bi-geo-alt',
    route: '/organizer/venues',
    target: PAGE,
    title: 'Venues',
    body: 'Keep the list of places you hold your events in, with their details in one spot.',
    tips: [],
  },
  {
    chapter: 'setup',
    icon: 'bi-calendar-event',
    route: '/organizer/events',
    target: PAGE,
    title: 'My Events',
    body: 'The full list as cards, with each event’s status. Finished events show their champion and top placers right on the card.',
    tips: ['Open a card to reach that event’s control page', 'Completed cards link to the Ranking and the Results report'],
  },
  {
    chapter: 'setup',
    icon: 'bi-box-arrow-in-right',
    noEventOnly: true,
    route: '/organizer/events',
    target: PAGE,
    title: 'The event control page',
    body: 'Once you have an event, opening it gives you one page to run it from: start or stop the scoring session, add participants one by one or by CSV, review the criteria, and show the QR codes for judges, participants and the audience.',
    tips: ['Replay this tour after creating an event to see that page for real'],
  },
  {
    chapter: 'setup',
    icon: 'bi-info-circle',
    needsEvent: true,
    route: eventPage,
    target: '#section-overview',
    title: 'The event control page',
    body: 'This is one of your events. Everything about it is run from this page. The buttons at the top jump to its Scoring, Bracket, Ranking and Report.',
    tips: ['Back returns you to My Events'],
  },
  {
    chapter: 'setup',
    icon: 'bi-play-circle',
    needsEvent: true,
    route: eventPage,
    target: '#section-scoring',
    title: 'Scoring session',
    body: 'Judges can only submit scores while the session is open. Start it when the event begins and close it when judging is done.',
    tips: [],
  },
  {
    chapter: 'setup',
    icon: 'bi-person-plus',
    needsEvent: true,
    route: eventPage,
    target: '#section-participants',
    title: 'Participants',
    body: 'Add participants or teams yourself, or import many at once from a CSV file. If you enter an email, they are notified that they have been added.',
    tips: ['The counter shows registered / maximum — adding stops at the maximum', 'Participants can also register themselves through the QR code'],
  },
  {
    chapter: 'setup',
    icon: 'bi-list-ol',
    needsEvent: true,
    route: eventPage,
    target: '#section-rubric',
    title: 'Criteria',
    body: 'The rubric the judges score with, each criterion with its weight. For bracket events this section is not used — match scores decide the winner.',
    tips: [],
  },
  {
    chapter: 'setup',
    icon: 'bi-qr-code',
    needsEvent: true,
    route: eventPage,
    target: '#section-access',
    title: 'QR codes and access',
    body: 'Show these on a screen or print them. One QR lets judges open their score sheet, one lets participants register, and one lets the audience vote if you turned that on.',
    tips: ['Click a QR to show it full screen', 'Bracket events also get scorer links for the table officials'],
  },

  // ------------------------------------------------------------ People
  {
    chapter: 'people',
    icon: 'bi-people',
    route: '/organizer/contestants',
    target: PAGE,
    title: 'Contestants',
    body: 'Everyone who registered, split into team entries and individual entries. Review each team’s roster and approve or reject it.',
    tips: ['Approve all clears every waiting team with a complete roster in one click', 'Filter by event or search by team, school or leader'],
  },
  {
    chapter: 'people',
    icon: 'bi-person-workspace',
    route: '/organizer/judges',
    target: PAGE,
    title: 'Judges',
    body: 'Invite judges by email and assign them to your events. A judge only ever sees the events you assigned them to.',
    tips: ['See at a glance which events each judge is handling'],
  },
  {
    chapter: 'people',
    icon: 'bi-clipboard-check',
    route: '/organizer/attendance',
    target: PAGE,
    title: 'Attendance',
    body: 'Check people in on event day by scanning their QR code, or mark them manually. The list shows who arrived, when, and how they were checked in.',
    tips: ['Search and filter by source to find someone fast'],
  },

  // ------------------------------------------------------------ Event day
  {
    chapter: 'day',
    icon: 'bi-bar-chart-line',
    route: '/organizer/scoring',
    target: '[data-tour="event-picker"]',
    title: 'Scoring — pick the event',
    body: 'This is your control room on event day. Start by choosing the event; the page remembers your choice the next time you open it.',
    tips: ['Type in the picker to search your events'],
  },
  {
    chapter: 'day',
    icon: 'bi-broadcast',
    route: '/organizer/scoring',
    target: PAGE,
    title: 'Scoring — watch it live',
    body: 'Scores appear here as judges submit them, without reloading the page.',
    tips: [
      'Scores: every judge’s score per contestant, and who has not scored yet',
      'Live Scoring: the feed of submissions as they arrive',
      'Leaderboard: the current ranking, computed from the criteria weights',
      'Multi-round events: advance to the next round here — the cut is applied automatically',
    ],
  },
  {
    chapter: 'day',
    icon: 'bi-lock',
    route: '/organizer/scoring',
    target: PAGE,
    title: 'Finalize the results',
    body: 'When judging is complete, the Finalize tab locks the scores and marks the event completed.',
    tips: ['Finalizing is permanent — locked scores cannot be edited by anyone, not even an admin', 'Double-check the leaderboard before you finalize'],
  },
  {
    chapter: 'day',
    icon: 'bi-diagram-3',
    route: '/organizer/brackets',
    target: PAGE,
    title: 'Brackets',
    body: 'For tournaments and sports fests. Only bracket events appear here, and the format comes from what you chose when creating the event.',
    tips: [
      'Arrange the matchup order by dragging, or press Shuffle for a random draw, then build the bracket',
      'You can rebuild it until the event starts',
      'Enter each match score and the winner moves on automatically',
      'Finalize Scores locks the bracket for good once the champion is decided',
    ],
  },

  // ------------------------------------------------------------ After the event
  {
    chapter: 'after',
    icon: 'bi-file-earmark-text',
    route: '/organizer/reports',
    target: PAGE,
    title: 'Reports',
    body: 'A complete report for every event: rankings, each judge’s scores, criteria analysis, attendance and bracket results.',
    tips: ['Download the official PDF for signing and filing', 'Export the raw scores as CSV or JSON'],
  },
  {
    chapter: 'after',
    icon: 'bi-award',
    route: '/organizer/certificates',
    target: PAGE,
    title: 'Certificates',
    body: 'Generate certificates for an event’s participants and winners. Each one carries a code anyone can use to verify it is genuine.',
    tips: ['Bracket events produce one certificate per team, with its placement'],
  },
  {
    chapter: 'after',
    icon: 'bi-gear',
    route: '/organizer/settings',
    target: PAGE,
    title: 'Settings',
    body: 'Update your profile and account details here.',
    tips: [],
  },
  {
    chapter: 'after',
    icon: 'bi-rocket-takeoff',
    route: '/organizer',
    final: true,
    title: 'You’re ready',
    body: 'That is the whole flow: create the event, get it approved, register the people, score it live, finalize, then hand out reports and certificates.',
    tips: ['Replay this tour anytime with “Take the tour” on your dashboard'],
  },
];

// The steps that apply to this organizer, with routes resolved.
export function buildTourSteps({ eventId }) {
  return STEPS
    .filter((step) => (step.needsEvent ? Boolean(eventId) : step.noEventOnly ? !eventId : true))
    .map((step) => ({ ...step, route: typeof step.route === 'function' ? step.route({ eventId }) : step.route }));
}

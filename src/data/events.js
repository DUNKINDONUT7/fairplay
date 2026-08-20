// Mock Events Data

export const mockEvents = [
  {
    id: 1,
    name: 'Web Development Championship 2024',
    type: 'contest',
    category: 'tech',
    description: 'Build responsive web applications and showcase your skills',
    startDate: '2024-06-15',
    endDate: '2024-06-16',
    registrationDeadline: '2024-06-10',
    location: 'Virtual',
    organizer: {
      id: 2,
      name: 'Organizer User'
    },
    status: 'active',
    participants: 45,
    maxParticipants: 100,
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&h=300&fit=crop',
    description_full: 'A comprehensive coding competition where developers compete to create the best responsive web applications. Participants will be judged on design, functionality, and code quality.',
    criteria: ['Design Quality', 'Functionality', 'Code Quality', 'User Experience'],
    judges: [
      { id: 3, name: 'Judge User' },
      { id: 6, name: 'Michael Chen' }
    ]
  },
  {
    id: 2,
    name: 'National Esports Tournament 2024',
    type: 'tournament',
    category: 'esports',
    description: 'Compete in VALORANT and win amazing prizes',
    startDate: '2024-07-01',
    endDate: '2024-07-15',
    registrationDeadline: '2024-06-20',
    location: 'Online',
    organizer: {
      id: 5,
      name: 'Sarah Johnson'
    },
    status: 'active',
    participants: 128,
    maxParticipants: 256,
    image: 'https://images.unsplash.com/photo-1538481143235-259d07bad41c?w=500&h=300&fit=crop',
    description_full: 'High-intensity esports tournament featuring the best gaming teams. Single elimination bracket with live streaming.',
    tournamentFormat: 'single-elimination',
    prizePool: '$50,000',
    judges: [
      { id: 3, name: 'Judge User' }
    ]
  },
  {
    id: 3,
    name: 'College Sports Championship',
    type: 'tournament',
    category: 'sports',
    description: 'Inter-college cricket and badminton competitions',
    startDate: '2024-08-01',
    endDate: '2024-08-20',
    registrationDeadline: '2024-07-25',
    location: 'Campus Grounds',
    organizer: {
      id: 2,
      name: 'Organizer User'
    },
    status: 'upcoming',
    participants: 32,
    maxParticipants: 64,
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=500&h=300&fit=crop',
    description_full: 'Annual college sports championship featuring cricket, badminton, and football tournaments. Teams from all colleges can participate.',
    tournamentFormat: 'round-robin',
    judges: [
      { id: 6, name: 'Michael Chen' }
    ]
  },
  {
    id: 4,
    name: 'National Debate Championship',
    type: 'contest',
    category: 'academic',
    description: 'Showcase your debating skills on the national stage',
    startDate: '2024-05-20',
    endDate: '2024-05-22',
    registrationDeadline: '2024-05-15',
    location: 'Convention Center',
    organizer: {
      id: 5,
      name: 'Sarah Johnson'
    },
    status: 'completed',
    participants: 64,
    maxParticipants: 100,
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=300&fit=crop',
    description_full: 'Annual national debate championship featuring university students competing in various debate formats.',
    criteria: ['Content Quality', 'Delivery', 'Argumentation', 'Rebuttal Skills'],
    judges: [
      { id: 3, name: 'Judge User' },
      { id: 6, name: 'Michael Chen' }
    ]
  },
  {
    id: 5,
    name: 'School Pageant 2024',
    type: 'contest',
    category: 'pageant',
    description: 'Find your school\'s ambassador for excellence',
    startDate: '2024-09-10',
    endDate: '2024-09-10',
    registrationDeadline: '2024-08-30',
    location: 'School Auditorium',
    organizer: {
      id: 2,
      name: 'Organizer User'
    },
    status: 'upcoming',
    participants: 25,
    maxParticipants: 50,
    image: 'https://images.unsplash.com/photo-1540575467063-178cb50230e3?w=500&h=300&fit=crop',
    description_full: 'Annual school pageant celebrating talent, charisma, and leadership qualities of school students.',
    criteria: ['Appearance', 'Talent', 'Interview', 'Overall Personality'],
    judges: [
      { id: 3, name: 'Judge User' }
    ]
  },
  {
    id: 6,
    name: 'Coding Marathon 2024',
    type: 'tournament',
    category: 'tech',
    description: '24-hour coding challenge with amazing prizes',
    startDate: '2024-10-01',
    endDate: '2024-10-02',
    registrationDeadline: '2024-09-25',
    location: 'Virtual',
    organizer: {
      id: 5,
      name: 'Sarah Johnson'
    },
    status: 'upcoming',
    participants: 78,
    maxParticipants: 200,
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&h=300&fit=crop',
    description_full: '24-hour coding marathon where teams solve challenging problems and compete for the top positions.',
    tournamentFormat: 'round-robin',
    judges: [
      { id: 6, name: 'Michael Chen' }
    ]
  }
];

// Get event by ID
export const getEventById = (id) => {
  return mockEvents.find((event) => event.id === id);
};

// Get events by type
export const getEventsByType = (type) => {
  return mockEvents.filter((event) => event.type === type);
};

// Get active events
export const getActiveEvents = () => {
  return mockEvents.filter((event) => event.status === 'active' || event.status === 'upcoming');
};

// Get completed events
export const getCompletedEvents = () => {
  return mockEvents.filter((event) => event.status === 'completed');
};

// Get events by organizer
export const getEventsByOrganizer = (organizerId) => {
  return mockEvents.filter((event) => event.organizer.id === organizerId);
};

// Get events by category
export const getEventsByCategory = (category) => {
  return mockEvents.filter((event) => event.category === category);
};

// Search events
export const searchEvents = (query) => {
  const lowerQuery = query.toLowerCase();
  return mockEvents.filter((event) =>
    event.name.toLowerCase().includes(lowerQuery) ||
    event.description.toLowerCase().includes(lowerQuery) ||
    event.category.toLowerCase().includes(lowerQuery)
  );
};

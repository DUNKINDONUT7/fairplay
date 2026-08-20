// Mock Users Data

export const mockUsers = [
  {
    id: 1,
    email: 'admin@fairplay.com',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    joinDate: '2023-01-15',
    status: 'active'
  },
  {
    id: 2,
    email: 'organizer@fairplay.com',
    password: 'organizer123',
    name: 'Organizer User',
    role: 'organizer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=organizer',
    joinDate: '2023-02-20',
    status: 'active',
    organization: 'Event Masters Inc'
  },
  {
    id: 3,
    email: 'judge@fairplay.com',
    password: 'judge123',
    name: 'Judge User',
    role: 'judge',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=judge',
    joinDate: '2023-03-10',
    status: 'active',
    expertise: 'Technical Judge'
  },
  {
    id: 4,
    email: 'participant@fairplay.com',
    password: 'participant123',
    name: 'Participant User',
    role: 'participant',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=participant',
    joinDate: '2023-04-05',
    status: 'active',
    team: 'Team Alpha'
  },
  {
    id: 5,
    email: 'organizer2@fairplay.com',
    password: 'password',
    name: 'Sarah Johnson',
    role: 'organizer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    joinDate: '2023-05-12',
    status: 'active',
    organization: 'Tech Events Co'
  },
  {
    id: 6,
    email: 'judge2@fairplay.com',
    password: 'password',
    name: 'Michael Chen',
    role: 'judge',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=michael',
    joinDate: '2023-06-08',
    status: 'active',
    expertise: 'Academic Competitions'
  },
  {
    id: 7,
    email: 'participant2@fairplay.com',
    password: 'password',
    name: 'Emily Davis',
    role: 'participant',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily',
    joinDate: '2023-07-14',
    status: 'active',
    team: 'Team Beta'
  },
  {
    id: 8,
    email: 'participant3@fairplay.com',
    password: 'password',
    name: 'James Wilson',
    role: 'participant',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=james',
    joinDate: '2023-08-22',
    status: 'active',
    team: 'Team Alpha'
  },
  {
    id: 9,
    email: 'coordinator@fairplay.com',
    password: 'password',
    name: 'Institute Coordinator',
    role: 'institute-coordinator',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=coordinator',
    joinDate: '2023-09-10',
    status: 'active'
  },
  {
    id: 10,
    email: 'sportshead@fairplay.com',
    password: 'password',
    name: 'Sports Head',
    role: 'sports-head',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sportshead',
    joinDate: '2023-09-11',
    status: 'active'
  },
  {
    id: 11,
    email: 'osds@fairplay.com',
    password: 'password',
    name: 'OSDS Officer',
    role: 'osds',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=osds',
    joinDate: '2023-09-12',
    status: 'active'
  }
];

// Get user by ID
export const getUserById = (id) => {
  return mockUsers.find((user) => user.id === id);
};

// Get user by email
export const getUserByEmail = (email) => {
  return mockUsers.find((user) => user.email === email);
};

// Get users by role
export const getUsersByRole = (role) => {
  return mockUsers.filter((user) => user.role === role);
};

// Get all judges
export const getAllJudges = () => {
  return getUsersByRole('judge');
};

// Get all organizers
export const getAllOrganizers = () => {
  return getUsersByRole('organizer');
};

// Get all participants
export const getAllParticipants = () => {
  return getUsersByRole('participant');
};

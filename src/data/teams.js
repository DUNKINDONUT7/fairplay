// Mock Teams Data

export const mockTeams = [
  {
    id: 1,
    name: 'Team Alpha',
    eventId: 2,
    captain: {
      id: 4,
      name: 'Participant User',
      email: 'participant@fairplay.com'
    },
    members: [
      {
        id: 4,
        name: 'Participant User',
        email: 'participant@fairplay.com',
        ign: 'Player1',
        discordId: 'Player#1234',
        role: 'captain'
      },
      {
        id: 8,
        name: 'James Wilson',
        email: 'participant3@fairplay.com',
        ign: 'JamesWilson',
        discordId: 'James#5678',
        role: 'member'
      }
    ],
    status: 'active',
    createdDate: '2024-05-10',
    joinDate: '2024-05-15',
    victories: 4,
    losses: 1,
    totalMatches: 5
  },
  {
    id: 2,
    name: 'Team Beta',
    eventId: 2,
    captain: {
      id: 7,
      name: 'Emily Davis',
      email: 'participant2@fairplay.com'
    },
    members: [
      {
        id: 7,
        name: 'Emily Davis',
        email: 'participant2@fairplay.com',
        ign: 'EmilyPlay',
        discordId: 'Emily#9012',
        role: 'captain'
      },
      {
        id: 8,
        name: 'Team Member 1',
        email: 'member1@email.com',
        ign: 'Member1',
        discordId: 'Member#3456',
        role: 'member'
      }
    ],
    status: 'active',
    createdDate: '2024-05-12',
    joinDate: '2024-05-18',
    victories: 5,
    losses: 0,
    totalMatches: 5
  },
  {
    id: 3,
    name: 'Team Gamma',
    eventId: 2,
    captain: {
      id: 4,
      name: 'Team Leader',
      email: 'leader@email.com'
    },
    members: [
      {
        id: 4,
        name: 'Team Leader',
        email: 'leader@email.com',
        ign: 'LeaderGamma',
        discordId: 'Leader#7890',
        role: 'captain'
      }
    ],
    status: 'active',
    createdDate: '2024-05-20',
    joinDate: '2024-05-22',
    victories: 3,
    losses: 2,
    totalMatches: 5
  }
];

// Get team by ID
export const getTeamById = (id) => {
  return mockTeams.find((team) => team.id === id);
};

// Get teams by event
export const getTeamsByEvent = (eventId) => {
  return mockTeams.filter((team) => team.eventId === eventId);
};

// Get team by captain
export const getTeamByCaptain = (captainId) => {
  return mockTeams.find((team) => team.captain.id === captainId);
};

// Get team member
export const getTeamMember = (teamId, memberId) => {
  const team = getTeamById(teamId);
  if (!team) return null;
  return team.members.find((member) => member.id === memberId);
};

// Add team member
export const addTeamMember = (teamId, member) => {
  const team = getTeamById(teamId);
  if (team && team.members.length < 10) {
    // Max 10 members per team
    team.members.push(member);
    return true;
  }
  return false;
};

// Remove team member
export const removeTeamMember = (teamId, memberId) => {
  const team = getTeamById(teamId);
  if (team) {
    team.members = team.members.filter((member) => member.id !== memberId);
    return true;
  }
  return false;
};

// Get all team members
export const getTeamMembers = (teamId) => {
  const team = getTeamById(teamId);
  return team ? team.members : [];
};

// Update team stats
export const updateTeamStats = (teamId, wins, losses) => {
  const team = getTeamById(teamId);
  if (team) {
    team.victories = wins;
    team.losses = losses;
    team.totalMatches = wins + losses;
  }
  return team;
};

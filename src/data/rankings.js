// Mock Rankings and Leaderboard Data

export const mockRankings = [
  {
    id: 1,
    eventId: 1,
    participantId: 7,
    participantName: 'Emily Davis',
    team: 'Team Beta',
    rank: 1,
    score: 95,
    maxScore: 100,
    percentage: 95,
    status: 'completed',
    criteriaScores: {
      'Design Quality': 95,
      'Functionality': 98,
      'Code Quality': 92,
      'User Experience': 94
    }
  },
  {
    id: 2,
    eventId: 1,
    participantId: 8,
    participantName: 'James Wilson',
    team: 'Team Alpha',
    rank: 2,
    score: 88,
    maxScore: 100,
    percentage: 88,
    status: 'completed',
    criteriaScores: {
      'Design Quality': 87,
      'Functionality': 90,
      'Code Quality': 88,
      'User Experience': 86
    }
  },
  {
    id: 3,
    eventId: 1,
    participantId: 4,
    participantName: 'Participant User',
    team: 'Team Alpha',
    rank: 3,
    score: 82,
    maxScore: 100,
    percentage: 82,
    status: 'completed',
    criteriaScores: {
      'Design Quality': 80,
      'Functionality': 85,
      'Code Quality': 81,
      'User Experience': 82
    }
  },
  {
    id: 4,
    eventId: 2,
    participantId: 7,
    participantName: 'Team Beta',
    team: 'Team Beta',
    rank: 1,
    wins: 5,
    losses: 0,
    status: 'in-progress',
    lastMatch: '2024-06-18'
  },
  {
    id: 5,
    eventId: 2,
    participantId: 8,
    participantName: 'Team Alpha',
    team: 'Team Alpha',
    rank: 2,
    wins: 4,
    losses: 1,
    status: 'in-progress',
    lastMatch: '2024-06-17'
  },
  {
    id: 6,
    eventId: 2,
    participantId: 4,
    participantName: 'Team Gamma',
    team: 'Team Gamma',
    rank: 3,
    wins: 3,
    losses: 2,
    status: 'in-progress',
    lastMatch: '2024-06-16'
  }
];

// Get rankings for event
export const getRankingsByEvent = (eventId) => {
  return mockRankings
    .filter((ranking) => ranking.eventId === eventId)
    .sort((a, b) => a.rank - b.rank);
};

// Get participant ranking
export const getParticipantRanking = (eventId, participantId) => {
  return mockRankings.find(
    (ranking) => ranking.eventId === eventId && ranking.participantId === participantId
  );
};

// Get top 3 rankings
export const getTopRankings = (eventId) => {
  return getRankingsByEvent(eventId).slice(0, 3);
};

// Get user's all rankings
export const getUserAllRankings = (participantId) => {
  return mockRankings
    .filter((ranking) => ranking.participantId === participantId)
    .sort((a, b) => a.rank - b.rank);
};

// Update ranking (for mock live updates)
export const updateRanking = (rankingId, updates) => {
  const ranking = mockRankings.find((r) => r.id === rankingId);
  if (ranking) {
    Object.assign(ranking, updates);
  }
  return ranking;
};

// Mock Tournament Brackets Data

export const mockBrackets = [
  {
    id: 1,
    eventId: 2,
    format: 'single-elimination',
    rounds: [
      {
        roundNumber: 1,
        name: 'Round 1',
        matches: [
          {
            id: 'match-1',
            team1: { id: 1, name: 'Team Alpha', seed: 1 },
            team2: { id: 5, name: 'Team Echo', seed: 8 },
            winner: { id: 1, name: 'Team Alpha' },
            status: 'completed',
            score: '2-0'
          },
          {
            id: 'match-2',
            team1: { id: 2, name: 'Team Beta', seed: 4 },
            team2: { id: 6, name: 'Team Foxtrot', seed: 5 },
            winner: { id: 2, name: 'Team Beta' },
            status: 'completed',
            score: '2-1'
          },
          {
            id: 'match-3',
            team1: { id: 3, name: 'Team Gamma', seed: 3 },
            team2: { id: 7, name: 'Team Golf', seed: 6 },
            winner: { id: 3, name: 'Team Gamma' },
            status: 'completed',
            score: '2-0'
          },
          {
            id: 'match-4',
            team1: { id: 4, name: 'Team Delta', seed: 2 },
            team2: { id: 8, name: 'Team Hotel', seed: 7 },
            winner: { id: 4, name: 'Team Delta' },
            status: 'completed',
            score: '2-1'
          }
        ]
      },
      {
        roundNumber: 2,
        name: 'Semifinals',
        matches: [
          {
            id: 'match-5',
            team1: { id: 1, name: 'Team Alpha' },
            team2: { id: 2, name: 'Team Beta' },
            winner: { id: 1, name: 'Team Alpha' },
            status: 'completed',
            score: '2-0'
          },
          {
            id: 'match-6',
            team1: { id: 3, name: 'Team Gamma' },
            team2: { id: 4, name: 'Team Delta' },
            winner: { id: 4, name: 'Team Delta' },
            status: 'completed',
            score: '2-1'
          }
        ]
      },
      {
        roundNumber: 3,
        name: 'Finals',
        matches: [
          {
            id: 'match-7',
            team1: { id: 1, name: 'Team Alpha' },
            team2: { id: 4, name: 'Team Delta' },
            winner: { id: 1, name: 'Team Alpha' },
            status: 'in-progress',
            score: '1-1'
          }
        ]
      }
    ]
  },
  {
    id: 2,
    eventId: 3,
    format: 'round-robin',
    rounds: [
      {
        roundNumber: 1,
        name: 'Group Stage - Day 1',
        matches: [
          {
            id: 'match-gr1',
            team1: { id: 1, name: 'Team Alpha' },
            team2: { id: 2, name: 'Team Beta' },
            winner: { id: 1, name: 'Team Alpha' },
            status: 'completed',
            score: '3-1'
          },
          {
            id: 'match-gr2',
            team1: { id: 3, name: 'Team Gamma' },
            team2: { id: 4, name: 'Team Delta' },
            winner: { id: 4, name: 'Team Delta' },
            status: 'completed',
            score: '2-2'
          }
        ]
      },
      {
        roundNumber: 2,
        name: 'Group Stage - Day 2',
        matches: [
          {
            id: 'match-gr3',
            team1: { id: 1, name: 'Team Alpha' },
            team2: { id: 4, name: 'Team Delta' },
            winner: null,
            status: 'upcoming',
            score: '-'
          },
          {
            id: 'match-gr4',
            team1: { id: 2, name: 'Team Beta' },
            team2: { id: 3, name: 'Team Gamma' },
            winner: null,
            status: 'upcoming',
            score: '-'
          }
        ]
      }
    ]
  }
];

// Get bracket by event
export const getBracketByEvent = (eventId) => {
  return mockBrackets.find((bracket) => bracket.eventId === eventId);
};

// Get match by ID
export const getMatchById = (bracketId, matchId) => {
  const bracket = mockBrackets.find((b) => b.id === bracketId);
  if (!bracket) return null;

  for (const round of bracket.rounds) {
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return match;
  }
  return null;
};

// Update match result
export const updateMatchResult = (bracketId, matchId, score, winnerId) => {
  const bracket = mockBrackets.find((b) => b.id === bracketId);
  if (!bracket) return null;

  for (const round of bracket.rounds) {
    const match = round.matches.find((m) => m.id === matchId);
    if (match) {
      match.status = 'completed';
      match.score = score;
      match.winner = match.team1.id === winnerId ? match.team1 : match.team2;
      return match;
    }
  }
  return null;
};

// Get upcoming matches
export const getUpcomingMatches = (bracketId) => {
  const bracket = mockBrackets.find((b) => b.id === bracketId);
  if (!bracket) return [];

  const upcoming = [];
  bracket.rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (match.status === 'upcoming') {
        upcoming.push(match);
      }
    });
  });
  return upcoming;
};

// Get completed matches
export const getCompletedMatches = (bracketId) => {
  const bracket = mockBrackets.find((b) => b.id === bracketId);
  if (!bracket) return [];

  const completed = [];
  bracket.rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (match.status === 'completed') {
        completed.push(match);
      }
    });
  });
  return completed;
};

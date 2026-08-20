export function nextPowerOfTwo(count) {
  if (count <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(count));
}

function standardSeedOrder(size) {
  if (size === 1) return [1];
  if (size === 2) return [1, 2];
  const previous = standardSeedOrder(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}

export function normalizeEntrants(entrants = []) {
  return entrants
    .filter(Boolean)
    .map((entrant, index) => ({
      id: entrant.id || `entrant-${index + 1}`,
      name: entrant.name || `Entrant ${index + 1}`,
      seed: Number(entrant.seed || index + 1),
      type: entrant.type || 'team',
      source: entrant.source || 'manual',
      stats: entrant.stats || {
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDifference: 0,
        rank: index + 1,
      },
    }))
    .sort((left, right) => left.seed - right.seed);
}

export function buildRounds(matches = [], totalRounds = 0, bracketType = 'single') {
  if (bracketType === 'round-robin') {
    const map = new Map();
    matches.forEach((match) => {
      const roundNumber = Number(match.round || 1);
      if (!map.has(roundNumber)) {
        map.set(roundNumber, {
          round: roundNumber,
          label: `Round ${roundNumber}`,
          matches: [],
        });
      }
      map.get(roundNumber).matches.push(match);
    });
    return Array.from(map.values()).sort((left, right) => left.round - right.round);
  }

  return Array.from({ length: totalRounds }, (_, index) => ({
    round: index + 1,
    label:
      totalRounds === 1
        ? 'Finals'
        : index === totalRounds - 1
          ? 'Finals'
          : index === totalRounds - 2
            ? 'Semifinals'
            : index === totalRounds - 3
              ? 'Quarterfinals'
              : `Round ${index + 1}`,
    matches: matches.filter((match) => Number(match.round) === index + 1),
  }));
}

function getNextMatchInfo(match) {
  return {
    round: Number(match.round) + 1,
    position: Math.floor(Number(match.position) / 2),
    slotKey: Number(match.position) % 2 === 0 ? 'team1' : 'team2',
  };
}

function clearDownstreamSlot(matches, round, position, slotKey) {
  const nextMatch = matches.find(
    (entry) => Number(entry.round) === Number(round) && Number(entry.position) === Number(position)
  );
  if (!nextMatch) return;

  nextMatch[slotKey] = null;
  nextMatch.score1 = 0;
  nextMatch.score2 = 0;
  nextMatch.winner = null;
  nextMatch.completedDate = null;
  nextMatch.status = nextMatch.team1 && nextMatch.team2 ? 'scheduled' : 'pending';

  const nextInfo = getNextMatchInfo(nextMatch);
  if (nextInfo.round <= Math.max(...matches.map((entry) => Number(entry.round || 0)), 0)) {
    clearDownstreamSlot(matches, nextInfo.round, nextInfo.position, nextInfo.slotKey);
  }
}

function propagateWinner(matches, match, totalRounds) {
  if (Number(match.round) >= Number(totalRounds)) {
    return matches;
  }

  const nextInfo = getNextMatchInfo(match);
  const nextMatch = matches.find(
    (entry) => Number(entry.round) === Number(nextInfo.round) && Number(entry.position) === Number(nextInfo.position)
  );

  if (!nextMatch) return matches;

  nextMatch[nextInfo.slotKey] = match.winner || null;
  nextMatch.status = nextMatch.team1 && nextMatch.team2 ? 'scheduled' : 'pending';
  return matches;
}

export function autoAdvanceByes(matches = [], totalRounds = 0) {
  const cloned = matches.map((match) => ({ ...match }));
  let changed = true;

  while (changed) {
    changed = false;
    cloned.forEach((match) => {
      const hasSingleEntrant = Boolean(match.team1) !== Boolean(match.team2);
      if (!hasSingleEntrant) return;

      const winningTeam = match.team1 || match.team2 || null;
      if (!winningTeam) return;

      if (match.status !== 'bye' || !match.winner) {
        match.winner = winningTeam;
        match.status = 'bye';
        match.completedDate = match.completedDate || new Date().toISOString();
      }

      if (Number(match.round) >= Number(totalRounds)) return;

      const nextInfo = getNextMatchInfo(match);
      const nextMatch = cloned.find(
        (entry) => Number(entry.round) === Number(nextInfo.round) && Number(entry.position) === Number(nextInfo.position)
      );

      if (nextMatch && !nextMatch[nextInfo.slotKey]) {
        nextMatch[nextInfo.slotKey] = winningTeam;
        nextMatch.status = nextMatch.team1 && nextMatch.team2 ? 'scheduled' : 'pending';
        changed = true;
      }
    });
  }

  return cloned;
}

export function generateSingleEliminationBracket(entrants = []) {
  const teams = normalizeEntrants(entrants);
  const totalSlots = nextPowerOfTwo(teams.length || 1);
  const totalRounds = Math.log2(totalSlots);
  const seedOrder = standardSeedOrder(totalSlots);
  const seededSlots = seedOrder.map((seed) => teams[seed - 1] || null);
  const matches = [];

  for (let index = 0; index < totalSlots / 2; index += 1) {
    const team1 = seededSlots[index * 2] || null;
    const team2 = seededSlots[index * 2 + 1] || null;
    const isBye = Boolean(team1) !== Boolean(team2);
    matches.push({
      id: `WB-R1-M${index + 1}`,
      bracket: 'winners',
      round: 1,
      position: index,
      team1,
      team2,
      score1: 0,
      score2: 0,
      winner: isBye ? (team1 || team2) : null,
      status: isBye ? 'bye' : team1 && team2 ? 'scheduled' : 'pending',
      scheduledDate: null,
      completedDate: isBye ? new Date().toISOString() : null,
    });
  }

  for (let round = 2; round <= totalRounds; round += 1) {
    const matchCount = totalSlots / (2 ** round);
    for (let position = 0; position < matchCount; position += 1) {
      matches.push({
        id: `WB-R${round}-M${position + 1}`,
        bracket: 'winners',
        round,
        position,
        team1: null,
        team2: null,
        score1: 0,
        score2: 0,
        winner: null,
        status: 'pending',
        scheduledDate: null,
        completedDate: null,
      });
    }
  }

  const resolvedMatches = autoAdvanceByes(matches, totalRounds);

  return {
    teams,
    matches: resolvedMatches,
    rounds: buildRounds(resolvedMatches, totalRounds, 'single'),
    standings: [],
    totalRounds,
    totalSlots,
    byes: totalSlots - teams.length,
    currentRound: 1,
    champion: teams.length === 1 ? teams[0] : null,
  };
}

export function generateRoundRobinBracket(entrants = []) {
  const teams = normalizeEntrants(entrants);
  const entries = [...teams];
  const hasBye = entries.length % 2 === 1;

  if (hasBye) {
    entries.push({ id: 'bye', name: 'BYE', seed: 9999, type: 'bye', source: 'generated' });
  }

  const rotation = [...entries];
  const rounds = rotation.length - 1;
  const matches = [];

  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const team1 = rotation[index];
      const team2 = rotation[rotation.length - 1 - index];
      if (team1?.id === 'bye' || team2?.id === 'bye') continue;

      matches.push({
        id: `RR-R${round + 1}-M${index + 1}`,
        bracket: 'round-robin',
        round: round + 1,
        position: index,
        team1,
        team2,
        score1: 0,
        score2: 0,
        winner: null,
        status: 'scheduled',
        scheduledDate: null,
        completedDate: null,
      });
    }

    const fixed = rotation[0];
    const moving = rotation.slice(1);
    moving.unshift(moving.pop());
    rotation.splice(0, rotation.length, fixed, ...moving);
  }

  return {
    teams,
    matches,
    rounds: buildRounds(matches, rounds, 'round-robin'),
    standings: calculateRoundRobinStandings(matches, teams),
    totalRounds: rounds,
    totalSlots: teams.length,
    byes: hasBye ? 1 : 0,
    currentRound: 1,
    champion: null,
  };
}

export function calculateRoundRobinStandings(matches = [], teams = []) {
  const table = new Map(
    normalizeEntrants(teams).map((team) => [
      String(team.id),
      {
        teamId: team.id,
        teamName: team.name,
        seed: team.seed,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDifference: 0,
        played: 0,
      },
    ])
  );

  matches
    .filter((match) => match.status === 'completed')
    .forEach((match) => {
      const left = table.get(String(match.team1?.id));
      const right = table.get(String(match.team2?.id));
      if (!left || !right) return;

      const score1 = Number(match.score1 || 0);
      const score2 = Number(match.score2 || 0);

      left.played += 1;
      right.played += 1;
      left.scoreFor += score1;
      left.scoreAgainst += score2;
      right.scoreFor += score2;
      right.scoreAgainst += score1;

      if (score1 > score2) {
        left.wins += 1;
        left.points += 3;
        right.losses += 1;
      } else if (score2 > score1) {
        right.wins += 1;
        right.points += 3;
        left.losses += 1;
      } else {
        left.draws += 1;
        right.draws += 1;
        left.points += 1;
        right.points += 1;
      }
    });

  return Array.from(table.values())
    .map((entry) => ({
      ...entry,
      scoreDifference: entry.scoreFor - entry.scoreAgainst,
    }))
    .sort((left, right) =>
      right.points - left.points ||
      right.wins - left.wins ||
      right.scoreDifference - left.scoreDifference ||
      right.scoreFor - left.scoreFor ||
      left.seed - right.seed
    )
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export function calculateChampion(tournament) {
  if (!tournament) return null;

  if (tournament.bracketType === 'round-robin') {
    return tournament.standings?.[0]
      ? {
          id: tournament.standings[0].teamId,
          name: tournament.standings[0].teamName,
          seed: tournament.standings[0].seed,
        }
      : null;
  }

  const finalMatch = (tournament.matches || []).find(
    (match) => Number(match.round) === Number(tournament.totalRounds || 0)
  );
  return finalMatch?.winner || null;
}

export function updateSingleEliminationMatch(tournament, matchId, updates = {}, options = {}) {
  const finalize = Boolean(options.finalize);
  const matches = (tournament.matches || []).map((match) =>
    match.id === matchId ? { ...match, ...updates } : { ...match }
  );
  const currentMatch = matches.find((match) => match.id === matchId);
  if (!currentMatch) return tournament;

  if (!finalize) {
    return {
      ...tournament,
      matches,
      rounds: buildRounds(matches, tournament.totalRounds || 0, tournament.bracketType),
    };
  }

  if (!currentMatch.team1 || !currentMatch.team2) {
    throw new Error('Both slots must be filled before saving this match.');
  }

  const score1 = Number(currentMatch.score1 || 0);
  const score2 = Number(currentMatch.score2 || 0);
  if (score1 === score2) {
    throw new Error('Elimination matches cannot end in a tie.');
  }

  const nextInfo = getNextMatchInfo(currentMatch);
  clearDownstreamSlot(matches, nextInfo.round, nextInfo.position, nextInfo.slotKey);

  currentMatch.winner = score1 > score2 ? currentMatch.team1 : currentMatch.team2;
  currentMatch.status = 'completed';
  currentMatch.completedDate = new Date().toISOString();
  propagateWinner(matches, currentMatch, tournament.totalRounds || 0);

  const nextTournament = {
    ...tournament,
    matches,
    rounds: buildRounds(matches, tournament.totalRounds || 0, tournament.bracketType),
  };

  return {
    ...nextTournament,
    champion: calculateChampion(nextTournament),
  };
}

export function updateRoundRobinMatch(tournament, matchId, updates = {}, options = {}) {
  const finalize = Boolean(options.finalize);
  const matches = (tournament.matches || []).map((match) =>
    match.id === matchId ? { ...match, ...updates } : { ...match }
  );
  const currentMatch = matches.find((match) => match.id === matchId);
  if (!currentMatch) return tournament;

  if (finalize) {
    const score1 = Number(currentMatch.score1 || 0);
    const score2 = Number(currentMatch.score2 || 0);
    currentMatch.winner =
      score1 > score2 ? currentMatch.team1 : score2 > score1 ? currentMatch.team2 : null;
    currentMatch.status = 'completed';
    currentMatch.completedDate = new Date().toISOString();
  }

  const standings = calculateRoundRobinStandings(matches, tournament.teams || []);
  const nextTournament = {
    ...tournament,
    matches,
    standings,
    rounds: buildRounds(matches, tournament.totalRounds || 0, 'round-robin'),
  };

  return {
    ...nextTournament,
    champion: finalize ? calculateChampion(nextTournament) : tournament.champion,
  };
}

export function createHistoryEntry(tournament, label = 'Match update') {
  return {
    id: `history-${Date.now()}`,
    label,
    createdAt: new Date().toISOString(),
    matches: (tournament.matches || []).map((match) => ({ ...match })),
    standings: Array.isArray(tournament.standings) ? tournament.standings.map((entry) => ({ ...entry })) : [],
    champion: tournament.champion || null,
    currentRound: tournament.currentRound || 0,
  };
}

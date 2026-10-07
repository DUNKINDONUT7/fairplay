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
  if (bracketType === 'group-knockout') {
    return buildGroupKnockoutRounds(matches);
  }

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

// Every entrant's placement in a bracket, first to last — the one ranking the
// certificates, reports and bracket page all read from.
//
// Single elimination: whoever went further places higher. Entrants knocked
// out in the same round are ordered by how close their last game was (smaller
// losing margin first), then overall score difference, then seed.
// Round robin: the standings table as it is.
//
// `final` is false while games are still being played, in which case entrants
// still alive are listed first (by seed) and the order below them can change.
export function calculateBracketPlacements(tournament) {
  if (!tournament) return [];
  const teams = normalizeEntrants(
    Array.isArray(tournament.entrantSnapshot) && tournament.entrantSnapshot.length > 0
      ? tournament.entrantSnapshot
      : tournament.teams || []
  );
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  const playable = matches.filter((match) => match.status !== 'bye');
  const final = playable.length > 0 && playable.every((match) => match.status === 'completed');

  if (tournament.bracketType === 'round-robin') {
    return calculateRoundRobinStandings(matches, teams).map((row, index) => ({
      id: String(row.teamId),
      name: row.teamName,
      seed: row.seed,
      placement: index + 1,
      wins: row.wins,
      losses: row.losses,
      scoreFor: row.scoreFor,
      scoreAgainst: row.scoreAgainst,
      eliminatedRound: null,
      final,
    }));
  }

  if (tournament.bracketType === 'group-knockout') {
    return calculateGroupKnockoutPlacements(tournament, teams, matches, final);
  }

  const totalRounds = Number(tournament.totalRounds || 0);
  const table = new Map(teams.map((team) => [String(team.id), {
    id: String(team.id),
    name: team.name,
    seed: team.seed,
    wins: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    eliminatedRound: null,
    lossMargin: 0,
  }]));

  playable
    .filter((match) => match.status === 'completed' && match.winner)
    .forEach((match) => {
      const score1 = Number(match.score1 || 0);
      const score2 = Number(match.score2 || 0);
      [[match.team1, score1, score2], [match.team2, score2, score1]].forEach(([team, scored, conceded]) => {
        const row = team ? table.get(String(team.id)) : null;
        if (!row) return;
        row.scoreFor += scored;
        row.scoreAgainst += conceded;
        if (String(match.winner.id) === String(team.id)) {
          row.wins += 1;
        } else {
          row.losses += 1;
          row.eliminatedRound = Number(match.round || 0);
          row.lossMargin = conceded - scored;
        }
      });
    });

  // How far each entrant got: the champion past the last round, anyone still
  // alive just below that, everyone else at the round they went out in.
  const reach = (row) => {
    if (row.eliminatedRound !== null) return row.eliminatedRound;
    return final ? totalRounds + 1 : totalRounds + 0.5;
  };

  return Array.from(table.values())
    .sort((left, right) =>
      reach(right) - reach(left) ||
      left.lossMargin - right.lossMargin ||
      (right.scoreFor - right.scoreAgainst) - (left.scoreFor - left.scoreAgainst) ||
      left.seed - right.seed
    )
    .map(({ lossMargin, ...row }, index) => ({ ...row, placement: index + 1, final }));
}

// ============================================================================
// Group Stage + Knockout
//
// Entrants are split into groups (2 groups, or 4 once there are 12 or more).
// Everyone plays everyone in their own group; the top two of each group then
// go into a knockout, first of one group against second of another.
//
// Group matches carry stage: 'group' and may end in a draw. Knockout matches
// carry stage: 'knockout', start with empty slots, and are filled in the
// moment the last group match is saved.
// ============================================================================

const GROUP_LABELS = ['A', 'B', 'C', 'D'];
export const GROUP_KNOCKOUT_MIN_ENTRANTS = 4;

function groupCountFor(entrantCount) {
  return entrantCount >= 12 ? 4 : 2;
}

// Group membership is read back from the matches, not kept on the team
// objects, because entrants are rebuilt (normalizeEntrants) every time a
// tournament is loaded and would lose any extra field.
function getGroupMembers(matches, teams) {
  const groups = new Map();
  matches.filter((match) => match.stage === 'group').forEach((match) => {
    if (!groups.has(match.group)) groups.set(match.group, new Map());
    [match.team1, match.team2].forEach((team) => {
      if (team) groups.get(match.group).set(String(team.id), team);
    });
  });
  const order = new Map(teams.map((team, index) => [String(team.id), index]));
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, members]) => ({
      label,
      teams: Array.from(members.values()).sort((left, right) => (order.get(String(left.id)) ?? 0) - (order.get(String(right.id)) ?? 0)),
    }));
}

export function calculateGroupStandings(matches = [], teams = []) {
  return getGroupMembers(matches, teams).flatMap((group) =>
    calculateRoundRobinStandings(matches.filter((match) => match.stage === 'group' && match.group === group.label), group.teams)
      .map((row) => ({ ...row, group: group.label }))
  );
}

function buildGroupKnockoutRounds(matches) {
  const groupRounds = matches.filter((match) => match.stage === 'group').reduce((max, match) => Math.max(max, Number(match.round) || 0), 0);
  const knockoutRounds = matches.filter((match) => match.stage === 'knockout').reduce((max, match) => Math.max(max, (Number(match.round) || 0) - groupRounds), 0);
  const rounds = [];

  for (let round = 1; round <= groupRounds; round += 1) {
    rounds.push({
      round,
      label: `Group Stage · Round ${round}`,
      matches: matches
        .filter((match) => match.stage === 'group' && Number(match.round) === round)
        .sort((left, right) => String(left.group).localeCompare(String(right.group)) || left.position - right.position),
    });
  }
  for (let step = 1; step <= knockoutRounds; step += 1) {
    const fromEnd = knockoutRounds - step;
    rounds.push({
      round: groupRounds + step,
      label: fromEnd === 0 ? 'Finals' : fromEnd === 1 ? 'Semifinals' : fromEnd === 2 ? 'Quarterfinals' : `Knockout Round ${step}`,
      matches: matches
        .filter((match) => match.stage === 'knockout' && Number(match.round) === groupRounds + step)
        .sort((left, right) => left.position - right.position),
    });
  }
  return rounds;
}

// Puts the group winners and runners-up into the first knockout round once
// every group match has a result; empties those slots again if one does not.
function seedKnockoutFromGroups(matches, standings) {
  const groupMatches = matches.filter((match) => match.stage === 'group');
  const groupStageDone = groupMatches.length > 0 && groupMatches.every((match) => match.status === 'completed');
  const firstKnockoutRound = matches
    .filter((match) => match.stage === 'knockout')
    .reduce((min, match) => Math.min(min, Number(match.round)), Infinity);

  matches
    .filter((match) => match.stage === 'knockout' && Number(match.round) === firstKnockoutRound)
    .forEach((match) => {
      const pick = (source) => {
        if (!groupStageDone || !source) return null;
        const row = standings.find((entry) => entry.group === source.group && entry.rank === source.rank);
        return row ? { id: row.teamId, name: row.teamName, seed: row.seed } : null;
      };
      match.team1 = pick(match.source1);
      match.team2 = pick(match.source2);
      match.status = match.team1 && match.team2 ? 'scheduled' : 'pending';
    });
}

export function generateGroupKnockoutBracket(entrants = []) {
  const teams = normalizeEntrants(entrants);
  if (teams.length < GROUP_KNOCKOUT_MIN_ENTRANTS) {
    throw new Error(`Group Stage + Knockout needs at least ${GROUP_KNOCKOUT_MIN_ENTRANTS} entrants.`);
  }

  const groupCount = groupCountFor(teams.length);
  // Snake order (A B B A A B ...) so the strongest entrants are spread out.
  const groups = Array.from({ length: groupCount }, () => []);
  teams.forEach((team, index) => {
    const lap = Math.floor(index / groupCount);
    const slot = index % groupCount;
    groups[lap % 2 === 0 ? slot : groupCount - 1 - slot].push(team);
  });

  const matches = [];
  let groupRounds = 0;
  groups.forEach((members, groupIndex) => {
    const label = GROUP_LABELS[groupIndex];
    const roundRobin = generateRoundRobinBracket(members);
    groupRounds = Math.max(groupRounds, roundRobin.totalRounds);
    roundRobin.matches.forEach((match) => {
      matches.push({ ...match, id: `G${label}-R${match.round}-M${match.position + 1}`, bracket: `group-${label}`, stage: 'group', group: label });
    });
  });

  // First of one group meets second of the next, with the two halves of the
  // draw arranged so group winners can only meet again in the final.
  const pairings = groupCount === 2
    ? [['A', 'B'], ['B', 'A']]
    : [['A', 'B'], ['C', 'D'], ['B', 'A'], ['D', 'C']];
  const knockoutRounds = Math.log2(groupCount * 2);
  for (let step = 1; step <= knockoutRounds; step += 1) {
    const count = (groupCount * 2) / (2 ** step);
    for (let position = 0; position < count; position += 1) {
      const first = step === 1;
      matches.push({
        id: `KO-R${step}-M${position + 1}`,
        bracket: 'knockout',
        stage: 'knockout',
        round: groupRounds + step,
        position,
        team1: null,
        team2: null,
        source1: first ? { group: pairings[position][0], rank: 1 } : null,
        source2: first ? { group: pairings[position][1], rank: 2 } : null,
        placeholder1: first ? `Winner of Group ${pairings[position][0]}` : 'Winner of previous match',
        placeholder2: first ? `Runner-up of Group ${pairings[position][1]}` : 'Winner of previous match',
        score1: 0,
        score2: 0,
        winner: null,
        status: 'pending',
        scheduledDate: null,
        completedDate: null,
      });
    }
  }

  return {
    teams,
    matches,
    rounds: buildGroupKnockoutRounds(matches),
    standings: calculateGroupStandings(matches, teams),
    totalRounds: groupRounds + knockoutRounds,
    totalSlots: teams.length,
    byes: 0,
    currentRound: 1,
    champion: null,
  };
}

export function updateGroupKnockoutMatch(tournament, matchId, updates = {}, options = {}) {
  const finalize = Boolean(options.finalize);
  const matches = (tournament.matches || []).map((match) => (match.id === matchId ? { ...match, ...updates } : { ...match }));
  const current = matches.find((match) => match.id === matchId);
  if (!current) return tournament;
  const totalRounds = Number(tournament.totalRounds || 0);

  if (current.stage === 'group') {
    if (matches.some((match) => match.stage === 'knockout' && match.status === 'completed')) {
      throw new Error('Group stage results can no longer change once the knockout has started.');
    }
    if (finalize) {
      const score1 = Number(current.score1 || 0);
      const score2 = Number(current.score2 || 0);
      current.winner = score1 > score2 ? current.team1 : score2 > score1 ? current.team2 : null;
      current.status = 'completed';
      current.completedDate = new Date().toISOString();
    }
  } else if (finalize) {
    if (!current.team1 || !current.team2) {
      throw new Error('Both slots must be filled before saving this match.');
    }
    const score1 = Number(current.score1 || 0);
    const score2 = Number(current.score2 || 0);
    if (score1 === score2) {
      throw new Error('Knockout matches cannot end in a tie.');
    }
    current.winner = score1 > score2 ? current.team1 : current.team2;
    current.status = 'completed';
    current.completedDate = new Date().toISOString();

    if (Number(current.round) < totalRounds) {
      const next = matches.find((match) =>
        match.stage === 'knockout' &&
        Number(match.round) === Number(current.round) + 1 &&
        match.position === Math.floor(current.position / 2)
      );
      if (next) {
        next[current.position % 2 === 0 ? 'team1' : 'team2'] = current.winner;
        if (next.status !== 'completed') next.status = next.team1 && next.team2 ? 'scheduled' : 'pending';
      }
    }
  }

  const standings = calculateGroupStandings(matches, tournament.teams || []);
  if (current.stage === 'group') seedKnockoutFromGroups(matches, standings);

  const nextTournament = { ...tournament, matches, standings, rounds: buildGroupKnockoutRounds(matches) };
  return { ...nextTournament, champion: finalize ? calculateChampion(nextTournament) : tournament.champion };
}

// Placements for Group Stage + Knockout: knockout teams first, by how far they
// went (same tie-breaks as single elimination); then everyone who did not get
// out of their group, by group rank, points and score difference.
function calculateGroupKnockoutPlacements(tournament, teams, matches, final) {
  const totalRounds = Number(tournament.totalRounds || 0);
  const groupRow = new Map(calculateGroupStandings(matches, teams).map((row) => [String(row.teamId), row]));
  const table = new Map(teams.map((team) => [String(team.id), {
    id: String(team.id), name: team.name, seed: team.seed,
    wins: 0, losses: 0, scoreFor: 0, scoreAgainst: 0,
    eliminatedRound: null, lossMargin: 0, inKnockout: false,
  }]));

  matches.filter((match) => match.status === 'completed').forEach((match) => {
    const score1 = Number(match.score1 || 0);
    const score2 = Number(match.score2 || 0);
    [[match.team1, score1, score2], [match.team2, score2, score1]].forEach(([team, scored, conceded]) => {
      const row = team ? table.get(String(team.id)) : null;
      if (!row) return;
      row.scoreFor += scored;
      row.scoreAgainst += conceded;
      if (scored > conceded) row.wins += 1;
      if (scored < conceded) row.losses += 1;
      if (match.stage === 'knockout' && match.winner && String(match.winner.id) !== String(team.id)) {
        row.eliminatedRound = Number(match.round || 0);
        row.lossMargin = conceded - scored;
      }
    });
  });
  matches.filter((match) => match.stage === 'knockout').forEach((match) => {
    [match.team1, match.team2].forEach((team) => {
      const row = team ? table.get(String(team.id)) : null;
      if (row) row.inKnockout = true;
    });
  });

  const reach = (row) => {
    if (!row.inKnockout) return 0;
    if (row.eliminatedRound !== null) return row.eliminatedRound;
    return final ? totalRounds + 1 : totalRounds + 0.5;
  };
  const groupOf = (row) => groupRow.get(row.id) || { rank: 99, points: 0, scoreDifference: 0 };

  return Array.from(table.values())
    .sort((left, right) =>
      reach(right) - reach(left) ||
      left.lossMargin - right.lossMargin ||
      groupOf(left).rank - groupOf(right).rank ||
      groupOf(right).points - groupOf(left).points ||
      groupOf(right).scoreDifference - groupOf(left).scoreDifference ||
      left.seed - right.seed
    )
    .map(({ lossMargin, inKnockout, ...row }, index) => ({
      ...row,
      // "Out in round N" only makes sense for a knockout exit.
      eliminatedRound: inKnockout ? row.eliminatedRound : null,
      group: groupRow.get(row.id)?.group || null,
      placement: index + 1,
      final,
    }));
}

// ---- one entry point per action, so callers never branch on the format ----
export function generateBracketFor(bracketType, entrants = []) {
  if (bracketType === 'round-robin') return generateRoundRobinBracket(entrants);
  if (bracketType === 'group-knockout') return generateGroupKnockoutBracket(entrants);
  return generateSingleEliminationBracket(entrants);
}

export function updateBracketMatch(tournament, matchId, updates = {}, options = {}) {
  if (tournament.bracketType === 'round-robin') return updateRoundRobinMatch(tournament, matchId, updates, options);
  if (tournament.bracketType === 'group-knockout') return updateGroupKnockoutMatch(tournament, matchId, updates, options);
  return updateSingleEliminationMatch(tournament, matchId, updates, options);
}

// League-style matches are saved with a button and may be drawn; knockout
// matches need a winner.
export function isLeagueMatch(tournament, match) {
  return tournament?.bracketType === 'round-robin' || match?.stage === 'group';
}

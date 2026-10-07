// Builds the one report object every Reports surface reads from — the list,
// the report page, the PDF and the CSV. Final scores and ranks are NOT
// recomputed here: they come from scoreStore's calculateLeaderboard, the same
// function the leaderboard, dashboards and certificates use, so the numbers
// can never drift between screens. Bracket placements likewise come from
// calculateBracketPlacements in the bracket engine.
import { calculateBracketPlacements } from './bracketEngine';

const TOURNAMENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];

const EVENT_TYPE_LABELS = {
  tournament: 'Tournament',
  sportsfest: 'Sports Fest',
  esports: 'Esports',
  sports: 'Sports',
  singing: 'Singing Contest',
  pageant: 'Pageant',
  dance: 'Dance Contest',
  academic: 'Academic Contest',
  contest: 'General Contest',
};

const PLACEMENTS = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' };
const AWARDS = { 1: 'Champion', 2: '1st Runner-Up', 3: '2nd Runner-Up' };

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

export function ordinal(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

export function getPlacementLabel(rank) {
  if (!rank) return '—';
  return PLACEMENTS[rank] || `${ordinal(rank)} Place`;
}

export function getEventTypeLabel(type) {
  if (!type) return 'Event';
  return EVENT_TYPE_LABELS[type] || String(type).replace(/(^|[-_\s])(\w)/g, (_, gap, letter) => `${gap ? ' ' : ''}${letter.toUpperCase()}`).trim();
}

function parseRange(scoringRange) {
  const numbers = String(scoringRange || '1-10').match(/\d+(\.\d+)?/g) || [];
  const max = Number(numbers[numbers.length - 1]) || 10;
  const min = numbers.length > 1 ? Number(numbers[0]) || 0 : 0;
  return { min, max };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sameText(left, right) {
  const a = String(left ?? '').trim().toLowerCase();
  return a !== '' && a === String(right ?? '').trim().toLowerCase();
}

function combineDateTime(date, time) {
  if (!date) return null;
  const day = String(date).slice(0, 10);
  const parsed = new Date(time ? `${day}T${time}` : date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatReportDate(value, withTime = false) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' });
}

function findRegistration(registrations, contestant) {
  return registrations.find((registration) => (
    (contestant.email && sameText(registration.email, contestant.email)) ||
    sameText(registration.participantName, contestant.name) ||
    sameText(registration.teamName, contestant.name)
  )) || null;
}

function buildTournamentSection(event, tournaments) {
  const related = tournaments.filter((tournament) => String(tournament.eventId) === String(event.id));
  const brackets = related.map((tournament) => {
    const matches = (tournament.matches || []).filter((match) => match.status !== 'bye');
    return {
      id: tournament.id,
      title: tournament.subEventName || tournament.title || tournament.name || 'Bracket',
      bracketType: tournament.bracketType,
      totalRounds: Number(tournament.totalRounds || 0),
      teams: (tournament.teams || []).length,
      champion: tournament.champion?.name || '',
      isFinalized: Boolean(tournament.isFinalized),
      finalizedAt: tournament.finalizedAt || null,
      standings: calculateBracketPlacements(tournament),
      matches: matches
        .map((match) => ({
          id: match.id,
          stage: match.stage || '',
          group: match.group || '',
          round: Number(match.round || 0),
          team1: match.team1?.name || 'TBD',
          team2: match.team2?.name || 'TBD',
          score1: match.score1 ?? null,
          score2: match.score2 ?? null,
          winner: match.winner?.name || '',
          status: match.status || 'pending',
          completedDate: match.completedDate || null,
        }))
        .sort((left, right) => left.round - right.round),
    };
  });
  const allMatches = brackets.flatMap((bracket) => bracket.matches);

  return {
    brackets,
    totalMatches: allMatches.length,
    completedMatches: allMatches.filter((match) => match.status === 'completed').length,
    totalRounds: brackets.reduce((max, bracket) => Math.max(max, bracket.totalRounds), 0),
    teams: brackets.reduce((sum, bracket) => sum + bracket.teams, 0),
    champions: brackets.filter((bracket) => bracket.champion).map((bracket) => ({ bracket: bracket.title, name: bracket.champion })),
  };
}

export function buildEventReport({
  event,
  scores = [],
  assignedJudges = [],
  leaderboard = [],
  calculateWeightedTotal,
  tournaments = [],
  registrations = [],
  attendance = null,
}) {
  if (!event) return null;

  const criteria = (event.criteria || []).map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    weight: Number(criterion.weight || 0),
    description: criterion.description || '',
    ...parseRange(criterion.scoringRange),
  }));
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0) || 100;
  // Highest weighted total a single judge can award under the event's rubric.
  const maxScore = criteria.length
    ? round2(criteria.reduce((sum, criterion) => sum + (criterion.max * criterion.weight) / totalWeight, 0))
    : 0;
  const weightedTotal = (criteriaScores) => (
    calculateWeightedTotal ? calculateWeightedTotal(event.criteria || [], criteriaScores || {}).totalScore : 0
  );

  // ---- Judges: everyone assigned, plus anyone who actually submitted ----
  const judgeMap = new Map();
  assignedJudges.forEach((judge) => {
    if (!judge) return;
    judgeMap.set(`j:${judge.id}`, { key: `j:${judge.id}`, id: judge.id, name: judge.name || 'Judge', email: judge.email || '', assigned: true });
  });
  const judgeKeyForScore = (score) => {
    const match = assignedJudges.find((judge) => judge && (
      sameText(judge.id, score.judgeId) || sameText(judge.email, score.judgeId)
    ));
    if (match) return `j:${match.id}`;
    const key = `x:${String(score.judgeId ?? score.judgeName ?? 'unknown').toLowerCase()}`;
    if (!judgeMap.has(key)) {
      // Older score rows carry no judge name; the id is then the judge's
      // email (or business id), which still tells the organizer who it was.
      const isEmail = String(score.judgeId || '').includes('@');
      const hasName = score.judgeName && score.judgeName !== 'Judge';
      const name = hasName ? score.judgeName : isEmail ? String(score.judgeId) : score.judgeId ? `Judge ${score.judgeId}` : 'Judge';
      judgeMap.set(key, { key, id: score.judgeId, name, email: isEmail ? String(score.judgeId) : '', assigned: false });
    }
    return key;
  };

  // ---- Evaluations: one per (judge, participant) score row ----
  const evaluations = scores.map((score) => {
    const criteriaScores = score.criteriaScores || {};
    const breakdown = criteria.map((criterion) => {
      const raw = criteriaScores[criterion.id] ?? criteriaScores[criterion.name];
      const value = Number(raw ?? 0);
      return {
        criterionId: criterion.id,
        name: criterion.name,
        weight: criterion.weight,
        max: criterion.max,
        score: value,
        percent: criterion.max ? round2((value / criterion.max) * 100) : 0,
      };
    });
    return {
      judgeKey: judgeKeyForScore(score),
      contestantId: String(score.contestantId),
      contestantName: score.contestantName,
      total: weightedTotal(criteriaScores),
      breakdown,
      remarks: score.remarks || '',
      locked: Boolean(score.locked),
      timestamp: score.timestamp || null,
    };
  });
  const judges = Array.from(judgeMap.values());
  // Two judges can share a display name; tell them apart by email or id so
  // their columns are never mistaken for one another.
  const nameCounts = new Map();
  judges.forEach((judge) => nameCounts.set(judge.name.toLowerCase(), (nameCounts.get(judge.name.toLowerCase()) || 0) + 1));
  judges.forEach((judge) => {
    const distinguisher = judge.email || judge.id;
    if (nameCounts.get(judge.name.toLowerCase()) > 1 && distinguisher && !sameText(distinguisher, judge.name)) {
      judge.name = `${judge.name} (${distinguisher})`;
    }
  });

  // ---- Participants: the event roster, plus anyone only present in scores ----
  const eliminated = new Set((event.eliminatedContestantIds || []).map(String));
  const leaderboardById = new Map(leaderboard.map((entry) => [String(entry.contestantId), entry]));
  const roster = (event.contestants || []).map((contestant) => ({ ...contestant, id: String(contestant.id) }));
  const rosterIds = new Set(roster.map((contestant) => contestant.id));
  leaderboard.forEach((entry) => {
    const id = String(entry.contestantId);
    if (!rosterIds.has(id)) {
      roster.push({ id, name: entry.contestantName, type: 'participant', members: [], number: null });
      rosterIds.add(id);
    }
  });

  // Bracket placements, by entrant id, for events decided by matches.
  const tournament = buildTournamentSection(event, tournaments);
  const bracketStanding = new Map();
  const bracketStandingByName = [];
  tournament.brackets.forEach((bracket) => {
    bracket.standings.forEach((row) => {
      const entry = { ...row, bracket: bracket.title };
      bracketStanding.set(row.id, entry);
      bracketStandingByName.push(entry);
    });
  });
  // Bracket entrants are seeded from team or registration records, whose ids
  // can differ from the id on the event roster — so fall back to the name,
  // within the same sub-event when the event has several brackets.
  const findBracketRow = (contestant) => bracketStanding.get(contestant.id) || bracketStandingByName.find((entry) => (
    sameText(entry.name, contestant.name) &&
    (!contestant.subEventName || tournament.brackets.length <= 1 || String(entry.bracket).toLowerCase().includes(String(contestant.subEventName).toLowerCase()))
  )) || null;

  const participants = roster.map((contestant) => {
    const own = evaluations.filter((evaluation) => evaluation.contestantId === contestant.id);
    const byJudge = {};
    own.forEach((evaluation) => { byJudge[evaluation.judgeKey] = evaluation; });
    const standing = leaderboardById.get(contestant.id) || null;
    const registration = findRegistration(registrations, contestant);
    const isTeam = contestant.type === 'team' || (contestant.members || []).length > 0;
    const team = contestant.team || contestant.schoolOrganization || registration?.schoolOrganization ||
      (registration?.teamName && !sameText(registration.teamName, contestant.name) ? registration.teamName : '');
    const scoredBy = Object.keys(byJudge).length;
    const bracketRow = standing ? null : findBracketRow(contestant);
    const rank = standing?.rank || (bracketRow?.final ? bracketRow.placement : null);

    let status = 'Not scored';
    if (eliminated.has(contestant.id)) status = 'Eliminated';
    else if (scoredBy > 0 && scoredBy >= judges.length) status = 'Scored';
    else if (scoredBy > 0) status = 'Partially scored';
    else if (bracketRow) status = bracketRow.final ? 'Finished' : 'In progress';

    return {
      id: contestant.id,
      name: contestant.name || standing?.contestantName || `Contestant ${contestant.id}`,
      number: contestant.number || null,
      type: isTeam ? 'Team' : 'Individual',
      team,
      members: Array.isArray(contestant.members) ? contestant.members : [],
      bracket: bracketRow ? bracketRow.bracket : (contestant.subEventName || ''),
      record: bracketRow ? `${bracketRow.wins}–${bracketRow.losses}` : '',
      byJudge,
      evaluations: own,
      scoredBy,
      total: own.length ? round2(own.reduce((sum, evaluation) => sum + evaluation.total, 0)) : null,
      average: standing && own.length ? standing.judgeAverage : null,
      audienceAverage: standing?.audienceSubmissions ? standing.audienceAverage : null,
      audienceSubmissions: standing?.audienceSubmissions || 0,
      final: standing ? standing.averageScore : null,
      rank,
      placement: getPlacementLabel(rank),
      award: rank ? (AWARDS[rank] || '') : '',
      status,
    };
  }).sort((left, right) => {
    // A sports fest has one ranking per sport; keep each sport together.
    if (left.bracket !== right.bracket) return String(left.bracket).localeCompare(String(right.bracket));
    if (left.rank && right.rank) return left.rank - right.rank;
    if (left.rank) return -1;
    if (right.rank) return 1;
    return String(left.name).localeCompare(String(right.name));
  });

  const ranked = participants.filter((participant) => participant.rank);

  // ---- Judge analysis ----
  const judgeAnalysis = judges.map((judge) => {
    const own = evaluations.filter((evaluation) => evaluation.judgeKey === judge.key);
    const totals = own.map((evaluation) => evaluation.total);
    const scoredIds = new Set(own.map((evaluation) => evaluation.contestantId));
    return {
      ...judge,
      scored: scoredIds.size,
      expected: participants.length,
      completion: participants.length ? Math.min(100, round2((scoredIds.size / participants.length) * 100)) : 0,
      average: totals.length ? round2(average(totals)) : null,
      highest: totals.length ? Math.max(...totals) : null,
      lowest: totals.length ? Math.min(...totals) : null,
      criteriaAverages: criteria.map((criterion) => {
        const values = own.map((evaluation) => evaluation.breakdown.find((item) => item.criterionId === criterion.id)?.score ?? 0);
        return { criterionId: criterion.id, name: criterion.name, max: criterion.max, average: values.length ? round2(average(values)) : null };
      }),
      evaluations: own,
    };
  });

  // ---- Criteria analysis ----
  const criteriaAnalysis = criteria.map((criterion) => {
    const values = evaluations.map((evaluation) => evaluation.breakdown.find((item) => item.criterionId === criterion.id)?.score ?? 0);
    const mean = values.length ? round2(average(values)) : null;
    return {
      ...criterion,
      average: mean,
      percent: mean !== null && criterion.max ? round2((mean / criterion.max) * 100) : null,
      highest: values.length ? Math.max(...values) : null,
      lowest: values.length ? Math.min(...values) : null,
      count: values.length,
    };
  });
  const scoredCriteria = criteriaAnalysis.filter((criterion) => criterion.percent !== null);
  const strongestCriterion = scoredCriteria.length > 1
    ? scoredCriteria.reduce((best, criterion) => (criterion.percent > best.percent ? criterion : best))
    : null;
  const weakestCriterion = scoredCriteria.length > 1
    ? scoredCriteria.reduce((worst, criterion) => (criterion.percent < worst.percent ? criterion : worst))
    : null;

  // ---- Statistics ----
  const scoredRanked = ranked.filter((participant) => participant.final !== null);
  const finals = scoredRanked.map((participant) => participant.final);
  const expectedEvaluations = judges.length * participants.length;
  const binCount = 10;
  const distribution = maxScore > 0
    ? Array.from({ length: binCount }, (_, index) => {
        const from = round2((maxScore / binCount) * index);
        const to = round2((maxScore / binCount) * (index + 1));
        return {
          label: `${from}–${to}`,
          count: finals.filter((value) => (index === binCount - 1 ? value >= from : value >= from && value < to)).length,
        };
      })
    : [];

  const stats = {
    totalParticipants: participants.length,
    totalJudges: judges.length,
    totalTeams: participants.filter((participant) => participant.type === 'Team').length,
    scoresSubmitted: evaluations.length,
    expectedEvaluations,
    completedEvaluations: evaluations.length,
    pendingEvaluations: Math.max(0, expectedEvaluations - evaluations.length),
    lockedEvaluations: evaluations.filter((evaluation) => evaluation.locked).length,
    averageScore: finals.length ? round2(average(finals)) : null,
    highestScore: finals.length ? Math.max(...finals) : null,
    lowestScore: finals.length ? Math.min(...finals) : null,
    highestParticipant: scoredRanked[0] || null,
    lowestParticipant: scoredRanked.length ? scoredRanked[scoredRanked.length - 1] : null,
    maxScore,
    distribution,
  };

  // ---- Event information ----
  const isTournament = tournament.brackets.length > 0 ||
    event.competitionMode === 'tournament' ||
    (!event.competitionMode && TOURNAMENT_TYPES.includes(event.type) && criteria.length === 0);
  const isCompleted = event.status === 'completed';
  const hasResults = evaluations.length > 0 || tournament.completedMatches > 0;
  const reportStatus = isCompleted ? 'final' : hasResults ? 'preliminary' : 'pending';
  const savedReport = (Array.isArray(event.metadata?.generatedReports) ? event.metadata.generatedReports : [])
    .find((entry) => entry.category === 'event-report') || null;
  const audienceEnabled = Boolean(event.audienceImpactEnabled ?? event.audienceImpact);
  // A sports fest crowns one champion per sport, so there is no single name.
  const champion = scoredRanked[0]?.name ||
    (tournament.champions.length > 1 ? 'One per sport (see brackets)' : tournament.champions[0]?.name || '');

  return {
    event,
    info: {
      id: event.id,
      title: event.title,
      category: getEventTypeLabel(event.type),
      status: event.status || 'draft',
      start: combineDateTime(event.startDate, event.startTime),
      end: combineDateTime(event.endDate || event.startDate, event.endTime),
      venue: event.location || '',
      organizerEmail: event.organizerEmail || '',
      scoringMethod: event.scoringMethod || (criteria.length ? 'Weighted Rubric' : ''),
      audienceEnabled,
      audienceWeight: audienceEnabled ? Math.min(Math.max(Number(event.audienceImpactWeight || 10), 0), 100) : 0,
      isCompleted,
      completionLabel: isCompleted ? 'Completed' : hasResults ? 'In progress' : 'Not started',
    },
    isTournament,
    isJudged: criteria.length > 0 || evaluations.length > 0,
    reportStatus,
    lastGeneratedAt: savedReport?.savedAt || null,
    champion,
    criteria,
    judges,
    participants,
    ranked,
    evaluations,
    judgeAnalysis,
    criteriaAnalysis,
    strongestCriterion,
    weakestCriterion,
    stats,
    tournament,
    attendance,
  };
}

function csvCell(value) {
  let text = String(value ?? '');
  // Leading = + - @ would be run as a formula when the file is opened in Excel.
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One row per criterion score — the rawest form of the data, for re-checking
// the totals in a spreadsheet.
export function buildScoresCsv(report) {
  const header = ['Event', 'Rank', 'Participant', 'Number', 'Team / Organization', 'Judge', 'Criterion', 'Weight (%)', 'Max Points', 'Score', 'Judge Weighted Total', 'Average Score', 'Final Score', 'Locked'];
  const rows = [];
  report.participants.forEach((participant) => {
    participant.evaluations.forEach((evaluation) => {
      const judge = report.judges.find((entry) => entry.key === evaluation.judgeKey);
      const items = evaluation.breakdown.length ? evaluation.breakdown : [{ name: '', weight: '', max: '', score: '' }];
      items.forEach((item) => {
        rows.push([
          report.info.title, participant.rank || '', participant.name, participant.number || '', participant.team,
          judge?.name || 'Judge', item.name, item.weight, item.max, item.score,
          evaluation.total, participant.average ?? '', participant.final ?? '', evaluation.locked ? 'Yes' : 'No',
        ]);
      });
    });
    if (participant.evaluations.length === 0) {
      rows.push([report.info.title, '', participant.name, participant.number || '', participant.team, '', '', '', '', '', '', '', '', '']);
    }
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function buildReportJson(report) {
  return JSON.stringify({
    event: {
      id: report.info.id,
      title: report.info.title,
      category: report.info.category,
      status: report.info.status,
      start: report.info.start,
      end: report.info.end,
      venue: report.info.venue,
    },
    reportStatus: report.reportStatus,
    statistics: { ...report.stats, highestParticipant: report.stats.highestParticipant?.name || null, lowestParticipant: report.stats.lowestParticipant?.name || null },
    criteria: report.criteriaAnalysis,
    judges: report.judgeAnalysis.map(({ evaluations, ...judge }) => judge),
    rankings: report.participants.map((participant) => ({
      rank: participant.rank,
      participant: participant.name,
      number: participant.number,
      team: participant.team,
      total: participant.total,
      average: participant.average,
      final: participant.final,
      placement: participant.placement,
      award: participant.award,
      status: participant.status,
      judgeScores: participant.evaluations.map((evaluation) => ({
        judge: report.judges.find((judge) => judge.key === evaluation.judgeKey)?.name || 'Judge',
        total: evaluation.total,
        criteria: evaluation.breakdown.map(({ name, score, max, weight }) => ({ name, score, max, weight })),
      })),
    })),
    tournament: report.tournament,
    attendance: report.attendance,
  }, null, 2);
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function sumCriteriaWeights(criteria = []) {
  return toArray(criteria).reduce((total, criterion) => total + Number(criterion.weight || 0), 0);
}

export function getContestantCount(event, teams = []) {
  if (Array.isArray(event?.contestants) && event.contestants.length > 0) {
    return event.contestants.length;
  }

  if (teams.length > 0) {
    return teams.filter((team) => String(team.eventId) === String(event?.id)).length;
  }

  return Number(event?.participants || 0);
}

export function buildLeaderboardFromScores(scores = [], criteria = []) {
  const totalWeight = sumCriteriaWeights(criteria) || 100;
  const buckets = {};

  scores.forEach((score) => {
    if (!buckets[score.contestantId]) {
      buckets[score.contestantId] = {
        contestantId: score.contestantId,
        contestantName: score.contestantName || `Contestant ${score.contestantId}`,
        total: 0,
        count: 0,
      };
    }

    const totalScore = toArray(criteria).reduce((sum, criterion) => {
      const raw = Number(
        score.criteriaScores?.[criterion.id] ??
          score.criteriaScores?.[criterion.name] ??
          0
      );
      return sum + (raw * Number(criterion.weight || 0)) / totalWeight;
    }, 0);

    buckets[score.contestantId].total += totalScore;
    buckets[score.contestantId].count += 1;
  });

  return Object.values(buckets)
    .map((entry) => ({
      ...entry,
      averageScore: entry.count ? Math.round((entry.total / entry.count) * 100) / 100 : 0,
    }))
    .sort((left, right) => right.averageScore - left.averageScore)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function buildSystemAnalytics({
  events = [],
  judges = [],
  assignments = [],
  teams = [],
  scores = [],
  certificates = [],
  users = [],
  tournaments = [],
} = {}) {
  const now = Date.now();
  const activeEvents = events.filter((event) => ['active', 'upcoming'].includes(event.status));
  const completedEvents = events.filter((event) => event.status === 'completed');
  const generatedCertificates = certificates.filter((certificate) => certificate.status === 'generated');
  const activeJudges = judges.filter((judge) =>
    assignments.some((assignment) => String(assignment.judgeId) === String(judge.id))
  );

  const scoresLast30Days = scores.filter((score) => {
    const timestamp = new Date(score.timestamp || score.updatedAt || score.createdAt || 0).getTime();
    return now - timestamp <= 30 * 24 * 60 * 60 * 1000;
  });

  const eventsLast30Days = events.filter((event) => {
    const timestamp = new Date(event.created_at || event.createdAt || 0).getTime();
    return now - timestamp <= 30 * 24 * 60 * 60 * 1000;
  });

  const scoreAverage = scores.length
    ? Math.round(
        (scores.reduce((total, score) => {
          const values = Object.values(score.criteriaScores || {}).map((value) => Number(value || 0));
          const average = values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0;
          return total + average;
        }, 0) /
          scores.length) *
          100
      ) / 100
    : 0;

  return {
    totalUsers: users.length,
    totalEvents: events.length,
    activeEvents: activeEvents.length,
    completedEvents: completedEvents.length,
    totalScores: scores.length,
    totalTeams: teams.length,
    totalJudges: judges.length,
    activeJudges: activeJudges.length,
    totalCertificates: generatedCertificates.length,
    totalTournaments: tournaments.length,
    monthlyScores: scoresLast30Days.length,
    monthlyEvents: eventsLast30Days.length,
    averageScore: scoreAverage,
    completionRate: events.length ? Math.round((completedEvents.length / events.length) * 100) : 0,
  };
}

// The one place contest results are computed (W02). Leaderboards, reports,
// certificates and round advancement all read from here, so a result can be
// traced back to one formula:
//
//   1. Sheet total (one judge, one contestant), from the raw criterion scores:
//        T = Σ(score_i × weight_i) / Σ(weight_i)
//      or the plain average of the scores when no weights are set.
//      Nothing is rounded at this step.
//   2. Judge average J = mean of the sheet totals, one sheet per judging seat
//      (the latest sheet in that seat; voided sheets do not count). A seat is
//      a judge position — a replacement judge continues the seat of the judge
//      they replaced, so no position is counted twice.
//   3. Audience (only when enabled for the event): votes are 1–10, so their
//      mean A is stretched to the rubric's own scale first:
//        A' = A × (rubric maximum / 10)
//      where the rubric maximum is Σ(max_i × weight_i) / Σ(weight_i).
//   4. Final score F = J × (1 − p) + A' × p, with p = audience weight / 100
//      (p = 0 when audience voting is off). Rounded once, to 2 decimals,
//      half away from zero.
//   5. Ranking: higher F first. Equal F (to 2 decimals) is a tie. A tie is
//      broken by the event's tie-breaker when it names a criterion (higher
//      judge average on that criterion wins); otherwise tied contestants share
//      the rank (1, 1, 3).
//   6. Missing sheets are never filled in with zero. A contestant with fewer
//      sheets than the number of judging seats is marked incomplete, and the
//      ranking is provisional until every sheet is in.

export function roundHalfAway(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** decimals;
  return (Math.sign(number) * Math.round(Math.abs(number) * factor + Number.EPSILON * factor)) / factor;
}

// '1-10' → { min: 1, max: 10 }; '0 – 100' → { min: 0, max: 100 }; '' → 1–10.
export function parseScoringRange(range) {
  const numbers = String(range ?? '').match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (numbers.length === 0) return { min: 1, max: 10 };
  if (numbers.length === 1) return { min: 0, max: numbers[0] };
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

function weightOf(criterion) {
  const weight = Number(criterion?.weight);
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

function criterionValue(scores, criterion) {
  const raw = scores?.[criterion.id] ?? scores?.[criterion.name];
  if (raw === '' || raw === null || raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// The highest final score the rubric allows (step 3's scale).
export function rubricMaximum(criteria = []) {
  if (!Array.isArray(criteria) || criteria.length === 0) return 10;
  const totalWeight = criteria.reduce((sum, criterion) => sum + weightOf(criterion), 0);
  if (totalWeight === 0) {
    return criteria.reduce((sum, criterion) => sum + parseScoringRange(criterion.scoringRange).max, 0) / criteria.length;
  }
  return criteria.reduce((sum, criterion) => sum + parseScoringRange(criterion.scoringRange).max * weightOf(criterion), 0) / totalWeight;
}

// Step 1. Returns null when the sheet has no usable criterion scores.
export function sheetTotal(criteria = [], criteriaScores = {}) {
  let weighted = 0;
  let weights = 0;
  let plain = 0;
  let count = 0;
  (criteria || []).forEach((criterion) => {
    const value = criterionValue(criteriaScores, criterion);
    if (value === null) return;
    weighted += value * weightOf(criterion);
    weights += weightOf(criterion);
    plain += value;
    count += 1;
  });
  if (count === 0) return null;
  return weights > 0 ? weighted / weights : plain / count;
}

// A criterion's sheet values for one contestant, for tie-breaking.
function criterionAverage(sheets, criterion) {
  const values = sheets.map((sheet) => criterionValue(sheet.criteriaScores, criterion)).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function findTieBreakCriterion(criteria, tieBreaker) {
  const rules = (Array.isArray(tieBreaker) ? tieBreaker : [tieBreaker]).filter(Boolean).map((rule) => String(rule).toLowerCase());
  for (const rule of rules) {
    const match = (criteria || []).find((criterion) => criterion.name && rule.includes(String(criterion.name).toLowerCase()));
    if (match) return match;
  }
  return null;
}

function seatOf(score) {
  return String(score.seatId || score.seat_id || score.judgeId || score.judge_id || score.id);
}

function timeOf(score) {
  const time = new Date(score.timestamp || score.updated_at || score.updatedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Computes the ranked results of one judged event.
 *
 * @param {object} input
 * @param {Array} input.criteria         the rubric the sheets were scored with
 * @param {Array} input.scores           score rows ({ contestantId, seatId|judgeId, criteriaScores, timestamp, voided })
 * @param {object} [input.audience]      { enabled, weight (0–100), byContestant: { [id]: { averageScore, count } } }
 * @param {number} [input.expectedSeats] judging seats for this event; defaults to the most sheets any contestant has
 * @param {Array|string} [input.tieBreaker]
 * @param {object} [input.names]         { [contestantId]: name }
 * @param {Array} [input.contestantIds]  contestants to include even without sheets
 */
export function computeEventResults({
  criteria = [],
  scores = [],
  audience = {},
  expectedSeats,
  tieBreaker,
  names = {},
  contestantIds = [],
} = {}) {
  const audienceEnabled = Boolean(audience?.enabled);
  const audienceWeight = audienceEnabled ? Math.min(Math.max(Number(audience?.weight ?? 10), 0), 100) : 0;
  const judgeWeight = 100 - audienceWeight;
  const scale = rubricMaximum(criteria) / 10;

  // Step 2: the latest non-voided sheet per contestant and seat.
  const latest = new Map();
  (scores || []).forEach((score) => {
    if (score?.voided) return;
    const contestantId = String(score.contestantId ?? score.contestant_id ?? '');
    if (!contestantId) return;
    const key = `${contestantId}::${seatOf(score)}`;
    const current = latest.get(key);
    if (!current || timeOf(score) >= timeOf(current)) latest.set(key, score);
  });

  const byContestant = new Map();
  const ensure = (id) => {
    const key = String(id);
    if (!byContestant.has(key)) byContestant.set(key, { contestantId: key, sheets: [] });
    return byContestant.get(key);
  };
  contestantIds.forEach((id) => ensure(id));
  Object.keys(audience?.byContestant || {}).forEach((id) => ensure(id));
  latest.forEach((score) => {
    const total = sheetTotal(criteria, score.criteriaScores || score.criteria_scores || {});
    if (total === null) return;
    ensure(score.contestantId ?? score.contestant_id).sheets.push({
      seatId: seatOf(score),
      judgeName: score.judgeName || score.judge_name || 'Judge',
      criteriaScores: score.criteriaScores || score.criteria_scores || {},
      total,
    });
  });

  const seats = Number.isFinite(Number(expectedSeats)) && Number(expectedSeats) > 0
    ? Number(expectedSeats)
    : Math.max(0, ...Array.from(byContestant.values()).map((row) => row.sheets.length));

  const rows = Array.from(byContestant.values()).map((row) => {
    const judgeAverageRaw = row.sheets.length
      ? row.sheets.reduce((sum, sheet) => sum + sheet.total, 0) / row.sheets.length
      : 0;
    const votes = audience?.byContestant?.[row.contestantId] || null;
    const audienceAverage = Number(votes?.averageScore || 0);
    const audienceScaled = audienceAverage * scale;
    // Step 4.
    const finalRaw = (judgeAverageRaw * judgeWeight + audienceScaled * audienceWeight) / 100;
    return {
      contestantId: row.contestantId,
      contestantName: names[row.contestantId] || `Contestant ${row.contestantId}`,
      judgeAverage: roundHalfAway(judgeAverageRaw),
      audienceAverage: roundHalfAway(audienceAverage),
      audienceScaled: roundHalfAway(audienceScaled),
      audienceSubmissions: Number(votes?.count || 0),
      averageScore: roundHalfAway(finalRaw),
      finalScore: roundHalfAway(finalRaw),
      judgeWeight,
      audienceWeight,
      totalScores: row.sheets.length,
      sheets: row.sheets.map((sheet) => ({ ...sheet, total: roundHalfAway(sheet.total) })),
      missingSheets: Math.max(0, seats - row.sheets.length),
      tieBreakValue: 0,
    };
  });

  // Step 5.
  const tieCriterion = findTieBreakCriterion(criteria, tieBreaker);
  rows.forEach((row) => {
    if (!tieCriterion) return;
    const sheets = byContestant.get(row.contestantId).sheets;
    row.tieBreakValue = roundHalfAway(criterionAverage(sheets, tieCriterion));
  });

  rows.sort((left, right) =>
    right.finalScore - left.finalScore ||
    right.tieBreakValue - left.tieBreakValue ||
    String(left.contestantName).localeCompare(String(right.contestantName))
  );

  let previous = null;
  rows.forEach((row, index) => {
    const tiedWithPrevious = previous
      && previous.finalScore === row.finalScore
      && previous.tieBreakValue === row.tieBreakValue;
    row.rank = tiedWithPrevious ? previous.rank : index + 1;
    if (tiedWithPrevious) {
      previous.tied = true;
      row.tied = true;
    } else {
      row.tied = false;
    }
    previous = row;
  });

  // Step 6.
  const provisional = rows.some((row) => row.missingSheets > 0);
  rows.forEach((row) => {
    row.incomplete = row.missingSheets > 0;
    row.provisional = provisional;
  });

  return {
    rows,
    seats,
    provisional,
    tieBreakCriterion: tieCriterion ? tieCriterion.name : null,
    rubricMaximum: roundHalfAway(rubricMaximum(criteria)),
    audienceWeight,
    judgeWeight,
  };
}

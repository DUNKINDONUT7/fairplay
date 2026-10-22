// W02 — score computation with controlled inputs. Every expected value below
// was worked out by hand (shown in the comments), not by running the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEventResults, parseScoringRange, roundHalfAway, rubricMaximum, sheetTotal } from '../src/utils/scoreComputation.js';

const CRITERIA = [
  { id: 'talent', name: 'Talent', weight: 40, scoringRange: '1-10' },
  { id: 'poise', name: 'Poise', weight: 30, scoringRange: '1-10' },
  { id: 'qa', name: 'Q&A', weight: 30, scoringRange: '1-10' },
];
const sheet = (contestantId, seatId, talent, poise, qa, extra = {}) => ({
  contestantId, seatId, judgeName: seatId, criteriaScores: { talent, poise, qa }, timestamp: '2026-10-22T02:00:00Z', ...extra,
});
const byId = (rows) => Object.fromEntries(rows.map((row) => [row.contestantId, row]));

// A: J1 (8,7,9) → (8×40 + 7×30 + 9×30)/100 = 800/100 = 8.00
//    J2 (9,8,8) → (360 + 240 + 240)/100 = 8.40
//    J3 (7,8,8) → (280 + 240 + 240)/100 = 7.60      J = 24.00/3 = 8.00
// B: J1 (9,9,7) → (360 + 270 + 210)/100 = 8.40
//    J2 (8,8,8) → 8.00
//    J3 (8,7,9) → 8.00                               J = 24.40/3 = 8.1333 → 8.13
const BASE = [
  sheet('A', 'J1', 8, 7, 9), sheet('A', 'J2', 9, 8, 8), sheet('A', 'J3', 7, 8, 8),
  sheet('B', 'J1', 9, 9, 7), sheet('B', 'J2', 8, 8, 8), sheet('B', 'J3', 8, 7, 9),
];

test('weighted sheet total and judge average (no audience)', () => {
  assert.equal(roundHalfAway(sheetTotal(CRITERIA, { talent: 8, poise: 7, qa: 9 })), 8);
  const { rows, provisional } = computeEventResults({ criteria: CRITERIA, scores: BASE });
  const r = byId(rows);
  assert.equal(r.A.averageScore, 8.0);
  assert.equal(r.B.averageScore, 8.13);
  assert.equal(r.B.rank, 1);
  assert.equal(r.A.rank, 2);
  assert.equal(provisional, false);
});

test('audience contribution at the configured weight', () => {
  // 20% audience. Votes: A = 9.5, B = 6.0. Rubric max 10, so no stretch.
  // A: 8.00×0.8 + 9.5×0.2 = 6.40 + 1.90 = 8.30
  // B: 8.1333×0.8 + 6.0×0.2 = 6.5067 + 1.20 = 7.7067 → 7.71
  const { rows } = computeEventResults({
    criteria: CRITERIA,
    scores: BASE,
    audience: { enabled: true, weight: 20, byContestant: { A: { averageScore: 9.5, count: 40 }, B: { averageScore: 6, count: 38 } } },
  });
  const r = byId(rows);
  assert.equal(r.A.averageScore, 8.3);
  assert.equal(r.B.averageScore, 7.71);
  assert.equal(r.A.rank, 1);
  assert.equal(r.A.judgeWeight, 80);
});

test('audience on a 100-point rubric is stretched to that scale (old regex bug)', () => {
  // Rubric 0-100, weights 50/50 → max 100, scale ×10.
  // C: one judge (80, 90) → 85. Audience 8.0 → 80. 10% audience:
  // 85×0.9 + 80×0.1 = 76.5 + 8.0 = 84.50
  // (The old code read every range as 1-10 and gave 85×0.9 + 8×0.1 = 77.30.)
  const criteria = [
    { id: 'a', name: 'Execution', weight: 50, scoringRange: '0-100' },
    { id: 'b', name: 'Creativity', weight: 50, scoringRange: '0 – 100' },
  ];
  assert.deepEqual(parseScoringRange('0 – 100'), { min: 0, max: 100 });
  assert.equal(rubricMaximum(criteria), 100);
  const { rows } = computeEventResults({
    criteria,
    scores: [{ contestantId: 'C', seatId: 'J1', criteriaScores: { a: 80, b: 90 } }],
    audience: { enabled: true, weight: 10, byContestant: { C: { averageScore: 8, count: 10 } } },
  });
  assert.equal(rows[0].averageScore, 84.5);
});

test('a missing sheet is not counted as zero; the ranking is marked provisional', () => {
  // D has 2 of 3 sheets: (8,8,8)=8.00 and (9,9,9)=9.00 → 8.50, not (8+9+0)/3 = 5.67.
  const scores = [...BASE, sheet('D', 'J1', 8, 8, 8), sheet('D', 'J2', 9, 9, 9)];
  const { rows, provisional, seats } = computeEventResults({ criteria: CRITERIA, scores });
  const r = byId(rows);
  assert.equal(seats, 3);
  assert.equal(r.D.averageScore, 8.5);
  assert.equal(r.D.missingSheets, 1);
  assert.equal(r.D.incomplete, true);
  assert.equal(provisional, true);
});

test('ties share a rank unless the tie-breaker names a criterion', () => {
  // E (8,8,8)  → (320 + 240 + 240)/100 = 8.00
  // F (5,10,10) → (200 + 300 + 300)/100 = 8.00   ← same total as E
  // G (9,9,9)  → 9.00
  const scores = [sheet('E', 'J1', 8, 8, 8), sheet('F', 'J1', 5, 10, 10), sheet('G', 'J1', 9, 9, 9)];
  const shared = byId(computeEventResults({ criteria: CRITERIA, scores }).rows);
  assert.equal(shared.G.rank, 1);
  assert.equal(shared.E.rank, 2);
  assert.equal(shared.F.rank, 2);
  assert.equal(shared.E.tied, true);

  const broken = byId(computeEventResults({ criteria: CRITERIA, scores, tieBreaker: ['Highest Talent score'] }).rows);
  assert.equal(broken.E.rank, 2); // Talent 8 beats Talent 5
  assert.equal(broken.F.rank, 3);
  assert.equal(broken.E.tied, false);
});

test('a replacement judge continues the seat; voided sheets do not count', () => {
  // Seat J1: the original judge gave A (6,6,6)=6.00 at 01:00, the replacement
  // judge (same seat) gave A (9,9,9)=9.00 at 03:00 → only 9.00 counts.
  // Seat J2: (8,8,8)=8.00 but voided → excluded. Seat J3: 7.00.
  // J = (9.00 + 7.00)/2 = 8.00, with 1 sheet missing of 3 seats.
  const scores = [
    sheet('A', 'J1', 6, 6, 6, { judgeName: 'Original', timestamp: '2026-10-22T01:00:00Z' }),
    sheet('A', 'J1', 9, 9, 9, { judgeName: 'Replacement', timestamp: '2026-10-22T03:00:00Z' }),
    sheet('A', 'J2', 8, 8, 8, { voided: true }),
    sheet('A', 'J3', 7, 7, 7),
  ];
  const [row] = computeEventResults({ criteria: CRITERIA, scores, expectedSeats: 3 }).rows;
  assert.equal(row.averageScore, 8);
  assert.equal(row.totalScores, 2);
  assert.equal(row.missingSheets, 1);
  assert.equal(row.sheets.find((entry) => entry.seatId === 'J1').judgeName, 'Replacement');
});

test('rounding is done once, half away from zero', () => {
  assert.equal(roundHalfAway(8.125), 8.13);
  assert.equal(roundHalfAway(1.005), 1.01);
  assert.equal(roundHalfAway(7.7067), 7.71);
});

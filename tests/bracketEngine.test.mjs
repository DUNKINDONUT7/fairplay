// W05 / W06 — tournament completion and draw checks for every bracket format.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChampion,
  generateBracketFor,
  minimumEntrantsFor,
  updateBracketMatch,
  isLeagueMatch,
} from '../src/utils/bracketEngine.js';

const FORMATS = ['single', 'round-robin', 'group-knockout', 'league-playoff'];

function entrants(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `t${index + 1}`, name: `Team ${index + 1}`, seed: index + 1 }));
}

function build(format, count) {
  const generated = generateBracketFor(format, entrants(count));
  return { bracketType: format, ...generated };
}

// Same rule the database enforces (03_tournament_controls.sql matches_complete).
function allPlayed(tournament) {
  const playable = tournament.matches.filter((match) => match.status !== 'bye');
  return playable.length > 0 && playable.every((match) => match.status === 'completed');
}

function nextPlayable(tournament) {
  return tournament.matches.find((match) => match.team1 && match.team2 && !['completed', 'bye'].includes(match.status));
}

// Plays every match in order; a deterministic score so a run is repeatable.
function playOut(tournament, onSave) {
  let current = tournament;
  let guard = 0;
  for (let match = nextPlayable(current); match; match = nextPlayable(current)) {
    guard += 1;
    assert.ok(guard < 500, 'bracket never finishes');
    const league = isLeagueMatch(current, match);
    const n = Number(String(match.id).replace(/\D/g, '')) || guard;
    const score1 = league && n % 5 === 0 ? 2 : 3 + (n % 3);
    const score2 = league && n % 5 === 0 ? 2 : (n % 2 === 0 ? 1 : 7);
    current = updateBracketMatch(current, match.id, { score1, score2 }, { finalize: true });
    current = { ...current, champion: calculateChampion(current) };
    onSave?.(current, match.id);
  }
  return current;
}

for (const format of FORMATS) {
  const min = minimumEntrantsFor(format);
  for (let count = min; count <= 13; count += 1) {
    test(`${format} with ${count} entrants: no champion until every match is played`, () => {
      const start = build(format, count);
      assert.equal(calculateChampion(start), null, 'champion at draw time');
      assert.ok(!start.matches.some((match) => match.status !== 'bye' && !match.team1 && !match.team2 && match.round === 1 && !match.stage),
        'an opening match with nobody in it');

      const finished = playOut(start, (state) => {
        if (state.champion) {
          assert.ok(allPlayed(state), `champion ${state.champion.name} declared with matches left`);
        }
      });

      assert.ok(allPlayed(finished), 'some match was never playable');
      assert.ok(finished.champion, 'no champion after every match was played');
      const ids = new Set(entrants(count).map((entry) => entry.id));
      assert.ok(ids.has(String(finished.champion.id)), 'champion is not one of the entrants');
    });
  }
}

test('single elimination: odd counts get byes, and byes are not playable matches', () => {
  for (const count of [3, 5, 6, 7, 9, 11]) {
    const start = build('single', count);
    const byes = start.matches.filter((match) => match.status === 'bye');
    assert.equal(byes.length, start.totalSlots - count, `${count} entrants`);
    byes.forEach((match) => assert.ok(match.winner, 'bye without an advancing team'));
  }
});

test('the same seed order always produces the same draw (a redraw is only a redraw if the order changes)', () => {
  for (const format of FORMATS) {
    const first = build(format, 8);
    const second = build(format, 8);
    assert.deepEqual(
      first.matches.map((match) => [match.id, match.team1?.id, match.team2?.id]),
      second.matches.map((match) => [match.id, match.team1?.id, match.team2?.id]),
      format,
    );
  }
});

test('group stage + knockout: Group A and Group B feed the knockout only after the group stage is done', () => {
  let state = build('group-knockout', 8);
  const groups = new Set(state.matches.filter((match) => match.stage === 'group').map((match) => match.group));
  assert.deepEqual([...groups].sort(), ['A', 'B']);
  const knockout = () => state.matches.filter((match) => match.stage === 'knockout');
  assert.ok(knockout().every((match) => !match.team1 && !match.team2), 'knockout seeded before groups were played');

  const groupMatches = state.matches.filter((match) => match.stage === 'group');
  groupMatches.forEach((match, index) => {
    state = updateBracketMatch(state, match.id, { score1: 2, score2: 1 }, { finalize: true });
    const last = index === groupMatches.length - 1;
    const semis = knockout().filter((entry) => entry.source1);
    assert.equal(semis.every((entry) => entry.team1 && entry.team2), last, `after group match ${index + 1}`);
  });

  // Group results are frozen once the knockout has a result.
  const firstKnockout = knockout().find((match) => match.team1 && match.team2);
  state = updateBracketMatch(state, firstKnockout.id, { score1: 1, score2: 0 }, { finalize: true });
  assert.throws(() => updateBracketMatch(state, groupMatches[0].id, { score1: 0, score2: 5 }, { finalize: true }));
});

test('elimination matches cannot end in a tie', () => {
  const state = build('single', 4);
  const match = state.matches.find((entry) => entry.team1 && entry.team2);
  assert.throws(() => updateBracketMatch(state, match.id, { score1: 2, score2: 2 }, { finalize: true }), /tie/i);
});

test('repair: a bracket saved with the old bye bug loses its premature champion, real results stay', async () => {
  const { repairSingleEliminationProgress } = await import('../src/utils/bracketEngine.js');
  const team = (n) => ({ id: `t${n}`, name: `Team ${n}`, seed: n });
  // What the old engine saved for 3 entrants: seed 1 pushed through the final.
  const buggy = [
    { id: 'WB-R1-M1', round: 1, position: 0, team1: team(1), team2: null, winner: team(1), status: 'bye', score1: 0, score2: 0 },
    { id: 'WB-R1-M2', round: 1, position: 1, team1: team(2), team2: team(3), winner: null, status: 'scheduled', score1: 0, score2: 0 },
    { id: 'WB-R2-M1', round: 2, position: 0, team1: team(1), team2: null, winner: team(1), status: 'bye', score1: 0, score2: 0 },
  ];
  const repaired = repairSingleEliminationProgress(buggy, 2);
  const final = repaired.find((match) => match.id === 'WB-R2-M1');
  assert.equal(final.status, 'pending');
  assert.equal(final.winner, null);
  assert.equal(calculateChampion({ bracketType: 'single', matches: repaired, totalRounds: 2 }), null);

  // Once the semifinal is really played, the final is set up normally.
  const played = updateBracketMatch({ bracketType: 'single', matches: repaired, totalRounds: 2 }, 'WB-R1-M2', { score1: 3, score2: 1 }, { finalize: true });
  const readyFinal = played.matches.find((match) => match.id === 'WB-R2-M1');
  assert.equal(readyFinal.status, 'scheduled');
  assert.equal(readyFinal.team2.id, 't2');

  // A properly played final survives the repair untouched.
  const done = updateBracketMatch(played, 'WB-R2-M1', { score1: 2, score2: 0 }, { finalize: true });
  const again = repairSingleEliminationProgress(done.matches, 2);
  assert.deepEqual(again.find((match) => match.id === 'WB-R2-M1').winner, done.matches.find((match) => match.id === 'WB-R2-M1').winner);
});

test('undo (organizer correction): refused while a later match depends on it, allowed latest-first', async () => {
  const { resetBracketMatch, laterResultDependsOn } = await import('../src/utils/bracketEngine.js');
  for (const format of FORMATS) {
    const finished = playOut(build(format, 6));
    assert.ok(finished.champion, format);

    // Undo every result, latest first: each undo must be allowed, and the
    // champion must disappear with the first one.
    const order = [...finished.matches]
      .filter((match) => match.status === 'completed')
      .sort((left, right) => Number(right.round) - Number(left.round));
    let state = finished;
    let firstUndo = true;
    for (const match of order) {
      const blocker = laterResultDependsOn(state, match.id);
      if (blocker) {
        assert.throws(() => resetBracketMatch(state, match.id), /Undo that one first/);
        continue;
      }
      state = resetBracketMatch(state, match.id);
      if (firstUndo) {
        assert.equal(state.champion, null, `${format}: champion kept after an undo`);
        firstUndo = false;
      }
      assert.equal(state.matches.find((entry) => entry.id === match.id).status !== 'completed', true);
    }
  }
});

test('undo of an early elimination match is refused once the next round is played', async () => {
  const { resetBracketMatch } = await import('../src/utils/bracketEngine.js');
  const finished = playOut(build('single', 4));
  const semi = finished.matches.find((match) => match.round === 1);
  assert.throws(() => resetBracketMatch(finished, semi.id), /Undo that one first/);
});

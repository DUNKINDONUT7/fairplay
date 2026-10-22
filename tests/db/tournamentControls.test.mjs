// W01 / W03 / W05 / W06 — sports results, corrections, draws and completion,
// enforced by the database. Payloads are built with the app's real bracket
// engine, exactly as the browser builds them.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { as, createDatabase, emails, expectRejected, rpc, seedAccounts } from './harness.mjs';
import {
  calculateChampion,
  generateBracketFor,
  resetBracketMatch,
  updateBracketMatch,
} from '../../src/utils/bracketEngine.js';

const EVENT = 7001;
const OTHER_EVENT = 7002;
const TEAMS = ['Eagles', 'Hawks', 'Owls', 'Ravens', 'Falcons'].map((name, index) => ({ id: `t${index + 1}`, name, seed: index + 1 }));

let db;
let tournamentId;

// Same shape the app sends (tournamentStore.buildTournamentPayload).
function payload(state) {
  const playable = state.matches.filter((match) => match.status !== 'bye');
  const done = playable.length > 0 && playable.every((match) => match.status === 'completed');
  return {
    id: state.id,
    name: state.name,
    title: state.title,
    status: state.status,
    bracket_type: state.bracket_type || state.bracketType,
    teams: state.teams,
    matches: state.matches,
    rounds: state.rounds || [],
    standings: state.standings || [],
    current_round: state.current_round || 1,
    total_rounds: state.totalRounds ?? state.total_rounds,
    total_slots: state.totalSlots ?? state.total_slots,
    byes: state.byes || 0,
    live_status: 'live',
    champion: done ? (calculateChampion(toEngine(state)) || {}) : {},
    entrant_snapshot: state.entrant_snapshot || state.teams,
  };
}

function toEngine(row) {
  return {
    ...row,
    bracketType: row.bracket_type || row.bracketType,
    totalRounds: row.total_rounds ?? row.totalRounds,
    matches: row.matches,
    standings: row.standings || [],
    teams: row.teams,
  };
}

async function current() {
  return (await db.query('select * from public.tournaments where id = $1', [tournamentId])).rows[0];
}

async function record(key, matchId, score1, score2, { revision } = {}) {
  const row = await current();
  const next = updateBracketMatch(toEngine(row), matchId, { score1, score2 }, { finalize: true });
  return as(db, key, () => rpc(db, 'tournament_record_result', {
    p_tournament_id: tournamentId,
    p_match_id: matchId,
    p_payload: payload({ ...row, ...next, bracket_type: row.bracket_type }),
    p_expected_revision: revision ?? row.revision,
  }));
}

function playable(row) {
  return row.matches.find((match) => match.team1 && match.team2 && !['completed', 'bye'].includes(match.status));
}

before(async () => {
  db = await createDatabase();
  await seedAccounts(db);
  for (const [owner, id] of [['organizer', EVENT], ['organizer2', OTHER_EVENT]]) {
    await as(db, owner, () => db.query(
      `insert into public.events (id, title, type, status, metadata) values ($1, 'Intramurals Basketball', 'sports', 'draft', '{}'::jsonb)`, [id]
    ));
  }
  // Scorer of this event, and a scorer of another event.
  for (const [key, eventId, owner] of [['scorer', EVENT, 'organizer'], ['scorerOther', OTHER_EVENT, 'organizer2']]) {
    const added = await as(db, owner, () => rpc(db, 'staff_add', { p_event_id: eventId, p_role: 'scorer', p_email: emails[key], p_full_name: key }));
    const token = await as(db, owner, () => rpc(db, 'staff_invite_token', { p_staff_id: added.id }));
    await as(db, key, () => rpc(db, 'staff_activate', { p_token: token }));
  }
});

test('only the event organizer can create the bracket and draw it', async () => {
  await expectRejected(as(db, 'scorer', () => rpc(db, 'tournament_create', { p_event_id: EVENT, p_payload: { id: 1, title: 'x' } })), /Only the event organizer/);
  const created = await as(db, 'organizer', () => rpc(db, 'tournament_create', {
    p_event_id: EVENT, p_payload: { id: 5001, title: 'Basketball', bracket_type: 'single', teams: TEAMS },
  }));
  tournamentId = Number(created.id);

  const draw = generateBracketFor('single', TEAMS);
  const row = await current();
  await expectRejected(as(db, 'organizer2', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: payload({ ...row, ...draw, bracket_type: 'single' }), p_expected_revision: row.revision,
  })), /Only the event organizer/);
  const saved = await as(db, 'organizer', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: payload({ ...row, ...draw, bracket_type: 'single' }), p_expected_revision: row.revision,
  }));
  assert.equal(saved.draw_count, 1);
});

test('W06: reshuffling is free before approval, but needs a reason (and is logged) after the official pairing', async () => {
  const shuffled = [...TEAMS].reverse().map((team, index) => ({ ...team, seed: index + 1 }));
  let row = await current();
  await as(db, 'organizer', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: payload({ ...row, ...generateBracketFor('single', shuffled), bracket_type: 'single' }), p_expected_revision: row.revision,
  }));
  // Repeated reshuffle before approval: no reason needed, nothing logged.
  row = await current();
  await as(db, 'organizer', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: payload({ ...row, ...generateBracketFor('single', TEAMS), bracket_type: 'single' }), p_expected_revision: row.revision,
  }));

  await db.query(`update public.events set status = 'upcoming' where id = $1`, [EVENT]); // approved → pairing is official
  row = await current();
  const redraw = payload({ ...row, ...generateBracketFor('single', shuffled), bracket_type: 'single' });
  await expectRejected(as(db, 'organizer', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: redraw, p_expected_revision: row.revision,
  })), /reason/);
  await as(db, 'organizer', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: redraw, p_expected_revision: row.revision, p_reason: 'Team withdrew; approved by sports head',
  }));
  const log = await as(db, 'organizer', () => db.query(`select change_type, reason, old_value from public.result_changes where tournament_id = $1`, [tournamentId]));
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].change_type, 'redraw');
  assert.equal(log.rows[0].old_value.hadResults, false);
  assert.equal((await current()).draw_count, 4);
});

test('W05: odd entrant count — byes advance, and there is no champion at draw time', async () => {
  const row = await current();
  assert.equal(row.matches.filter((match) => match.status === 'bye').length, 3, '5 entrants in 8 slots = 3 byes');
  assert.deepEqual(row.champion, {});
  // A forged champion is refused by the database itself.
  await expectRejected(db.query(`update public.tournaments set champion = '{"id":"t1","name":"Eagles"}' where id = $1`, [tournamentId]), /every match has a saved result/);
});

test('W01: results cannot be recorded until scoring opens', async () => {
  await expectRejected(record('scorer', playable(await current()).id, 3, 1), /Scoring is not open/);
  await as(db, 'organizer', () => db.query(
    `update public.events set status = 'active', metadata = metadata || '{"scoringActive": true}' where id = $1`, [EVENT]
  ));
});

test('W01: the organizer, other scorers and students cannot record a result', async () => {
  const match = playable(await current());
  await expectRejected(record('organizer', match.id, 3, 1), /not an active scorer/);
  await expectRejected(record('scorerOther', match.id, 3, 1), /not an active scorer/);
  await expectRejected(record('student', match.id, 3, 1), /not an active scorer/);
  await expectRejected(as(db, 'organizer', () => db.query(`update public.tournaments set matches = '[]' where id = $1`, [tournamentId])), /permission denied/);
  await expectRejected(as(db, null, () => db.query(`delete from public.tournaments where id = $1`, [tournamentId])), /permission denied/);
});

test('W01: the assigned scorer records a result; a retry never duplicates it', async () => {
  const match = playable(await current());
  const before = (await current()).revision;
  await record('scorer', match.id, 3, 1);
  const after = await current();
  assert.equal(after.revision, before + 1);
  assert.equal(after.matches.find((entry) => entry.id === match.id).status, 'completed');

  // The same result sent again (connection dropped before the reply).
  const retry = await record('scorer', match.id, 3, 1, { revision: before });
  assert.equal(retry.alreadySaved, true);
  assert.equal((await current()).revision, before + 1, 'nothing written twice');
  const entries = await db.query(`select count(*)::int as n from public.match_result_entries where match_id = $1`, [match.id]);
  assert.equal(entries.rows[0].n, 1);
});

test('W03: a scorer cannot change a saved result; a stale screen is refused, not overwritten', async () => {
  const row = await current();
  const saved = row.matches.find((entry) => entry.status === 'completed');
  // The engine itself refuses to recompute a different winner on a saved
  // match here, so build the tampered payload by hand.
  const tampered = row.matches.map((entry) => (entry.id === saved.id ? { ...entry, score1: 0, score2: 9, winner: entry.team2 } : entry));
  await expectRejected(as(db, 'scorer', () => rpc(db, 'tournament_record_result', {
    p_tournament_id: tournamentId, p_match_id: saved.id, p_payload: payload({ ...row, matches: tampered }), p_expected_revision: row.revision,
  })), /Only the organizer can correct it/);

  const next = playable(row);
  await expectRejected(record('scorer', next.id, 2, 0, { revision: row.revision - 1 }), /changed by someone else/);
});

test('W05: no champion until every match is played; then the organizer finalizes', async () => {
  for (let match = playable(await current()); match; match = playable(await current())) {
    const before = await current();
    const remaining = before.matches.filter((entry) => !['completed', 'bye'].includes(entry.status)).length;
    await record('scorer', match.id, 4, 2);
    const after = await current();
    if (remaining > 1) assert.deepEqual(after.champion, {}, `champion with ${remaining - 1} match(es) left`);
  }
  const done = await current();
  assert.ok(done.champion?.id, 'champion after the final');
  await expectRejected(as(db, 'scorer', () => rpc(db, 'tournament_finalize', { p_tournament_id: tournamentId })), /Only the event organizer/);
});

test('W03: correcting an early result that a later result depends on is refused', async () => {
  const row = await current();
  const firstRound = row.matches.find((entry) => entry.round === 1 && entry.status === 'completed');
  const corrected = updateBracketMatch(toEngine(row), firstRound.id, { score1: 0, score2: 5 }, { finalize: true });
  await expectRejected(as(db, 'organizer', () => rpc(db, 'tournament_correct_result', {
    p_tournament_id: tournamentId, p_match_id: firstRound.id, p_payload: payload({ ...row, ...corrected, bracket_type: 'single' }),
    p_expected_revision: row.revision, p_reason: 'Wrong winner recorded',
  })), /Correct the later match first/);
});

test('W03: the organizer corrects the final with a reason; the log keeps old and new; standings follow', async () => {
  const row = await current();
  const final = row.matches.find((entry) => entry.round === row.total_rounds);
  const corrected = updateBracketMatch(toEngine(row), final.id, { score1: 2, score2: 4 }, { finalize: true });
  const body = payload({ ...row, ...corrected, bracket_type: 'single' });

  await expectRejected(as(db, 'scorer', () => rpc(db, 'tournament_correct_result', {
    p_tournament_id: tournamentId, p_match_id: final.id, p_payload: body, p_expected_revision: row.revision, p_reason: 'Scorer fixing',
  })), /Only the event organizer/);
  await expectRejected(as(db, 'organizer', () => rpc(db, 'tournament_correct_result', {
    p_tournament_id: tournamentId, p_match_id: final.id, p_payload: body, p_expected_revision: row.revision, p_reason: '',
  })), /reason/);
  await as(db, 'organizer', () => rpc(db, 'tournament_correct_result', {
    p_tournament_id: tournamentId, p_match_id: final.id, p_payload: body, p_expected_revision: row.revision,
    p_reason: 'Referee sheet shows 2–4; scorer swapped the teams',
  }));
  const after = await current();
  assert.equal(after.champion.id, final.team2.id, 'the champion follows the corrected final');
  const log = await as(db, 'organizer', () => db.query(`select * from public.result_changes where change_type = 'match_correction'`));
  assert.equal(log.rows.length, 1);
  assert.equal(Number(log.rows[0].old_value.score1), 4);
  assert.equal(Number(log.rows[0].new_value.score1), 2);
  assert.equal(log.rows[0].old_value.champion.id, final.team1.id);
});

test('W03: undo takes the final result off, and the champion goes with it', async () => {
  const row = await current();
  const final = row.matches.find((entry) => entry.round === row.total_rounds);
  const undone = resetBracketMatch(toEngine(row), final.id);
  await as(db, 'organizer', () => rpc(db, 'tournament_correct_result', {
    p_tournament_id: tournamentId, p_match_id: final.id, p_payload: payload({ ...row, ...undone, bracket_type: 'single' }),
    p_expected_revision: row.revision, p_reason: 'Final to be replayed', p_kind: 'undo',
  }));
  const after = await current();
  assert.deepEqual(after.champion, {});
  await expectRejected(as(db, 'organizer', () => rpc(db, 'tournament_finalize', { p_tournament_id: tournamentId })), /Every match must have a saved result/);
  await record('scorer', final.id, 5, 3);
});

test('W06: a redraw after results is refused without a reason', async () => {
  const row = await current();
  const redraw = payload({ ...row, ...generateBracketFor('single', TEAMS), bracket_type: 'single' });
  await expectRejected(as(db, 'organizer', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: tournamentId, p_payload: redraw, p_expected_revision: row.revision,
  })), /reason|Saved results cannot be changed/);
});

test('W05: finalizing is permanent — no later change by anyone', async () => {
  await as(db, 'organizer', () => rpc(db, 'tournament_finalize', { p_tournament_id: tournamentId }));
  const row = await current();
  assert.equal(row.is_finalized, true);
  const final = row.matches.find((entry) => entry.round === row.total_rounds);
  await expectRejected(as(db, 'organizer', () => rpc(db, 'tournament_correct_result', {
    p_tournament_id: tournamentId, p_match_id: final.id, p_payload: payload(row), p_expected_revision: row.revision, p_reason: 'After finalization',
  })), /finalized/);
  // Even the database owner (no RLS) cannot change a finalized result.
  await expectRejected(db.query(`update public.tournaments set teams = '[]' where id = $1`, [tournamentId]), /finalized/);
  await expectRejected(db.query(`delete from public.tournaments where id = $1`, [tournamentId]), /finalized/);
});

test('W06: an exceptional redraw after scoring — with a reason — clears results and logs the old ones', async () => {
  const created = await as(db, 'organizer2', () => rpc(db, 'tournament_create', {
    p_event_id: OTHER_EVENT, p_payload: { id: 5002, title: 'Volleyball', bracket_type: 'round-robin', teams: TEAMS.slice(0, 4) },
  }));
  const id = Number(created.id);
  const load = async () => (await db.query('select * from public.tournaments where id = $1', [id])).rows[0];
  let row = await load();
  await as(db, 'organizer2', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: id, p_payload: payload({ ...row, ...generateBracketFor('round-robin', TEAMS.slice(0, 4)), bracket_type: 'round-robin' }), p_expected_revision: row.revision,
  }));
  await db.query(`update public.events set status = 'active', metadata = '{"scoringActive": true}' where id = $1`, [OTHER_EVENT]);
  row = await load();
  const first = row.matches[0];
  const next = updateBracketMatch(toEngine(row), first.id, { score1: 25, score2: 20 }, { finalize: true });
  await as(db, 'scorerOther', () => rpc(db, 'tournament_record_result', {
    p_tournament_id: id, p_match_id: first.id, p_payload: payload({ ...row, ...next, bracket_type: 'round-robin' }), p_expected_revision: row.revision,
  }));

  row = await load();
  const reordered = [TEAMS[3], TEAMS[2], TEAMS[1], TEAMS[0]].map((team, index) => ({ ...team, seed: index + 1 }));
  const redraw = payload({ ...row, ...generateBracketFor('round-robin', reordered), bracket_type: 'round-robin' });
  await expectRejected(as(db, 'organizer2', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: id, p_payload: redraw, p_expected_revision: row.revision,
  })), /reason/);
  await as(db, 'organizer2', () => rpc(db, 'tournament_save_draw', {
    p_tournament_id: id, p_payload: redraw, p_expected_revision: row.revision, p_reason: 'Wrong teams were entered; redraw approved by OSDS',
  }));
  const after = await load();
  assert.equal(after.matches.filter((match) => match.status === 'completed').length, 0, 'results cleared');
  const log = await as(db, 'organizer2', () => db.query(`select old_value from public.result_changes where tournament_id = $1 and change_type = 'redraw'`, [id]));
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].old_value.hadResults, true);
  assert.equal(log.rows[0].old_value.matches.find((match) => match.id === first.id).status, 'completed', 'the cleared result is kept in the log');
});

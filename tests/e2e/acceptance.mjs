// Acceptance run against a real Supabase TEST project, through the same API
// the web and mobile apps use: each account signs in with its password and
// every action is a real request. Writes the panel's test-record format
// (account, action, expected, actual, pass/fail) to docs/revisions/.
//
//   node tests/e2e/acceptance.mjs
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.test.local and refuses
// to run against the live project. Accounts come from
// scripts/seed-test-project.mjs; their password is FAIRPLAY_TEST_PASSWORD in
// the git-ignored .env.test-secrets.local.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testPassword } from './testSecrets.mjs';
import { generateBracketFor, updateBracketMatch, calculateChampion, resetBracketMatch } from '../../src/utils/bracketEngine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.test.local'), 'utf8').split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) throw new Error('.env.test.local needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
if (URL_.includes('lflwjlgexsghiyiwwzys')) throw new Error('Refusing to run against the live project.');

const PASSWORD = testPassword();
const clients = {};
async function login(key, email) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  clients[key] = { client, id: data.user.id, email };
}

const records = [];
let counter = 0;
async function check(item, account, action, expected, run, verify) {
  counter += 1;
  let actual;
  let pass;
  try {
    const value = await run();
    const verdict = await verify(null, value);
    pass = verdict.pass;
    actual = verdict.actual;
  } catch (error) {
    const verdict = await verify(error, undefined);
    pass = verdict.pass;
    actual = verdict.actual;
  }
  records.push({ no: counter, item, account, action, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}  ${action}`);
  if (!pass) console.log(`      expected: ${expected}\n      actual:   ${actual}`);
}
const refused = (pattern) => (error) => ({
  pass: Boolean(error) && (!pattern || pattern.test(error.message)),
  actual: error ? `Refused: "${error.message}"` : 'Accepted (no error)',
});
const rpc = (key, name, params) => async () => {
  const { data, error } = await clients[key].client.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
};
const anonClient = createClient(URL_, ANON, { auth: { persistSession: false } });

const ACCOUNTS = {
  admin: 'admin@fairplay.test', organizer: 'organizer@fairplay.test', organizer2: 'organizer2@fairplay.test',
  judge1: 'judge1@fairplay.test', judge2: 'judge2@fairplay.test', judge3: 'judge3@fairplay.test',
  scorer1: 'scorer1@fairplay.test', scorer2: 'scorer2@fairplay.test', student1: 'student1@fairplay.test',
};
for (const [key, email] of Object.entries(ACCOUNTS)) await login(key, email);

const stamp = Date.now();
const JUDGED = stamp;
const SPORTS = stamp + 1;
const CRITERIA = [
  { id: 'talent', name: 'Talent', weight: 40, scoringRange: '1-10' },
  { id: 'poise', name: 'Poise', weight: 30, scoringRange: '1-10' },
  { id: 'qa', name: 'Q&A', weight: 30, scoringRange: '1-10' },
];
const TEAMS = ['Eagles', 'Hawks', 'Owls', 'Ravens', 'Falcons'].map((name, index) => ({ id: `t${index + 1}`, name, seed: index + 1 }));

// ---------- Setup: two events owned by the organizer, approved ----------
async function insertEvent(id, title, type, extra = {}) {
  const { error } = await clients.organizer.client.from('events').insert({
    id, title, type, status: 'draft', metadata: {}, start_date: new Date().toISOString(), location: 'Test Gym', ...extra,
  });
  if (error) throw new Error(error.message);
  const { error: approveError } = await clients.admin.client.from('events').update({ status: 'upcoming' }).eq('id', id);
  if (approveError) throw new Error(approveError.message);
}
await insertEvent(JUDGED, `Acceptance Pageant ${stamp}`, 'pageant', {
  criteria: CRITERIA, contestants: [{ id: 'c1', name: 'Ana' }, { id: 'c2', name: 'Ben' }, { id: 'c3', name: 'Cy' }],
});
await insertEvent(SPORTS, `Acceptance Basketball ${stamp}`, 'sports');

async function assign(owner, eventId, role, key, name) {
  const added = await rpc(owner, 'staff_add', { p_event_id: eventId, p_role: role, p_email: ACCOUNTS[key], p_full_name: name })();
  const token = await rpc(owner, 'staff_invite_token', { p_staff_id: added.id })();
  return { id: added.id, token };
}
const openScoring = (eventId) => clients.organizer.client.from('events')
  .update({ status: 'active', metadata: { scoringActive: true } }).eq('id', eventId);

// ================= W01 / W10: staff accounts =================
const j1 = await assign('organizer', JUDGED, 'judge', 'judge1', 'Jenny Judge');
await check('W10', 'judge2@fairplay.test', 'Open judge1\'s activation link while signed in as judge2', 'Refused — link belongs to another email',
  rpc('judge2', 'staff_activate', { p_token: j1.token }), refused(/sent to judge1/));
await check('W10', 'judge1@fairplay.test', 'Activate own invitation', 'Assignment becomes active',
  rpc('judge1', 'staff_activate', { p_token: j1.token }), (error, value) => ({ pass: !error && value?.role === 'judge', actual: error ? error.message : `Active (${value.role})` }));
await check('W10', 'judge1@fairplay.test', 'Re-use the same activation link', 'No second activation (single-use)',
  rpc('judge1', 'staff_activate', { p_token: j1.token }), refused(/invalid/));
await check('W01', 'organizer2@fairplay.test', 'Assign a judge to an event owned by another organizer', 'Refused',
  rpc('organizer2', 'staff_add', { p_event_id: JUDGED, p_role: 'judge', p_email: ACCOUNTS.judge2, p_full_name: 'x' }), refused(/Only the event organizer/));

// ================= W01: judge scoring =================
const sheet = (talent, poise, qa) => ({ talent, poise, qa });
const submit = (key, contestant, scores) => rpc(key, 'submit_judge_score', { p_event_id: JUDGED, p_contestant_id: contestant, p_criteria_scores: scores });
await check('W01', 'judge1@fairplay.test', 'Submit a score before the organizer opens scoring', 'Refused — scoring not open',
  submit('judge1', 'c1', sheet(8, 7, 9)), refused(/Scoring is not open/));
await openScoring(JUDGED);
await check('W01/W02', 'judge1@fairplay.test', 'Submit Talent 8, Poise 7, Q&A 9 for Ana', 'Saved; total = (8×40+7×30+9×30)/100 = 8.00',
  submit('judge1', 'c1', sheet(8, 7, 9)), (error, value) => ({ pass: !error && Number(value.total_score) === 8, actual: error ? error.message : `Saved, total ${value.total_score}` }));
await check('W01', 'organizer@fairplay.test', 'Organizer submits a judge score', 'Refused — not an assigned judge',
  submit('organizer', 'c1', sheet(10, 10, 10)), refused(/not an active judge/));
await check('W01', 'judge2@fairplay.test', 'Unassigned judge submits a score', 'Refused — not assigned to this event',
  submit('judge2', 'c1', sheet(10, 10, 10)), refused(/not an active judge/));
await check('W01', 'student1@fairplay.test', 'Student inserts a score row directly into the table', 'Refused — no direct table writes',
  async () => {
    const { error } = await clients.student1.client.from('scores').insert({ id: 'hack', event_id: JUDGED, contestant_id: 'c1', criteria_scores: {} });
    if (error) throw new Error(error.message);
  }, refused(/permission denied|violates/));
await check('W01', 'anonymous (not signed in)', 'Update a score row directly', 'Refused',
  async () => {
    const { error, count } = await anonClient.from('scores').update({ total_score: 99 }, { count: 'exact' }).eq('event_id', JUDGED);
    if (error) throw new Error(error.message);
    return count;
  }, (error, count) => ({ pass: Boolean(error) || count === 0, actual: error ? `Refused: "${error.message}"` : `${count} rows changed` }));
await check('W02', 'judge1@fairplay.test', 'Submit Talent 11 (range is 1–10)', 'Refused — out of range',
  submit('judge1', 'c2', sheet(11, 7, 7)), refused(/between 1 and 10/));
await check('W02', 'judge1@fairplay.test', 'Submit without a Q&A score', 'Refused — missing criterion',
  submit('judge1', 'c2', { talent: 7, poise: 7 }), refused(/Missing a score/));

// ================= W03 / W04: correction + log =================
await rpc('judge1', 'lock_my_judge_scores', { p_event_id: JUDGED, p_contestant_id: 'c1' })();
const scoreId = `${JUDGED}_${clients.judge1.id}_c1`;
await check('W03', 'judge1@fairplay.test', 'Change a sheet already submitted as final', 'Refused — needs organizer correction',
  submit('judge1', 'c1', sheet(1, 1, 1)), refused(/already submitted as final/));
await check('W03', 'organizer@fairplay.test', 'Correct the sheet without a reason', 'Refused — reason required',
  rpc('organizer', 'correct_judge_score', { p_score_id: scoreId, p_criteria_scores: sheet(9, 7, 9), p_reason: '' }), refused(/reason/));
const correctionTime = new Date();
await check('W03', 'organizer@fairplay.test', 'Correct Talent 8 → 9 with reason "Judge misread row"', 'Saved; new total 8.40, judge keeps credit',
  rpc('organizer', 'correct_judge_score', { p_score_id: scoreId, p_criteria_scores: sheet(9, 7, 9), p_reason: 'Judge misread row' }),
  (error, value) => ({ pass: !error && Number(value.total_score) === 8.4 && value.judge_id === clients.judge1.id, actual: error ? error.message : `Total ${value.total_score}, judge ${value.judge_name}` }));
await check('W04', 'organizer@fairplay.test', 'Find the correction in the change log', 'Entry with old/new totals, reason, actor and PHT time within a minute of the change',
  async () => {
    const { data, error } = await clients.organizer.client.from('result_changes_ph').select('*').eq('event_id', JUDGED).eq('change_type', 'judge_score_correction');
    if (error) throw new Error(error.message);
    return data;
  }, (error, rows) => {
    if (error) return { pass: false, actual: error.message };
    const row = rows?.[0];
    const logged = row ? new Date(row.occurred_at) : null;
    const ph = correctionTime.toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16);
    const ok = row && Number(row.old_value.total) === 8 && Number(row.new_value.total) === 8.4 && row.actor_email === ACCOUNTS.organizer
      && Math.abs(logged - correctionTime) < 60000 && row.occurred_at_ph.startsWith(ph.slice(0, 13));
    return { pass: Boolean(ok), actual: row ? `${row.occurred_at_ph} · ${row.actor_email} · ${row.old_value.total} → ${row.new_value.total} · "${row.reason}"` : 'No entry' };
  });
await check('W04', 'organizer2@fairplay.test', 'Read another organizer\'s change log', 'Nothing visible',
  async () => (await clients.organizer2.client.from('result_changes').select('id').eq('event_id', JUDGED)).data,
  (error, rows) => ({ pass: !error && rows.length === 0, actual: error ? error.message : `${rows.length} rows visible` }));

// ================= W10: replacement =================
const j2 = await assign('organizer', JUDGED, 'judge', 'judge2', 'Jake Judge');
await rpc('judge2', 'staff_activate', { p_token: j2.token })();
await submit('judge2', 'c2', sheet(6, 6, 6))();
const replaced = await rpc('organizer', 'staff_replace', { p_staff_id: j2.id, p_email: ACCOUNTS.judge3, p_full_name: 'Joy Replacement-Judge', p_reason: 'Judge 2 left early' })();
await rpc('judge3', 'staff_activate', { p_token: await rpc('organizer', 'staff_invite_token', { p_staff_id: replaced.id })() })();
await check('W10', 'judge2@fairplay.test', 'Replaced judge tries to score again', 'Refused — access removed',
  submit('judge2', 'c3', sheet(7, 7, 7)), refused(/not an active judge/));
await check('W10', 'judge3@fairplay.test', 'Replacement judge scores Cy', 'Saved under judge3, same seat as judge2',
  submit('judge3', 'c3', sheet(7, 7, 7)), (error, value) => ({ pass: !error && value.judge_id === clients.judge3.id && value.seat_id === j2.id, actual: error ? error.message : `judge ${value.judge_name}, seat ${value.seat_id === j2.id ? 'kept' : 'changed'}` }));
await check('W10', 'organizer@fairplay.test', 'Judge2\'s earlier sheet after replacement', 'Still on record, attributed to judge2',
  async () => (await clients.organizer.client.from('scores').select('judge_id, judge_name').eq('event_id', JUDGED).eq('contestant_id', 'c2')).data,
  (error, rows) => ({ pass: !error && rows.length === 1 && rows[0].judge_id === clients.judge2.id, actual: error ? error.message : rows.map((row) => row.judge_name).join(', ') }));

// ================= W12: rubric lock =================
await check('W12', 'admin@fairplay.test', 'Change rubric weights after scoring started', 'Refused — rubric frozen',
  async () => {
    const { error } = await clients.admin.client.from('events').update({ criteria: [{ ...CRITERIA[0], weight: 60 }, CRITERIA[1], CRITERIA[2]] }).eq('id', JUDGED);
    if (error) throw new Error(error.message);
  }, refused(/Judging has started/));

// ================= Sports: W01 / W05 / W06 / W03 =================
const s1 = await assign('organizer', SPORTS, 'scorer', 'scorer1', 'Sam Scorer');
await rpc('scorer1', 'staff_activate', { p_token: s1.token })();
const created = await rpc('organizer', 'tournament_create', { p_event_id: SPORTS, p_payload: { id: stamp + 2, title: 'Basketball', bracket_type: 'single', teams: TEAMS } })();
const T = Number(created.id);
const load = async () => (await clients.organizer.client.from('tournaments').select('*').eq('id', T).single()).data;
const toEngine = (row) => ({ ...row, bracketType: row.bracket_type, totalRounds: row.total_rounds, standings: row.standings || [] });
const body = (row, next) => {
  const merged = { ...row, ...next };
  const playable = merged.matches.filter((match) => match.status !== 'bye');
  const done = playable.length > 0 && playable.every((match) => match.status === 'completed');
  return {
    name: merged.name, title: merged.title, status: 'active', bracket_type: merged.bracket_type, teams: merged.teams,
    matches: merged.matches, rounds: merged.rounds || [], standings: merged.standings || [],
    total_rounds: merged.totalRounds ?? merged.total_rounds, total_slots: merged.totalSlots ?? merged.total_slots, byes: merged.byes,
    live_status: done ? 'completed' : 'live', champion: done ? calculateChampion(toEngine({ ...merged, total_rounds: merged.totalRounds ?? merged.total_rounds })) : {},
    entrant_snapshot: merged.teams,
  };
};
let row = await load();
await check('W06', 'organizer@fairplay.test', 'First draw of the approved event (the official pairing)', 'Saved; no reason needed for the first draw',
  rpc('organizer', 'tournament_save_draw', { p_tournament_id: T, p_payload: body(row, generateBracketFor('single', TEAMS)), p_expected_revision: row.revision }),
  (error, value) => ({ pass: !error && value.draw_count === 1, actual: error ? error.message : `${value.matches.length} matches, draw #${value.draw_count}` }));
row = await load();
const reseeded = [TEAMS[4], TEAMS[3], TEAMS[2], TEAMS[1], TEAMS[0]].map((team, index) => ({ ...team, seed: index + 1 }));
await check('W06', 'organizer@fairplay.test', 'Reshuffle (redraw) after the official pairing, no reason', 'Refused — redraw needs a reason',
  rpc('organizer', 'tournament_save_draw', { p_tournament_id: T, p_payload: body(row, generateBracketFor('single', reseeded)), p_expected_revision: row.revision }), refused(/reason/));
await check('W06', 'organizer@fairplay.test', 'Redraw with reason "Seeding error corrected"', 'Saved; old pairings kept in the change log',
  rpc('organizer', 'tournament_save_draw', { p_tournament_id: T, p_payload: body(row, generateBracketFor('single', reseeded)), p_expected_revision: row.revision, p_reason: 'Seeding error corrected' }),
  async (error, value) => {
    if (error) return { pass: false, actual: error.message };
    const { data } = await clients.organizer.client.from('result_changes').select('old_value').eq('tournament_id', T).eq('change_type', 'redraw');
    return { pass: value.draw_count === 2 && data.length === 1 && data[0].old_value.pairings.length > 0, actual: `draw #${value.draw_count}, ${data.length} log entry with old pairings` };
  });
await check('Test 9', 'organizer@fairplay.test', 'Save the draw from an out-of-date screen', 'Refused quickly (HTTP 409); nothing overwritten',
  async () => {
    const started = Date.now();
    const { error } = await clients.organizer.client.rpc('tournament_save_draw', { p_tournament_id: T, p_payload: body(row, generateBracketFor('single', TEAMS)), p_expected_revision: row.revision, p_reason: 'stale screen' });
    if (error) { error.message += ` (${Date.now() - started} ms)`; throw new Error(error.message); }
  }, refused(/changed by someone else/));
row = await load();
await check('W05', 'organizer@fairplay.test', 'Odd entrant count (5) after the draw', '3 byes, no champion',
  async () => row, (error, value) => ({ pass: value.matches.filter((match) => match.status === 'bye').length === 3 && Object.keys(value.champion || {}).length === 0, actual: `${value.matches.filter((match) => match.status === 'bye').length} byes, champion ${JSON.stringify(value.champion)}` }));

const firstMatch = () => row.matches.find((match) => match.team1 && match.team2 && !['completed', 'bye'].includes(match.status));
const recordResult = (key, matchId, score1, score2, revision = row.revision) => rpc(key, 'tournament_record_result', {
  p_tournament_id: T, p_match_id: matchId, p_payload: body(row, updateBracketMatch(toEngine(row), matchId, { score1, score2 }, { finalize: true })), p_expected_revision: revision,
});
await check('W01', 'scorer1@fairplay.test', 'Record a result before scoring opens', 'Refused',
  recordResult('scorer1', firstMatch().id, 3, 1), refused(/Scoring is not open/));
await openScoring(SPORTS);
await check('W01', 'organizer@fairplay.test', 'Organizer records a match result', 'Refused — only assigned scorers',
  recordResult('organizer', firstMatch().id, 3, 1), refused(/not an active scorer/));
await check('W01', 'scorer2@fairplay.test', 'Scorer not assigned to this event records a result', 'Refused',
  recordResult('scorer2', firstMatch().id, 3, 1), refused(/not an active scorer/));
const m1 = firstMatch();
const beforeRevision = row.revision;
await check('W01', 'scorer1@fairplay.test', `Record ${m1.team1.name} 3 – 1 ${m1.team2.name}`, 'Saved',
  recordResult('scorer1', m1.id, 3, 1), (error, value) => ({ pass: !error && value.revision === beforeRevision + 1, actual: error ? error.message : `Saved (revision ${value.revision})` }));
await check('Test 9', 'scorer1@fairplay.test', 'Retry the same save (reply was lost)', 'No duplicate; reported as already saved',
  recordResult('scorer1', m1.id, 3, 1, beforeRevision), async (error, value) => {
    const { data } = await clients.organizer.client.from('match_result_entries').select('id').eq('tournament_id', T).eq('match_id', m1.id);
    return { pass: !error && value.alreadySaved === true && data.length === 1, actual: error ? error.message : `alreadySaved=${value.alreadySaved}, ${data.length} entry` };
  });
await check('Test 9', 'scorer1@fairplay.test', 'Save while the server is unreachable', 'Error shown; nothing saved',
  async () => {
    const offline = createClient('http://127.0.0.1:9', ANON, { auth: { persistSession: false } });
    const { error } = await offline.rpc('tournament_record_result', {});
    if (error) throw new Error(error.message);
  }, async (error) => {
    const after = await load();
    return { pass: Boolean(error) && after.revision === beforeRevision + 1, actual: error ? `Error "${error.message}", revision unchanged (${after.revision})` : 'Reported success' };
  });
row = await load();
await check('W03', 'scorer1@fairplay.test', 'Change the saved result to 0 – 5', 'Refused — only the organizer can correct',
  rpc('scorer1', 'tournament_record_result', {
    p_tournament_id: T, p_match_id: m1.id, p_payload: body(row, { matches: row.matches.map((match) => (match.id === m1.id ? { ...match, score1: 0, score2: 5, winner: match.team2 } : match)) }), p_expected_revision: row.revision,
  }), refused(/Only the organizer can correct/));

// Play the rest; the champion must only appear at the very end.
let prematureChampion = false;
for (let match = firstMatch(); match; row = await load(), match = firstMatch()) {
  const remaining = row.matches.filter((entry) => !['completed', 'bye'].includes(entry.status)).length;
  await recordResult('scorer1', match.id, 4, 2)();
  const after = await load();
  if (remaining > 1 && Object.keys(after.champion || {}).length > 0) prematureChampion = true;
}
row = await load();
await check('W05', 'scorer1@fairplay.test', 'Play every remaining match', 'No champion until the last match; champion after it',
  async () => row, () => ({ pass: !prematureChampion && Boolean(row.champion?.id), actual: `${prematureChampion ? 'Champion appeared early' : 'No early champion'}; champion ${row.champion?.name}` }));
await check('W05', 'organizer@fairplay.test', 'Forge a champion directly in the table', 'Refused',
  async () => {
    const { error } = await clients.organizer.client.from('tournaments').update({ champion: { id: 't9' } }).eq('id', T);
    if (error) throw new Error(error.message);
  }, refused(/permission denied/));

const final = row.matches.find((match) => match.round === row.total_rounds);
await check('W03', 'organizer@fairplay.test', `Correct the final to 2 – 4 with reason`, 'Champion switches; logged with old and new',
  rpc('organizer', 'tournament_correct_result', {
    p_tournament_id: T, p_match_id: final.id, p_payload: body(row, updateBracketMatch(toEngine(row), final.id, { score1: 2, score2: 4 }, { finalize: true })),
    p_expected_revision: row.revision, p_reason: 'Referee sheet shows 2–4', p_kind: 'correction',
  }), (error, value) => ({ pass: !error && value.champion?.id === final.team2.id, actual: error ? error.message : `Champion now ${value.champion?.name}` }));
row = await load();
await check('W03', 'organizer@fairplay.test', 'Undo the final with reason', 'Final reopened, champion removed',
  rpc('organizer', 'tournament_correct_result', {
    p_tournament_id: T, p_match_id: final.id, p_payload: body(row, { ...resetBracketMatch(toEngine(row), final.id), champion: null }),
    p_expected_revision: row.revision, p_reason: 'Final to be replayed', p_kind: 'undo',
  }), (error, value) => ({ pass: !error && Object.keys(value.champion || {}).length === 0, actual: error ? error.message : `Champion ${JSON.stringify(value.champion)}` }));
await check('W05', 'organizer@fairplay.test', 'Finalize with the final unplayed', 'Refused',
  rpc('organizer', 'tournament_finalize', { p_tournament_id: T }), refused(/Every match must have a saved result/));
row = await load();
await recordResult('scorer1', final.id, 5, 3)();
await check('W05', 'organizer@fairplay.test', 'Finalize after every match is played', 'Finalized',
  rpc('organizer', 'tournament_finalize', { p_tournament_id: T }), (error, value) => ({ pass: !error && value.is_finalized, actual: error ? error.message : `Finalized, champion ${value.champion?.name}` }));
row = await load();
await check('W05', 'organizer@fairplay.test', 'Correct a result after finalization', 'Refused — results are permanent',
  rpc('organizer', 'tournament_correct_result', { p_tournament_id: T, p_match_id: final.id, p_payload: body(row, {}), p_expected_revision: row.revision, p_reason: 'Too late' }), refused(/finalized/));
await check('W04', 'admin@fairplay.test', 'Admin filters the log for this bracket', 'Redraw, correction, undo and finalize entries present',
  async () => (await clients.admin.client.from('result_changes_ph').select('change_type, occurred_at_ph').eq('tournament_id', T).order('id')).data,
  (error, rows) => ({ pass: !error && ['redraw', 'match_correction', 'match_undo', 'finalize'].every((type) => rows.some((entry) => entry.change_type === type)), actual: error ? error.message : rows.map((entry) => entry.change_type).join(', ') }));

// ---------- Report ----------
let version = 'unknown';
try { version = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim() + (execSync('git status --porcelain', { cwd: root }).toString().trim() ? ' + uncommitted revision changes' : ''); } catch { /* not a git checkout */ }
const passed = records.filter((record) => record.pass).length;
const lines = [
  '# Acceptance test record — web, phases 1–2',
  '',
  `- **Application version:** ${version}`,
  `- **Run at:** ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT`,
  `- **Environment:** Supabase test project (${new URL(URL_).hostname.split('.')[0]}), real API requests from Node ${process.version}`,
  `- **Initial state:** fresh approved events "${`Acceptance Pageant ${stamp}`}" (3 contestants, rubric Talent 40 / Poise 30 / Q&A 30) and "${`Acceptance Basketball ${stamp}`}" (5 teams, single elimination); seeded accounts`,
  `- **Result:** ${passed} of ${records.length} passed`,
  '',
  '| # | Item | Account | Action / input | Expected | Actual | Result |',
  '|---|---|---|---|---|---|---|',
  ...records.map((record) => `| ${record.no} | ${record.item} | ${record.account} | ${record.action.replace(/\|/g, '/')} | ${record.expected} | ${String(record.actual).replace(/\|/g, '/')} | ${record.pass ? 'PASS' : '**FAIL**'} |`),
  '',
];
fs.mkdirSync(path.join(root, 'docs', 'revisions'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'revisions', 'acceptance-phase1-2.md'), lines.join('\n'));
console.log(`\n${passed}/${records.length} passed → docs/revisions/acceptance-phase1-2.md`);
process.exit(passed === records.length ? 0 : 1);

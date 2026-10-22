// W01 / W02 / W03 / W04 / W10 / W12 — judge scoring permissions, corrections,
// change log, replacement and rubric locking, enforced by the database.
// The steps build on each other, in order, like one event day.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { as, createDatabase, emails, expectRejected, ids, rpc, seedAccounts } from './harness.mjs';

const EVENT = 9001;
const OTHER_EVENT = 9002;
const CRITERIA = [
  { id: 'talent', name: 'Talent', weight: 40, scoringRange: '1-10' },
  { id: 'poise', name: 'Poise', weight: 30, scoringRange: '1-10' },
  { id: 'qa', name: 'Q&A', weight: 30, scoringRange: '1-10' },
];
const CONTESTANTS = [{ id: 'c1', name: 'Ana' }, { id: 'c2', name: 'Ben' }, { id: 'c3', name: 'Cy' }];
const sheet = (talent, poise, qa) => ({ talent, poise, qa });

let db;
const staff = {};

async function createEvent(owner, id, title) {
  await as(db, owner, () => db.query(
    `insert into public.events (id, title, type, criteria, contestants, status, metadata)
     values ($1, $2, 'pageant', $3, $4, 'draft', '{}'::jsonb)`,
    [id, title, JSON.stringify(CRITERIA), JSON.stringify(CONTESTANTS)]
  ));
}

async function assignAndActivate(key, role, eventId = EVENT, owner = 'organizer') {
  const added = await as(db, owner, () => rpc(db, 'staff_add', {
    p_event_id: eventId, p_role: role, p_email: emails[key], p_full_name: key,
  }));
  const token = await as(db, owner, () => rpc(db, 'staff_invite_token', { p_staff_id: added.id }));
  await as(db, key, () => rpc(db, 'staff_activate', { p_token: token }));
  return added.id;
}

const submit = (key, contestant, scores, eventId = EVENT) => as(db, key, () => rpc(db, 'submit_judge_score', {
  p_event_id: eventId, p_contestant_id: contestant, p_criteria_scores: scores,
}));

before(async () => {
  db = await createDatabase();
  await seedAccounts(db);
  await createEvent('organizer', EVENT, 'Search for Ms. Campus');
  await createEvent('organizer2', OTHER_EVENT, 'Another Organizer Pageant');
});

test('organizers can only assign staff to their own event', async () => {
  await expectRejected(
    as(db, 'organizer2', () => rpc(db, 'staff_add', { p_event_id: EVENT, p_role: 'judge', p_email: emails.judgeB, p_full_name: 'B' })),
    /Only the event organizer/
  );
  await expectRejected(
    as(db, 'organizer', () => rpc(db, 'staff_add', { p_event_id: EVENT, p_role: 'judge', p_email: emails.organizer, p_full_name: 'Me' })),
    /cannot be assigned as its own/
  );
  staff.judgeA = await assignAndActivate('judgeA', 'judge');
  const row = (await db.query('select status, user_id from public.event_staff where id = $1', [staff.judgeA])).rows[0];
  assert.equal(row.status, 'active');
  assert.equal(row.user_id, ids.judgeA);
});

test('an activation link only works for the invited email, once', async () => {
  const added = await as(db, 'organizer', () => rpc(db, 'staff_add', {
    p_event_id: EVENT, p_role: 'judge', p_email: emails.judgeB, p_full_name: 'judgeB',
  }));
  staff.judgeB = added.id;
  const token = await as(db, 'organizer', () => rpc(db, 'staff_invite_token', { p_staff_id: added.id }));
  await expectRejected(as(db, 'judgeC', () => rpc(db, 'staff_activate', { p_token: token })), /sent to judge\.b@test\.edu/);
  await expectRejected(as(db, null, () => rpc(db, 'staff_activate', { p_token: token })), /permission denied|Sign in/);
  await as(db, 'judgeB', () => rpc(db, 'staff_activate', { p_token: token }));
  const tokens = await db.query('select count(*)::int as n from public.event_staff_tokens where staff_id = $1', [added.id]);
  assert.equal(tokens.rows[0].n, 0, 'the link is single-use');
});

test('nobody can score before the event is approved and scoring is opened', async () => {
  await expectRejected(submit('judgeA', 'c1', sheet(8, 7, 9)), /Scoring is not open/);
  await db.query(`update public.events set status = 'upcoming' where id = $1`, [EVENT]); // approved
  await expectRejected(submit('judgeA', 'c1', sheet(8, 7, 9)), /Scoring is not open/);
  await as(db, 'organizer', () => db.query(
    `update public.events set status = 'active', metadata = metadata || '{"scoringActive": true}' where id = $1`, [EVENT]
  ));
});

test('an assigned judge can score, and the database computes the weighted total', async () => {
  const saved = await submit('judgeA', 'c1', sheet(8, 7, 9));
  // (8×40 + 7×30 + 9×30) / 100 = 8.00
  assert.equal(Number(saved.total_score), 8);
  assert.equal(saved.judge_id, ids.judgeA);
  assert.equal(saved.seat_id, staff.judgeA);
  assert.equal(saved.rubric_version, 1);
});

test('W01: the organizer cannot submit a score (only assigned judges can)', async () => {
  await expectRejected(submit('organizer', 'c1', sheet(10, 10, 10)), /not an active judge/);
  await expectRejected(submit('admin', 'c1', sheet(10, 10, 10)), /not an active judge/);
  await expectRejected(submit('student', 'c1', sheet(10, 10, 10)), /not an active judge/);
});

test('W01: a judge cannot score an event they are not assigned to', async () => {
  await db.query(`update public.events set status = 'active', metadata = '{"scoringActive": true}' where id = $1`, [OTHER_EVENT]);
  await expectRejected(submit('judgeA', 'c1', sheet(5, 5, 5), OTHER_EVENT), /not an active judge/);
});

test('W01: direct table writes are refused for every API role', async () => {
  for (const key of ['judgeA', 'organizer', 'admin', null]) {
    await expectRejected(as(db, key, () => db.query(
      `insert into public.scores (id, event_id, judge_id, contestant_id, criteria_scores) values ('x', $1, 'x', 'c1', '{}')`, [EVENT]
    )), /permission denied/);
    await expectRejected(as(db, key, () => db.query(`update public.scores set total_score = 99 where event_id = $1`, [EVENT])), /permission denied/);
    await expectRejected(as(db, key, () => db.query(`delete from public.scores where event_id = $1`, [EVENT])), /permission denied/);
  }
});

test('scores are validated: every criterion, inside its range, registered contestant', async () => {
  await expectRejected(submit('judgeA', 'c2', { talent: 8, poise: 7 }), /Missing a score for "Q&A"/);
  await expectRejected(submit('judgeA', 'c2', sheet(11, 7, 7)), /must be between 1 and 10/);
  await expectRejected(submit('judgeA', 'c2', sheet(0, 7, 7)), /must be between 1 and 10/);
  await expectRejected(submit('judgeA', 'nobody', sheet(8, 8, 8)), /not registered/);
});

test('a judge can change a sheet until it is submitted as final; then only a correction can', async () => {
  await submit('judgeA', 'c2', sheet(7, 7, 7));
  const resubmitted = await submit('judgeA', 'c2', sheet(9, 9, 9));
  assert.equal(Number(resubmitted.total_score), 9);
  const count = await db.query(`select count(*)::int as n from public.scores where event_id = $1 and contestant_id = 'c2'`, [EVENT]);
  assert.equal(count.rows[0].n, 1, 'resubmitting replaces, never duplicates');

  const locked = await as(db, 'judgeA', () => rpc(db, 'lock_my_judge_scores', { p_event_id: EVENT, p_contestant_id: 'c2' }));
  assert.equal(locked, 1);
  await expectRejected(submit('judgeA', 'c2', sheet(1, 1, 1)), /already submitted as final/);
});

test('W03: corrections need the organizer, a reason, and are logged with old and new values', async () => {
  const id = `${EVENT}_${ids.judgeA}_c2`;
  await expectRejected(as(db, 'judgeA', () => rpc(db, 'correct_judge_score', { p_score_id: id, p_criteria_scores: sheet(8, 9, 9), p_reason: 'typo fix' })), /Only the event organizer/);
  await expectRejected(as(db, 'organizer2', () => rpc(db, 'correct_judge_score', { p_score_id: id, p_criteria_scores: sheet(8, 9, 9), p_reason: 'typo fix' })), /Only the event organizer/);
  await expectRejected(as(db, 'organizer', () => rpc(db, 'correct_judge_score', { p_score_id: id, p_criteria_scores: sheet(8, 9, 9), p_reason: '' })), /reason/);

  const corrected = await as(db, 'organizer', () => rpc(db, 'correct_judge_score', {
    p_score_id: id, p_criteria_scores: sheet(8, 9, 9), p_reason: 'Judge read the wrong row of the sheet',
  }));
  // (8×40 + 9×30 + 9×30) / 100 = 8.60
  assert.equal(Number(corrected.total_score), 8.6);
  assert.equal(corrected.judge_id, ids.judgeA, 'the sheet stays attributed to the judge');

  const log = await as(db, 'organizer', () => db.query(`select * from public.result_changes_ph where target_id = $1`, [id]));
  assert.equal(log.rows.length, 1);
  const entry = log.rows[0];
  assert.equal(entry.change_type, 'judge_score_correction');
  assert.equal(entry.actor_id, ids.organizer);
  assert.equal(entry.actor_email, emails.organizer);
  assert.equal(Number(entry.old_value.total), 9);
  assert.equal(Number(entry.new_value.total), 8.6);
  assert.equal(entry.reason, 'Judge read the wrong row of the sheet');
  assert.match(entry.occurred_at_ph, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} PHT$/);
});

test('W04: the change log is read-only and private to the event organizer and admins', async () => {
  await expectRejected(as(db, 'organizer', () => db.query(`update public.result_changes set reason = 'x'`)), /permission denied/);
  await expectRejected(as(db, 'organizer', () => db.query(`delete from public.result_changes`)), /permission denied/);
  const other = await as(db, 'organizer2', () => db.query(`select count(*)::int as n from public.result_changes where event_id = $1`, [EVENT]));
  assert.equal(other.rows[0].n, 0, 'another organizer sees nothing');
  const judge = await as(db, 'judgeA', () => db.query(`select count(*)::int as n from public.result_changes`));
  assert.equal(judge.rows[0].n, 0, 'a judge sees nothing');
  const admin = await as(db, 'admin', () => db.query(`select count(*)::int as n from public.result_changes where event_id = $1`, [EVENT]));
  assert.equal(admin.rows[0].n, 1);
});

test('W10: a revoked judge loses access; their saved sheets stay attributed to them', async () => {
  await submit('judgeB', 'c1', sheet(6, 6, 6));
  await expectRejected(as(db, 'organizer', () => rpc(db, 'staff_revoke', { p_staff_id: staff.judgeB, p_reason: '' })), /reason/);
  await as(db, 'organizer', () => rpc(db, 'staff_revoke', { p_staff_id: staff.judgeB, p_reason: 'Left the venue early' }));
  await expectRejected(submit('judgeB', 'c3', sheet(6, 6, 6)), /not an active judge/);
  const kept = await db.query(`select judge_id from public.scores where event_id = $1 and judge_id = $2`, [EVENT, ids.judgeB]);
  assert.equal(kept.rows.length, 1);
});

test('W10: a replacement judge has their own account and continues the same seat', async () => {
  const replaced = await as(db, 'organizer', () => rpc(db, 'staff_replace', {
    p_staff_id: staff.judgeB, p_email: emails.judgeC, p_full_name: 'judgeC', p_reason: 'Replaces judge B for the remaining contestants',
  }));
  assert.equal(replaced.seatId, staff.judgeB, 'same judging seat');
  const token = await as(db, 'organizer', () => rpc(db, 'staff_invite_token', { p_staff_id: replaced.id }));
  await as(db, 'judgeC', () => rpc(db, 'staff_activate', { p_token: token }));
  const saved = await submit('judgeC', 'c1', sheet(7, 7, 7));
  assert.equal(saved.judge_id, ids.judgeC);
  assert.equal(saved.seat_id, staff.judgeB);

  const old = (await db.query('select status, replaced_by_id from public.event_staff where id = $1', [staff.judgeB])).rows[0];
  assert.equal(old.status, 'replaced');
  assert.equal(old.replaced_by_id, replaced.id);
  const log = await as(db, 'organizer', () => db.query(`select change_type from public.result_changes where event_id = $1 order by id`, [EVENT]));
  assert.deepEqual(log.rows.map((row) => row.change_type), ['judge_score_correction', 'staff_revoke', 'staff_replace']);
});

test('W12: the rubric is frozen once scoring has started — even for an admin', async () => {
  const changed = JSON.stringify([{ ...CRITERIA[0], weight: 50 }, CRITERIA[1], CRITERIA[2]]);
  await expectRejected(as(db, 'organizer', () => db.query(`update public.events set criteria = $1 where id = $2`, [changed, EVENT])), /can no longer|approved/);
  await expectRejected(as(db, 'admin', () => db.query(`update public.events set criteria = $1 where id = $2`, [changed, EVENT])), /Judging has started/);
  const versions = await db.query(`select version from public.rubric_versions where event_id = $1`, [EVENT]);
  assert.deepEqual(versions.rows.map((row) => row.version), [1]);
});

test('W12: before scoring, every rubric change is kept as a new version', async () => {
  const fresh = 9003;
  await createEvent('organizer', fresh, 'Draft event');
  await as(db, 'organizer', () => db.query(`update public.events set criteria = $1 where id = $2`, [JSON.stringify([{ ...CRITERIA[0], weight: 100 }]), fresh]));
  const versions = await db.query(`select version, criteria from public.rubric_versions where event_id = $1 order by version`, [fresh]);
  assert.deepEqual(versions.rows.map((row) => row.version), [1, 2]);
  assert.equal(versions.rows[1].criteria[0].weight, 100);
});

test('finalizing locks every sheet; afterwards nothing can be corrected or added', async () => {
  await expectRejected(as(db, 'judgeA', () => rpc(db, 'finalize_event_scores', { p_event_id: EVENT })), /Only the event organizer/);
  await as(db, 'organizer', () => rpc(db, 'finalize_event_scores', { p_event_id: EVENT }));
  await as(db, 'organizer', () => db.query(
    `update public.events set status = 'completed', metadata = metadata || '{"scoringActive": false}' where id = $1`, [EVENT]
  ));
  const id = `${EVENT}_${ids.judgeA}_c1`;
  await expectRejected(as(db, 'organizer', () => rpc(db, 'correct_judge_score', {
    p_score_id: id, p_criteria_scores: sheet(1, 1, 1), p_reason: 'Trying after finalization',
  })), /final/);
  await expectRejected(submit('judgeA', 'c3', sheet(8, 8, 8)), /not open|finalized/);
});

test('W04: only admins can record a flag review, stamped with who and when', async () => {
  await expectRejected(as(db, 'organizer', () => db.query(
    `insert into public.audit_flag_reviews (flag_key, status, note) values ('audit_log:1', 'reviewed', 'Looks fine to me')`
  )), /row-level security|permission denied/);
  await expectRejected(as(db, 'admin', () => db.query(
    `insert into public.audit_flag_reviews (flag_key, status, note) values ('audit_log:1', 'reviewed', 'ok')`
  )), /check constraint|violates/);
  await as(db, 'admin', () => db.query(
    `insert into public.audit_flag_reviews (flag_key, status, note, reviewed_by) values ('audit_log:1', 'reviewed', 'Duplicate event removed on purpose', 'someone-else')`
  ));
  const saved = (await db.query(`select * from public.audit_flag_reviews where flag_key = 'audit_log:1'`)).rows[0];
  assert.equal(saved.reviewed_by, ids.admin, 'the reviewer is always the signed-in admin');
  assert.equal(saved.reviewed_by_email, emails.admin);
  await expectRejected(as(db, 'admin', () => db.query(`delete from public.audit_flag_reviews`)), /permission denied/);
  const seen = await as(db, 'organizer', () => db.query(`select count(*)::int as n from public.audit_flag_reviews`));
  assert.equal(seen.rows[0].n, 0);
});

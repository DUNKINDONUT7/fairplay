// Applying the revisions to a database that already has live data must not
// delete or change any existing row — accounts, events, scores, brackets,
// judges, registrations, attendance, certificates. (Revisions only add
// tables/columns/functions and change permissions.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { SQL_FILES } from './harness.mjs';

const prepare = (sql) => sql
  .replace(/create extension if not exists pg_cron[^;]*;/gi, '')
  .replace(/create extension if not exists pgcrypto[^;]*;/gi, '');
const run = async (db, files) => {
  for (const file of files) await db.exec(prepare(fs.readFileSync(file, 'utf8')));
};

const TABLES = [
  'profiles', 'events', 'scores', 'tournaments', 'judges', 'judge_assignments', 'judge_invites',
  'registrations', 'attendance', 'certificates', 'teams', 'audience_scores', 'notifications',
];

// Every row of every table, keyed by id, as JSON.
async function snapshot(db) {
  const out = {};
  for (const table of TABLES) {
    const { rows } = await db.query(`select id::text as id, to_jsonb(t) as row from public.${table} t order by id::text`);
    out[table] = Object.fromEntries(rows.map((entry) => [entry.id, entry.row]));
  }
  return out;
}

test('applying the revisions keeps every existing row and value', async () => {
  const db = new PGlite();
  const base = SQL_FILES.filter((file) => !file.includes(`${path.sep}revisions${path.sep}`));
  const revisions = SQL_FILES.filter((file) => file.includes(`${path.sep}revisions${path.sep}`));
  assert.ok(revisions.length >= 3);
  await run(db, base);

  // "Live" data written the way the old app wrote it.
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-000000000001', 'org@live.edu', '{"full_name":"Live Organizer","role":"organizer"}'),
      ('00000000-0000-0000-0000-000000000002', 'student@live.edu', '{"full_name":"Live Student","role":"participant"}');
    insert into public.events (id, title, type, status, owner_id, criteria, contestants, metadata) values
      (1, 'Live Pageant', 'pageant', 'active', '00000000-0000-0000-0000-000000000001',
       '[{"id":"a","name":"Talent","weight":100,"scoringRange":"1-10"}]', '[{"id":"c1","name":"Ana"}]',
       '{"scoringActive": false, "scorerAssignments": [{"token":"old-token","name":"Old Scorer"}], "judgeSessions": [{"sessionId":"s1"}]}'),
      (2, 'Live Basketball', 'sports', 'active', '00000000-0000-0000-0000-000000000001', '[]', '[]', '{"scoringActive": true}');
    insert into public.scores (id, event_id, judge_id, contestant_id, criteria_scores, total_score, locked, judge_name, round_name)
      values ('1_judge@x_c1', 1, 'judge@x', 'c1', '{"a": 9}', 9, true, 'Old Judge', null),
             ('1_judge2@x_c1', 1, 'judge2@x', 'c1', '{"a": 7}', 7, false, 'Old Judge 2', null);
    insert into public.tournaments (id, event_id, name, bracket_type, matches, champion, live_status, is_finalized) values
      (10, 2, 'Live Bracket', 'single',
       '[{"id":"WB-R1-M1","round":1,"position":0,"status":"bye","team1":{"id":"t1"},"winner":{"id":"t1"}},
         {"id":"WB-R1-M2","round":1,"position":1,"status":"scheduled","team1":{"id":"t2"},"team2":{"id":"t3"}},
         {"id":"WB-R2-M1","round":2,"position":0,"status":"bye","team1":{"id":"t1"},"winner":{"id":"t1"}}]',
       '{"id":"t1","name":"Premature Champion"}', 'completed', false);
    -- Finalized after scoring, as on the live site.
    update public.events set status = 'completed' where id = 1;
    insert into public.judges (id, name, email) values (5, 'Old Judge', 'judge@x');
    insert into public.judge_assignments (id, judge_id, event_id, status) values ('5_1', 5, 1, 'active');
    insert into public.judge_invites (id, event_id, judge_email, judge_name, token) values (6, 1, 'judge@x', 'Old Judge', 'invite-token');
    insert into public.registrations (id, event_id, participant_name, email, status) values (7, 1, 'Ana', 'ana@live.edu', 'approved');
    insert into public.attendance (id, event_id, attendee_id, attendee_name, check_in_status) values (8, 1, 'c1', 'Ana', 'checked-in');
    insert into public.certificates (id, event_id, participant_name, recipient_name) values (9, 1, 'Ana', 'Ana');
    insert into public.teams (id, event_id, name) values (11, 2, 'Team One');
    insert into public.audience_scores (id, event_id, contestant_id, voter_key, score) values ('a1', 1, 'c1', 'device-1', 8);
    insert into public.notifications (id, title, message) values ('n1', 'Hello', 'World');
  `);

  const before = await snapshot(db);
  await run(db, revisions);
  await run(db, revisions); // and again: re-running changes nothing either
  const after = await snapshot(db);

  for (const table of TABLES) {
    const beforeIds = Object.keys(before[table]);
    assert.ok(beforeIds.length > 0, `${table} had seed rows`);
    assert.deepEqual(Object.keys(after[table]), beforeIds, `${table}: no row added or removed`);
    for (const id of beforeIds) {
      // New columns may appear; every value that existed must be unchanged.
      for (const [column, value] of Object.entries(before[table][id])) {
        assert.deepEqual(after[table][id][column], value, `${table} ${id}.${column} changed`);
      }
    }
  }
});

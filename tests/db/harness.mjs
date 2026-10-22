// Runs the project's real SQL (schema.sql + finalized-results-lock.sql +
// supabase/revisions/*.sql) on an in-memory Postgres (PGlite), with small
// stand-ins for Supabase's auth/storage/cron pieces (supabase-stubs.sql).
// Each test then acts as a specific signed-in account, exactly the way the
// Supabase API would: SET ROLE authenticated + the JWT claims auth.uid()
// reads. This proves the permission rules hold in the database itself, not
// just in the app's buttons.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supabaseDir = path.join(root, 'supabase');

export const SQL_FILES = [
  path.join(root, 'tests', 'db', 'supabase-stubs.sql'),
  path.join(supabaseDir, 'schema.sql'),
  path.join(supabaseDir, 'finalized-results-lock.sql'),
  ...fs.readdirSync(path.join(supabaseDir, 'revisions'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => path.join(supabaseDir, 'revisions', name)),
];

function prepare(sql) {
  return sql
    .replace(/create extension if not exists pg_cron[^;]*;/gi, '-- (pg_cron stubbed)')
    .replace(/create extension if not exists pgcrypto[^;]*;/gi, '-- (pgcrypto stubbed)');
}

export async function createDatabase() {
  const db = new PGlite();
  for (const file of SQL_FILES) {
    try {
      await db.exec(prepare(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      error.message = `${path.basename(file)}: ${error.message}`;
      throw error;
    }
  }
  return db;
}

export const ids = {
  admin: '00000000-0000-0000-0000-00000000000a',
  organizer: '00000000-0000-0000-0000-000000000001',
  organizer2: '00000000-0000-0000-0000-000000000002',
  judgeA: '00000000-0000-0000-0000-0000000000a1',
  judgeB: '00000000-0000-0000-0000-0000000000b1',
  judgeC: '00000000-0000-0000-0000-0000000000c1',
  scorer: '00000000-0000-0000-0000-000000000051',
  scorerOther: '00000000-0000-0000-0000-000000000052',
  student: '00000000-0000-0000-0000-000000000099',
};

export const emails = {
  admin: 'admin@test.edu',
  organizer: 'organizer@test.edu',
  organizer2: 'organizer2@test.edu',
  judgeA: 'judge.a@test.edu',
  judgeB: 'judge.b@test.edu',
  judgeC: 'judge.c@test.edu',
  scorer: 'scorer@test.edu',
  scorerOther: 'scorer.other@test.edu',
  student: 'student@test.edu',
};

// Creates the accounts (through auth.users, so the real profile trigger runs)
// and gives each its role/status the way an admin would.
export async function seedAccounts(db) {
  const roles = {
    admin: 'admin', organizer: 'organizer', organizer2: 'organizer',
    judgeA: 'judge', judgeB: 'judge', judgeC: 'judge',
    scorer: 'scorer', scorerOther: 'scorer', student: 'participant',
  };
  for (const [key, id] of Object.entries(ids)) {
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [id, emails[key], { full_name: key, role: roles[key] === 'admin' ? 'participant' : roles[key] }]
    );
  }
  // Promotions are an admin's job; done directly here as the database owner.
  await db.exec(`alter table public.profiles disable trigger guard_profile_role_escalation`);
  await db.query(`update public.profiles set role = 'admin', status = 'active' where id = $1`, [ids.admin]);
  await db.query(`update public.profiles set status = 'active' where role = 'organizer'`);
  await db.exec(`alter table public.profiles enable trigger guard_profile_role_escalation`);
}

// Runs `fn` as a signed-in account (or anonymous when key is null), through
// the same role + JWT claims the Supabase API uses. Always switches back.
export async function as(db, key, fn) {
  if (key) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [
      ids[key], JSON.stringify({ sub: ids[key], email: emails[key], role: 'authenticated' }),
    ]);
    await db.exec('set role authenticated');
  } else {
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{}', false)`);
    await db.exec('set role anon');
  }
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{}', false)`);
  }
}

// Calls a database function the way supabase.rpc() does, returning its value.
export async function rpc(db, name, params = {}) {
  const keys = Object.keys(params);
  const args = keys.map((key, index) => `${key} => $${index + 1}`).join(', ');
  const values = keys.map((key) => {
    const value = params[key];
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
  });
  const result = await db.query(`select public.${name}(${args}) as value`, values);
  return result.rows[0]?.value;
}

export async function expectRejected(promise, pattern) {
  try {
    await promise;
  } catch (error) {
    if (pattern && !pattern.test(error.message)) {
      throw new Error(`Rejected, but with an unexpected message: ${error.message}`);
    }
    return error;
  }
  throw new Error(`Expected the database to refuse${pattern ? ` (${pattern})` : ''}, but it accepted.`);
}

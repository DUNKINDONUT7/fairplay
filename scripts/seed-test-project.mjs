// Creates the accounts used by the acceptance tests in a TEST Supabase
// project (never the live one), then gives the admin and organizers their
// role/status the way an admin would.
//
// Usage (PowerShell):
//   $env:VITE_SUPABASE_URL = "https://<test-ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<test project service_role secret>"
//   $env:FAIRPLAY_TEST_PASSWORD = "<a password for every test account>"
//   $env:SUPABASE_DB_URL = "<test project session pooler connection string>"   # optional
//   node scripts/seed-test-project.mjs
// Without SUPABASE_DB_URL the SQL step runs on the CLI's linked project
// (`npx supabase link`), which must be the same test project.
//
// The service_role key bypasses Row Level Security: only pass it as an env
// var for this script, never put it in .env or anything starting with VITE_.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}
if (!dbUrl) {
  const linkedRef = fs.existsSync('supabase/.temp/project-ref') ? fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '';
  if (!linkedRef || !url.includes(linkedRef)) {
    console.error(`The CLI is linked to "${linkedRef || 'nothing'}", not the project in VITE_SUPABASE_URL. Set SUPABASE_DB_URL or relink.`);
    process.exit(1);
  }
}
if (url.includes('lflwjlgexsghiyiwwzys')) {
  console.error('Refusing to seed the live project. Point VITE_SUPABASE_URL at the test project.');
  process.exit(1);
}

// The repository is public, so the shared test password is never written here.
const PASSWORD = process.env.FAIRPLAY_TEST_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('Set FAIRPLAY_TEST_PASSWORD (8+ characters) for the test accounts.');
  process.exit(1);
}
export const TEST_ACCOUNTS = [
  { email: 'admin@fairplay.test', name: 'Test Admin', role: 'participant', promote: 'admin' },
  { email: 'organizer@fairplay.test', name: 'Olivia Organizer', role: 'organizer', promote: 'organizer' },
  { email: 'organizer2@fairplay.test', name: 'Oscar Other-Organizer', role: 'organizer', promote: 'organizer' },
  { email: 'judge1@fairplay.test', name: 'Jenny Judge', role: 'judge' },
  { email: 'judge2@fairplay.test', name: 'Jake Judge', role: 'judge' },
  { email: 'judge3@fairplay.test', name: 'Joy Replacement-Judge', role: 'judge' },
  { email: 'scorer1@fairplay.test', name: 'Sam Scorer', role: 'scorer' },
  { email: 'scorer2@fairplay.test', name: 'Sid Other-Scorer', role: 'scorer' },
  { email: 'student1@fairplay.test', name: 'Ana Reyes', role: 'participant', studentId: '2023-00101', section: 'BSIT 3A' },
  { email: 'student2@fairplay.test', name: 'Ben Cruz', role: 'participant', studentId: '2023-00102', section: 'BSIT 3A' },
  { email: 'student3@fairplay.test', name: 'Cora Lim', role: 'participant', studentId: '2023-00203', section: 'BSCS 2B' },
];

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

for (const account of TEST_ACCOUNTS) {
  const { error } = await supabase.auth.admin.createUser({
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: account.name,
      role: account.role,
      ...(account.studentId ? { student_id: account.studentId, section: account.section } : {}),
    },
  });
  if (error && !/already/i.test(error.message)) {
    console.error(`${account.email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${error ? 'exists ' : 'created'} ${account.email}`);
}

const admins = TEST_ACCOUNTS.filter((account) => account.promote === 'admin').map((account) => `'${account.email}'`).join(', ');
const organizers = TEST_ACCOUNTS.filter((account) => account.promote === 'organizer').map((account) => `'${account.email}'`).join(', ');
const sql = `
alter table public.profiles disable trigger guard_profile_role_escalation;
update public.profiles set role = 'admin', status = 'active' where email in (${admins});
update public.profiles set role = 'organizer', status = 'active' where email in (${organizers});
alter table public.profiles enable trigger guard_profile_role_escalation;
`;
// Passed as a file: multi-line SQL with quotes does not survive a Windows
// shell argument intact.
const sqlFile = path.join(os.tmpdir(), `fairplay-seed-${Date.now()}.sql`);
fs.writeFileSync(sqlFile, sql);
try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'db', 'query', ...(dbUrl ? ['--db-url', dbUrl] : ['--linked']), '-f', sqlFile, '--agent', 'no'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
} finally {
  fs.rmSync(sqlFile, { force: true });
}
console.log('Done. Every test account uses the password in FAIRPLAY_TEST_PASSWORD.');

// Applies the database revisions, in order, to a Supabase project.
//
// Usage (PowerShell), using the project's *Session pooler* connection string
// from Dashboard → Connect (it already contains the database password):
//   $env:SUPABASE_DB_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
//   node scripts/apply-revisions.mjs            # revisions only (existing project)
//   node scripts/apply-revisions.mjs --fresh    # schema.sql first (brand-new project)
//
// Every file is safe to run again (tests/db/migrations.test.mjs proves it).
// Nothing here is stored: the connection string only lives in the env var.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('Set SUPABASE_DB_URL first (see the comment at the top of this script).');
  process.exit(1);
}

const fresh = process.argv.includes('--fresh');
const revisionsDir = path.join(root, 'supabase', 'revisions');
const files = [
  ...(fresh ? [path.join(root, 'supabase', 'schema.sql')] : []),
  path.join(root, 'supabase', 'finalized-results-lock.sql'),
  ...fs.readdirSync(revisionsDir).filter((name) => /^\d+_.*\.sql$/.test(name)).sort().map((name) => path.join(revisionsDir, name)),
];

for (const file of files) {
  process.stdout.write(`Applying ${path.relative(root, file)} … `);
  try {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'db', 'query', '--db-url', dbUrl, '-f', file], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.error(String(error.stderr || error.message).replace(dbUrl, '<SUPABASE_DB_URL>'));
    process.exit(1);
  }
}
console.log('All revisions applied.');

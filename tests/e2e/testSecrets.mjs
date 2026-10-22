// Reads the TEST project's local settings. Nothing secret is kept in the
// repository (it is public): the test-account password and keys live only in
// the git-ignored files .env.test.local and .env.test-secrets.local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile(name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}

export const testEnv = { ...readEnvFile('.env.test.local'), ...readEnvFile('.env.test-secrets.local'), ...process.env };

export function testPassword() {
  const password = testEnv.FAIRPLAY_TEST_PASSWORD;
  if (!password) throw new Error('Set FAIRPLAY_TEST_PASSWORD in .env.test-secrets.local (the password used by scripts/seed-test-project.mjs).');
  return password;
}

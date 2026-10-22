// Every SQL file says "Safe to re-run". Applying the whole set twice proves it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SQL_FILES } from './harness.mjs';

const prepare = (sql) => sql
  .replace(/create extension if not exists pg_cron[^;]*;/gi, '')
  .replace(/create extension if not exists pgcrypto[^;]*;/gi, '');

test('schema + revisions apply cleanly, and apply again without errors', async () => {
  const db = new PGlite();
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const file of SQL_FILES) {
      await assert.doesNotReject(db.exec(prepare(fs.readFileSync(file, 'utf8'))), `pass ${pass}: ${file}`);
    }
  }
});

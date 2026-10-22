// W10 — judge/scorer CSV import: valid, invalid, missing-field and duplicate rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvText, validateStaffCsv, STAFF_CSV_TEMPLATE } from '../src/utils/staffCsv.js';

const SUB_EVENTS = [{ id: 'se-1', name: 'Basketball' }, { id: 'se-2', name: 'Volleyball' }];

test('the published template is itself a valid import', () => {
  const result = validateStaffCsv(STAFF_CSV_TEMPLATE, { subEvents: SUB_EVENTS });
  assert.equal(result.error, '');
  assert.equal(result.valid.length, 2);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.valid[1].subEventId, 'se-1');
});

test('quoted fields, BOM, Windows line endings and column order', () => {
  const text = '﻿email,role,full_name\r\n"ana@x.edu","judge","Reyes, Ana ""Ann"""\r\n';
  const rows = parseCsvText(text);
  assert.deepEqual(rows[1], ['ana@x.edu', 'judge', 'Reyes, Ana "Ann"']);
  const result = validateStaffCsv(text);
  assert.equal(result.valid[0].fullName, 'Reyes, Ana "Ann"');
});

test('every bad row is reported with its line number; good rows still pass', () => {
  const text = [
    'full_name,email,role,sub_event',
    'Valid Judge,valid@x.edu,judge,',            // 2 ok
    ',noname@x.edu,judge,',                      // 3 missing name
    'No Email,,scorer,',                         // 4 missing email
    'Bad Email,not-an-email,judge,',             // 5 invalid email
    'Bad Role,role@x.edu,referee,',              // 6 invalid role
    'Valid Judge Again,VALID@x.edu,judge,',      // 7 duplicate of line 2 (case-insensitive)
    'Same Person Other Role,valid@x.edu,scorer,',// 8 ok: different role
    'Wrong Game,game@x.edu,scorer,Chess',        // 9 unknown sub-event
    'Already There,existing@x.edu,judge,',       // 10 already assigned
  ].join('\n');
  const existing = [{ email: 'existing@x.edu', role: 'judge', status: 'active' }, { email: 'gone@x.edu', role: 'judge', status: 'revoked' }];
  const result = validateStaffCsv(text, { existing, subEvents: SUB_EVENTS });
  assert.deepEqual(result.valid.map((row) => row.line), [2, 8]);
  const byLine = Object.fromEntries(result.invalid.map((row) => [row.line, row.error]));
  assert.match(byLine[3], /missing full name/);
  assert.match(byLine[4], /missing email/);
  assert.match(byLine[5], /not a valid email/);
  assert.match(byLine[6], /role must be judge or scorer/);
  assert.match(byLine[7], /duplicate of row 2/);
  assert.match(byLine[9], /sub-event "Chess"/);
  assert.match(byLine[10], /already assigned/);
});

test('a missing required column stops the import before anything is saved', () => {
  const result = validateStaffCsv('name,email\nA,a@x.edu\n');
  assert.match(result.error, /Missing column\(s\): role/);
  assert.equal(result.valid.length, 0);
});

test('a revoked person can be invited again', () => {
  const result = validateStaffCsv('full_name,email,role\nBack Again,gone@x.edu,judge\n', {
    existing: [{ email: 'gone@x.edu', role: 'judge', status: 'revoked' }],
  });
  assert.equal(result.valid.length, 1);
});

// W04 — which audit entries reach the admin's "Needs review" list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditFlags } from '../src/utils/auditFlags.js';

const at = (minute) => new Date(Date.UTC(2026, 9, 22, 1, minute)).toISOString();
const row = (id, fields) => ({ id, occurred_at: at(id), actor_id: 'u1', actor_email: 'org@x.edu', actor_role: 'organizer', changed_fields: [], ...fields });

test('routine activity is not flagged', () => {
  const flags = buildAuditFlags({ auditRows: [
    row(1, { action: 'insert', table_name: 'events', summary: 'New event' }),
    row(2, { action: 'update', table_name: 'events', changed_fields: ['description'], old_data: { status: 'draft' }, new_data: { status: 'draft' } }),
    row(3, { action: 'update', table_name: 'events', actor_id: null, actor_email: null, changed_fields: ['status'], new_data: { status: 'completed' } }), // nightly auto-close
    row(4, { action: 'update', table_name: 'scores', changed_fields: ['criteria_scores', 'total_score'] }), // judge resubmitting through the app
  ] });
  assert.equal(flags.length, 0);
});

test('deletions, role changes and changes made outside the app are high', () => {
  const flags = buildAuditFlags({ auditRows: [
    row(1, { action: 'delete', table_name: 'scores', summary: 'Ana' }),
    row(2, { action: 'update', table_name: 'profiles', summary: 'Ben', changed_fields: ['role'], old_data: { role: 'participant' }, new_data: { role: 'admin' } }),
    row(3, { action: 'update', table_name: 'tournaments', actor_id: null, actor_email: null, changed_fields: ['champion'] }),
  ] });
  assert.deepEqual(flags.map((flag) => [flag.severity, flag.title]), [
    ['high', 'A bracket was changed outside FairPlay'],
    ['high', "Someone's account type was changed"],
    ['high', 'A judge score was deleted'],
  ]);
  assert.match(flags[1].detail, /Ben changed from Participant\/Student to Admin/);
  assert.ok(flags.every((flag) => flag.why), 'every flag explains why it matters');
});

test('five or more deletions by one person within 10 minutes are reported once as bulk', () => {
  const deletes = [1, 2, 3, 4, 5, 6].map((id) => row(id, { action: 'delete', table_name: 'registrations' }));
  const other = row(40, { action: 'delete', table_name: 'registrations' }); // 39 minutes later: not part of the burst
  const flags = buildAuditFlags({ auditRows: [...deletes, other] });
  const bulk = flags.filter((flag) => flag.source === 'bulk_delete');
  assert.equal(bulk.length, 1);
  assert.match(bulk[0].detail, /^6 deletions within 10 minutes: 6 registrations/);
  // The burst is one flag, not six; the later, separate deletion stays on its own.
  assert.deepEqual(flags.map((flag) => flag.source), ['audit_log', 'bulk_delete']);
});

test('corrections are medium; a redraw that cleared results is high; finalizing is not flagged', () => {
  const flags = buildAuditFlags({ resultChanges: [
    { id: 1, occurred_at: at(1), change_type: 'match_correction', target_label: 'A vs B', reason: 'Referee sheet', actor_email: 'org@x.edu' },
    { id: 2, occurred_at: at(2), change_type: 'redraw', target_label: 'Bracket', reason: 'Wrong teams', old_value: { hadResults: true } },
    { id: 3, occurred_at: at(3), change_type: 'finalize', target_label: 'Bracket', reason: 'done' },
  ] });
  assert.deepEqual(flags.map((flag) => [flag.severity, flag.title]), [['high', 'The bracket was redrawn'], ['medium', 'A saved match result was corrected']]);
});

test('most severe first, then newest; reviews attach to their flag', () => {
  const flags = buildAuditFlags({
    auditRows: [row(1, { action: 'delete', table_name: 'events' }), row(9, { action: 'delete', table_name: 'certificates' })],
    resultChanges: [{ id: 7, occurred_at: at(30), change_type: 'staff_replace', reason: 'Left early' }],
    reviews: [{ flag_key: 'audit_log:1', status: 'reviewed', note: 'Duplicate event, ok' }],
  });
  assert.deepEqual(flags.map((flag) => flag.key), ['audit_log:9', 'audit_log:1', 'result_changes:7']);
  assert.equal(flags[1].review.status, 'reviewed');
  assert.equal(flags[0].review, null);
});

test('a bulk group keeps the same key however the rows arrive (so its review sticks)', () => {
  const same = [5, 3, 9, 1, 7, 2].map((id) => ({ id, occurred_at: '2026-10-22T11:07:00Z', actor_id: null, action: 'delete', table_name: 'events', changed_fields: [] }));
  const keyA = buildAuditFlags({ auditRows: same })[0].key;
  const keyB = buildAuditFlags({ auditRows: [...same].reverse() })[0].key;
  assert.equal(keyA, 'bulk_delete:1');
  assert.equal(keyB, keyA);
});

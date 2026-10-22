// W04 — every audit entry reads as a plain sentence, not database columns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeActor, describeAuditEntry, describeChanges } from '../src/utils/auditDescribe.js';

test('event status, scoring and participant changes read as sentences', () => {
  assert.equal(
    describeAuditEntry({ action: 'update', table_name: 'events', summary: 'NU Singing Contest', changed_fields: ['status'], old_data: { status: 'upcoming' }, new_data: { status: 'active' } }),
    'Changed the status from Approved to In progress.'
  );
  assert.equal(
    describeAuditEntry({ action: 'update', table_name: 'events', changed_fields: ['metadata', 'status'],
      old_data: { status: 'upcoming', metadata: { scoringActive: false } }, new_data: { status: 'active', metadata: { scoringActive: true } } }),
    'Opened scoring and changed the status from Approved to In progress.'
  );
  assert.equal(
    describeAuditEntry({ action: 'update', table_name: 'events', changed_fields: ['contestants', 'participants'],
      old_data: { contestants: [1, 2, 3, 4, 5] }, new_data: { contestants: [1, 2, 3, 4, 5, 6] } }),
    'Added to the participant list (5 → 6).'
  );
});

test('scores, accounts, creations and deletions', () => {
  assert.equal(
    describeAuditEntry({ action: 'update', table_name: 'scores', changed_fields: ['criteria_scores', 'total_score'],
      old_data: { total_score: 8, contestant_name: 'Ana' }, new_data: { total_score: 8.4, contestant_name: 'Ana' } }),
    'Changed the score for Ana from 8.00 to 8.40.'
  );
  assert.equal(
    describeAuditEntry({ action: 'update', table_name: 'profiles', changed_fields: ['role'], old_data: { role: 'participant' }, new_data: { role: 'organizer' } }),
    'Changed the account type from Participant/Student to Organizer.'
  );
  assert.equal(describeAuditEntry({ action: 'insert', table_name: 'scores', new_data: { contestant_name: 'Ben', total_score: 7 } }), 'Submitted a judge score for Ben (total 7.00).');
  assert.equal(describeAuditEntry({ action: 'delete', table_name: 'events', summary: 'Test Event' }), 'Deleted the event "Test Event".');
  assert.equal(describeAuditEntry({ action: 'insert', table_name: 'tournaments', summary: 'Basketball' }), 'Created a new bracket "Basketball".');
});

test('the detail view lists event settings one by one, in words', () => {
  const items = describeChanges({
    changed_fields: ['metadata'],
    old_data: { metadata: { scoringActive: false, audienceVotingOpen: false, organizerEmail: 'a@x' } },
    new_data: { metadata: { scoringActive: true, audienceVotingOpen: true, organizerEmail: 'a@x' } },
  });
  assert.deepEqual(items, [
    { label: 'Scoring open', before: 'No', after: 'Yes' },
    { label: 'Audience voting open', before: 'No', after: 'Yes' },
  ]);
});

test('who did it', () => {
  assert.equal(describeActor({ actor_id: null }), 'FairPlay system or a direct database change');
  assert.equal(describeActor({ actor_id: 'u1', actor_email: 'org@x.edu' }, 'Olivia'), 'Olivia');
});

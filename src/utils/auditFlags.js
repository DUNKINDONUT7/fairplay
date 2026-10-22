// Picks out the audit entries an admin should look at first, so nobody has to
// read through the whole log (W04). Pure function: the same rules run in the
// admin page and in tests/auditFlags.test.mjs.
//
//   high   — data removed, account role/status changed, results changed
//            outside the app, bulk deletions, a redraw that cleared results
//   medium — corrections, undo, voided sheets, staff revoked/replaced,
//            rubric changed after approval, AI monitor findings
//
// Routine activity (normal saves, the nightly auto-close job) is not flagged.

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const IMPORTANT_TABLES = {
  events: 'Event',
  scores: 'Judge score',
  tournaments: 'Bracket',
  registrations: 'Registration',
  certificates: 'Certificate',
  profiles: 'Account',
  event_staff: 'Judge/scorer assignment',
  attendance: 'Attendance record',
};

const ROLE_WORDS = { admin: 'Admin', organizer: 'Organizer', judge: 'Judge', scorer: 'Scorer', participant: 'Participant/Student' };
const STATUS_WORDS = { active: 'Active', pending: 'Waiting for approval', suspended: 'Suspended' };
const word = (map, value) => map[value] || (value ? String(value) : 'none');
const article = (noun) => (/^[aeiou]/i.test(noun) ? 'An' : 'A');

// Plain-language "why should I look at this?" for each kind of flag.
const WHY = {
  deleted: 'Deleting cannot be undone in the app. Make sure it was on purpose (for example a duplicate or a test entry).',
  role: 'The account type decides what a person can see and change. Confirm this change was approved.',
  status: 'Suspended accounts cannot sign in; newly active organizers can create events. Confirm this was intended.',
  outside: 'This did not go through FairPlay, so the usual checks (who is allowed, a reason for the change) did not run.',
  bulk: 'A burst of deletions can be a planned clean-up — or a mistake. Check that nothing important was lost.',
  rubric: 'Changing the scoring criteria after approval can make results unfair to contestants.',
  correction: 'A saved result was changed. Read the reason and make sure it makes sense.',
  redrawResults: 'The draw was redone after games were already played, so those results were cleared.',
  staff: 'Who is allowed to score this event changed. Make sure the right people have access.',
  ai: 'The AI monitor saw a pattern that is often a mistake or unfair scoring.',
};

const RESULT_TABLES = ['scores', 'tournaments'];
const FIELD_WORDS = { criteria_scores: 'criterion scores', total_score: 'total score', locked: 'final/locked', matches: 'match results', champion: 'champion', is_finalized: 'finalized' };
const BULK_DELETE_COUNT = 5;
const BULK_WINDOW_MS = 10 * 60 * 1000;

const CHANGE_LABELS = {
  judge_score_correction: "A judge's saved score was corrected",
  judge_score_void: "A judge's score sheet was cancelled (voided)",
  match_correction: 'A saved match result was corrected',
  match_undo: 'A saved match result was removed (undone)',
  redraw: 'The bracket was redrawn',
  staff_revoke: 'A judge or scorer lost access',
  staff_replace: 'A judge or scorer was replaced',
  attendance_override: 'An attendance record was changed by hand',
  vote_void: 'An audience vote was cancelled',
};

function actorOf(row) {
  return row.actor_email || (row.actor_id ? 'Unknown user' : 'someone working directly in the database (not through the app)');
}

function label(row) {
  return row.summary || (row.record_id ? `#${row.record_id}` : 'record');
}

// Deletions by one person (or by "no app user") that come in a burst: five
// or more within 10 minutes. Returned as groups so they become one flag
// instead of burying the list.
function findBulkDeletes(rows) {
  const byActor = new Map();
  rows.filter((row) => row.action === 'delete').forEach((row) => {
    const key = row.actor_id || 'system';
    if (!byActor.has(key)) byActor.set(key, []);
    byActor.get(key).push(row);
  });
  const groups = [];
  byActor.forEach((deletes) => {
    // Ties broken by id, so a group (and its review) keeps the same key.
    const sorted = [...deletes].sort((left, right) => new Date(left.occurred_at) - new Date(right.occurred_at) || Number(left.id) - Number(right.id));
    let index = 0;
    while (index < sorted.length) {
      let last = index;
      while (last + 1 < sorted.length && new Date(sorted[last + 1].occurred_at) - new Date(sorted[index].occurred_at) <= BULK_WINDOW_MS) last += 1;
      if (last - index + 1 >= BULK_DELETE_COUNT) {
        groups.push(sorted.slice(index, last + 1));
        index = last + 1;
      } else {
        index += 1;
      }
    }
  });
  return groups;
}

function flagsFromAuditLog(rows) {
  const flags = [];
  const bulk = findBulkDeletes(rows);
  const inBulk = new Set(bulk.flat().map((row) => row.id));

  bulk.forEach((group) => {
    const first = group[0];
    const kinds = new Map();
    group.forEach((row) => {
      const kind = IMPORTANT_TABLES[row.table_name] || row.table_name;
      kinds.set(kind, (kinds.get(kind) || 0) + 1);
    });
    const named = group.filter((row) => row.table_name === 'events' || row.table_name === 'profiles').map(label);
    flags.push({
      source: 'bulk_delete',
      sourceId: first.id,
      key: `bulk_delete:${first.id}`,
      severity: 'high',
      title: 'Many records were deleted at once',
      why: WHY.bulk,
      detail: `${group.length} deletions within 10 minutes: ${[...kinds].map(([kind, count]) => `${count} ${kind.toLowerCase()}${count === 1 ? '' : 's'}`).join(', ')}${named.length ? `. Includes ${named.slice(0, 5).map((name) => `"${name}"`).join(', ')}${named.length > 5 ? ` and ${named.length - 5} more` : ''}` : ''}.`,
      occurredAt: group[group.length - 1].occurred_at,
      actor: actorOf(first),
      actorRole: first.actor_role || '',
      table: first.table_name,
      recordId: null,
      count: group.length,
    });
  });

  rows.forEach((row) => {
    const table = row.table_name;
    const kind = IMPORTANT_TABLES[table];
    const base = {
      source: 'audit_log',
      sourceId: row.id,
      key: `audit_log:${row.id}`,
      occurredAt: row.occurred_at,
      actor: actorOf(row),
      actorRole: row.actor_role || '',
      table,
      recordId: row.record_id,
    };
    const changed = row.changed_fields || [];

    if (row.action === 'delete' && kind) {
      if (!inBulk.has(row.id)) {
        flags.push({ ...base, severity: 'high', title: `${article(kind)} ${kind.toLowerCase()} was deleted`, detail: `"${label(row)}" was permanently removed.`, why: WHY.deleted });
      }
      return;
    }

    if (row.action === 'update' && table === 'profiles' && changed.includes('role')) {
      flags.push({
        ...base, severity: 'high', title: "Someone's account type was changed",
        detail: `${label(row)} changed from ${word(ROLE_WORDS, row.old_data?.role)} to ${word(ROLE_WORDS, row.new_data?.role)}.`,
        why: WHY.role,
      });
      return;
    }
    if (row.action === 'update' && table === 'profiles' && changed.includes('status')) {
      flags.push({
        ...base, severity: row.new_data?.status === 'suspended' ? 'high' : 'medium',
        title: row.new_data?.status === 'suspended' ? 'An account was suspended' : row.new_data?.status === 'active' ? 'An account was activated' : "An account's status was changed",
        detail: `${label(row)}: ${word(STATUS_WORDS, row.old_data?.status)} → ${word(STATUS_WORDS, row.new_data?.status)}.`,
        why: WHY.status,
      });
      return;
    }

    // Results written with no signed-in app user behind them (SQL editor,
    // service key, script) bypass every app check, so they always need a look.
    if (RESULT_TABLES.includes(table) && !row.actor_id && ['insert', 'update'].includes(row.action)) {
      const resultFields = changed.filter((field) => ['criteria_scores', 'total_score', 'locked', 'matches', 'champion', 'is_finalized'].includes(field));
      if (row.action === 'insert' || resultFields.length > 0) {
        flags.push({
          ...base, severity: 'high', title: `${article(kind)} ${kind.toLowerCase()} was changed outside FairPlay`,
          detail: `${label(row)} was ${row.action === 'insert' ? 'added' : 'edited'} directly in the database${resultFields.length ? ` (${resultFields.map((field) => FIELD_WORDS[field] || field).join(', ')})` : ''}.`,
          why: WHY.outside,
        });
        return;
      }
    }

    if (row.action === 'update' && table === 'events' && changed.includes('criteria') && row.old_data?.status
      && !['draft', 'pending', 'rejected', 'upcoming'].includes(row.new_data?.status ?? row.old_data?.status)) {
      flags.push({ ...base, severity: 'medium', title: 'Scoring criteria changed after approval', detail: `The criteria of ${label(row)} were edited after the event was approved.`, why: WHY.rubric });
    }
  });

  return flags;
}

function flagsFromResultChanges(rows) {
  // Finalizing is the normal end of an event, not something to review.
  return rows.filter((row) => row.change_type !== 'finalize').map((row) => ({
    source: 'result_changes',
    sourceId: row.id,
    key: `result_changes:${row.id}`,
    severity: row.change_type === 'redraw' && row.old_value?.hadResults ? 'high' : 'medium',
    title: CHANGE_LABELS[row.change_type] || row.change_type,
    detail: `${row.event_title ? `${row.event_title}: ` : ''}${row.target_label || row.target_id}. Reason given: "${row.reason}"`,
    why: row.change_type === 'redraw' && row.old_value?.hadResults ? WHY.redrawResults : ['staff_revoke', 'staff_replace'].includes(row.change_type) ? WHY.staff : WHY.correction,
    occurredAt: row.occurred_at,
    actor: row.actor_email || 'Unknown user',
    actorRole: row.actor_role || '',
    table: 'result_changes',
    recordId: row.target_id,
  }));
}

function flagsFromDetections(detections) {
  return detections
    .filter((detection) => (detection.status || 'open') === 'open')
    .map((detection) => ({
      source: 'ai_detections',
      sourceId: detection.id,
      key: `ai_detections:${detection.id}`,
      severity: ['high', 'critical'].includes(detection.riskLevel || detection.risk_level) ? 'high' : 'medium',
      title: 'The AI monitor noticed something unusual',
      why: WHY.ai,
      detail: detection.reason,
      occurredAt: detection.detectedAt || detection.detected_at,
      actor: detection.actorName || detection.actor_name || 'AI Monitor',
      actorRole: '',
      table: 'ai_detections',
      recordId: detection.targetId || detection.target_id || null,
    }));
}

/**
 * @param {object} input
 * @param {Array} input.auditRows      raw public.audit_log rows
 * @param {Array} [input.resultChanges] public.result_changes_ph rows
 * @param {Array} [input.detections]    AI monitor detections
 * @param {Array} [input.reviews]       public.audit_flag_reviews rows
 * @returns {Array} flags, most severe and newest first, each with its review (if any)
 */
export function buildAuditFlags({ auditRows = [], resultChanges = [], detections = [], reviews = [] } = {}) {
  const reviewByKey = new Map(reviews.map((review) => [review.flag_key, review]));
  const flags = [
    ...flagsFromAuditLog(auditRows),
    // Corrections are already in result_changes with their reason; the raw
    // audit_log update for the same write is not flagged twice.
    ...flagsFromResultChanges(resultChanges),
    ...flagsFromDetections(detections),
  ];
  const seen = new Set();
  return flags
    .filter((flag) => (seen.has(flag.key) ? false : (seen.add(flag.key), true)))
    .map((flag) => ({ ...flag, review: reviewByKey.get(flag.key) || null }))
    .sort((left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      new Date(right.occurredAt) - new Date(left.occurredAt)
    );
}

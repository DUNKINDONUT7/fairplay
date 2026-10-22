// Turns raw audit log rows into plain sentences an admin can read at a
// glance ("Changed the event status from Approved to In progress") instead of
// database column names. Pure: used by the Audit page and its tests.

export const RECORD_KINDS = {
  profiles: 'account',
  events: 'event',
  teams: 'team',
  registrations: 'registration',
  scores: 'judge score',
  judges: 'judge',
  judge_assignments: 'judge assignment',
  judge_invites: 'judge invitation',
  attendance: 'attendance record',
  certificates: 'certificate',
  tournaments: 'bracket',
  brackets: 'bracket',
  matches: 'match',
  rubric_templates: 'saved rubric',
  event_staff: 'judge/scorer assignment',
  platform_settings: 'platform setting',
  audit_flag_reviews: 'audit review',
  result_changes: 'result change',
};

// Column (and event setting) names in everyday words.
export const FIELD_LABELS = {
  title: 'title', description: 'description', location: 'venue', start_date: 'start date', end_date: 'end date',
  status: 'status', criteria: 'scoring criteria', contestants: 'participant list', participants: 'number of participants',
  max_participants: 'maximum participants', judges: 'judge list', sub_events: 'sub-events', metadata: 'event settings',
  enable_certificates: 'certificates', attendance_tracking: 'attendance tracking', anonymous_judging: 'anonymous judging',
  tournament_format: 'bracket format', audience_impact_enabled: 'audience voting', audience_impact_weight: 'audience vote weight',
  audience_voting_open: 'audience voting open', role: 'account type', full_name: 'name', email: 'email', phone: 'phone',
  bio: 'about me', avatar_url: 'profile picture', criteria_scores: 'criterion scores', total_score: 'total score',
  locked: 'final (locked)', locked_at: 'time locked', remarks: 'judge remarks', comments: 'judge notes', voided: 'voided',
  matches: 'match results', champion: 'champion', standings: 'standings', teams: 'teams', rounds: 'rounds',
  is_finalized: 'finalized', is_published: 'public', live_status: 'progress', bracket_type: 'bracket format',
  check_in_status: 'check-in status', recipient_name: 'recipient name', placement: 'placement', score: 'score',
  participant_name: 'participant name', team_name: 'team name', revision: 'version', draw_count: 'number of draws',
  owner_id: 'event owner', rubric_version: 'rubric version', user_id: 'linked account', delivery_status: 'invitation delivery',
  // Settings kept inside events.metadata
  scoringActive: 'scoring open', audienceVotingOpen: 'audience voting open', scorerAssignments: 'scorer list',
  judgeSessions: 'judge links', eliminatedContestantIds: 'eliminated participants', currentRoundIndex: 'current round',
  roundResults: 'round results', generatedReports: 'saved reports', audienceScores: 'audience votes',
  startTime: 'start time', endTime: 'end time', registrationDeadline: 'registration deadline', subEvents: 'sub-events',
  bracketType: 'bracket format', image: 'cover image', imageUrl: 'cover image', tieBreaker: 'tie-breaker',
};

const STATUS_WORDS = {
  draft: 'Draft', pending: 'Waiting for approval', upcoming: 'Approved', active: 'In progress', ongoing: 'In progress',
  completed: 'Completed', archived: 'Archived', rejected: 'Rejected', suspended: 'Suspended', invited: 'Invited',
  revoked: 'Access removed', replaced: 'Replaced', 'checked-in': 'Checked in', waiting: 'Not started', live: 'Live',
  approved: 'Approved', generated: 'Generated', issued: 'Issued',
};
const ROLE_WORDS = {
  admin: 'Admin', organizer: 'Organizer', judge: 'Judge', scorer: 'Scorer', participant: 'Participant/Student',
  'institute-coordinator': 'Institute Coordinator', 'sports-head': 'Head of Sporting Events', osds: 'OSDS',
};

export function fieldLabel(field) {
  return FIELD_LABELS[field] || String(field || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// A value as a person would say it.
export function friendlyValue(field, value) {
  if (value === null || value === undefined || value === '') return 'nothing';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field === 'status' || field === 'check_in_status' || field === 'live_status') return STATUS_WORDS[value] || capitalize(String(value));
  if (field === 'role') return ROLE_WORDS[value] || capitalize(String(value));
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    if (value.name) return String(value.name);
    const keys = Object.keys(value);
    return keys.length === 0 ? 'nothing' : `${keys.length} setting${keys.length === 1 ? '' : 's'}`;
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
  }
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function countOf(value) {
  return Array.isArray(value) ? value.length : null;
}

// Which event settings inside metadata actually changed.
function metadataChanges(oldMeta = {}, newMeta = {}) {
  const keys = new Set([...Object.keys(oldMeta || {}), ...Object.keys(newMeta || {})]);
  return [...keys].filter((key) => JSON.stringify(oldMeta?.[key]) !== JSON.stringify(newMeta?.[key]));
}

/**
 * Every changed field of one entry, in plain words, for the expanded view.
 * Event settings inside `metadata` are listed one by one.
 */
export function describeChanges(row) {
  const fields = row.changed_fields || [];
  const items = [];
  fields.forEach((field) => {
    const before = row.old_data?.[field];
    const after = row.new_data?.[field];
    if (field === 'metadata') {
      metadataChanges(before, after).forEach((key) => {
        items.push({ label: capitalize(fieldLabel(key)), before: friendlyValue(key, before?.[key]), after: friendlyValue(key, after?.[key]) });
      });
      return;
    }
    items.push({ label: capitalize(fieldLabel(field)), before: friendlyValue(field, before), after: friendlyValue(field, after) });
  });
  return items;
}

/** One plain sentence saying what happened. */
export function describeAuditEntry(row) {
  const kind = RECORD_KINDS[row.table_name] || fieldLabel(row.table_name);
  const name = row.summary ? `"${row.summary}"` : '';
  const data = row.new_data || row.old_data || {};

  if (row.action === 'insert') {
    if (row.table_name === 'scores') {
      return `Submitted a judge score${data.contestant_name ? ` for ${data.contestant_name}` : ''}${data.total_score != null ? ` (total ${Number(data.total_score).toFixed(2)})` : ''}.`;
    }
    if (row.table_name === 'profiles') return `New ${friendlyValue('role', data.role)} account created${name ? `: ${name}` : ''}.`;
    if (row.table_name === 'registrations') return `New registration${name ? ` from ${name}` : ''}.`;
    if (row.table_name === 'attendance') return `${name || 'Someone'} was checked in.`;
    if (row.table_name === 'audit_flag_reviews') return `Marked a flagged change as ${data.status === 'dismissed' ? 'not a problem' : 'checked'}: "${data.note || ''}"`;
    if (row.table_name === 'event_staff') return `Assigned ${data.full_name || 'someone'} as ${data.role === 'scorer' ? 'scorer' : 'judge'}.`;
    return `Created a new ${kind}${name ? ` ${name}` : ''}.`;
  }

  if (row.action === 'delete') {
    return `Deleted the ${kind}${name ? ` ${name}` : ''}.`;
  }

  // Updates: describe the most meaningful change, then mention the rest.
  const fields = row.changed_fields || [];
  const oldData = row.old_data || {};
  const newData = row.new_data || {};
  const parts = [];

  fields.forEach((field) => {
    if (field === 'status') {
      parts.push(`changed the status from ${friendlyValue('status', oldData.status)} to ${friendlyValue('status', newData.status)}`);
    } else if (field === 'role') {
      parts.push(`changed the account type from ${friendlyValue('role', oldData.role)} to ${friendlyValue('role', newData.role)}`);
    } else if (field === 'contestants') {
      const before = countOf(oldData.contestants);
      const after = countOf(newData.contestants);
      parts.push(before !== null && after !== null && before !== after
        ? `${after > before ? 'added to' : 'removed from'} the participant list (${before} → ${after})`
        : 'updated the participant list');
    } else if (field === 'total_score' || field === 'criteria_scores') {
      if (field === 'total_score' || !fields.includes('total_score')) {
        parts.push(`changed the score${newData.contestant_name || oldData.contestant_name ? ` for ${newData.contestant_name || oldData.contestant_name}` : ''}${oldData.total_score != null && newData.total_score != null ? ` from ${Number(oldData.total_score).toFixed(2)} to ${Number(newData.total_score).toFixed(2)}` : ''}`);
      }
    } else if (field === 'locked') {
      parts.push(newData.locked ? 'marked the score as final' : 'unlocked the score');
    } else if (field === 'metadata') {
      const settings = metadataChanges(oldData.metadata, newData.metadata);
      if (settings.includes('scoringActive')) {
        parts.push(newData.metadata?.scoringActive ? 'opened scoring' : 'closed scoring');
      }
      const rest = settings.filter((key) => key !== 'scoringActive').map(fieldLabel);
      if (rest.length) parts.push(`changed ${rest.slice(0, 3).join(', ')}${rest.length > 3 ? ` and ${rest.length - 3} more setting${rest.length - 3 === 1 ? '' : 's'}` : ''}`);
    } else if (field === 'matches') {
      parts.push('updated match results');
    } else if (field === 'champion') {
      parts.push(newData.champion?.name ? `set the champion to ${newData.champion.name}` : 'cleared the champion');
    } else if (field === 'is_finalized' && newData.is_finalized) {
      parts.push('made the results final');
    } else if (!['rounds', 'standings', 'revision', 'last_synced_at', 'updated_at', 'history_log', 'current_round', 'live_status', 'stream_message', 'participants'].includes(field)) {
      parts.push(`changed the ${fieldLabel(field)}`);
    }
  });

  const unique = [...new Set(parts)];
  if (unique.length === 0) return `Updated the ${kind}${name ? ` ${name}` : ''}.`;
  const shown = unique.slice(0, 2).join(' and ');
  const more = unique.length > 2 ? `, plus ${unique.length - 2} other change${unique.length - 2 === 1 ? '' : 's'}` : '';
  return `${capitalize(shown)}${more}.`;
}

/** Who did it, in words. */
export function describeActor(row, knownName) {
  if (row.actor_id) return knownName || row.actor_email || 'A signed-in user';
  return 'FairPlay system or a direct database change';
}

import { supabase } from '../utils/supabaseClient';

export const BACKUP_TABLE_GROUPS = [
  {
    label: 'People and accounts',
    tables: [
      ['profiles', 'User profiles'],
      ['judges', 'Judges'],
      ['judge_invites', 'Judge invites'],
      ['notifications', 'Notifications'],
    ],
  },
  {
    label: 'Events and registration',
    tables: [
      ['events', 'Events'],
      ['event_categories', 'Event categories'],
      ['event_locations', 'Event locations'],
      ['teams', 'Teams'],
      ['team_members', 'Team members'],
      ['solo_participants', 'Solo participants'],
      ['registrations', 'Registrations'],
      ['attendance', 'Attendance'],
      ['certificates', 'Certificates'],
    ],
  },
  {
    label: 'Judging and scoring',
    tables: [
      ['scores', 'Judge scores'],
      ['audience_scores', 'Audience votes'],
      ['judge_assignments', 'Judge assignments'],
      ['judge_status_logs', 'Judge status history'],
      ['rubric_templates', 'Rubric templates'],
      ['tournaments', 'Tournaments'],
      ['brackets', 'Brackets'],
      ['matches', 'Matches'],
      ['match_participants', 'Match participants'],
    ],
  },
  {
    label: 'System',
    tables: [
      ['platform_settings', 'Platform settings'],
      ['ai_detections', 'AI detections'],
      ['audit_log', 'Audit log'],
    ],
  },
];

export const BACKUP_TABLES = BACKUP_TABLE_GROUPS.flatMap((group) => group.tables.map(([name]) => name));
export const TABLE_LABELS = Object.fromEntries(BACKUP_TABLE_GROUPS.flatMap((group) => group.tables));
export const BACKUP_ONLY_TABLES = ['audit_log'];

export class BackupServiceError extends Error {
  constructor(message, { notDeployed = false, sqlNeeded = false } = {}) {
    super(message);
    this.notDeployed = notDeployed;
    this.sqlNeeded = sqlNeeded;
  }
}

async function readErrorBody(error) {
  try {
    return await error?.context?.json?.();
  } catch {
    return null;
  }
}

export async function callBackupFunction(body, { timeoutMs = 180000 } = {}) {
  if (!supabase) throw new BackupServiceError('FairPlay is not connected to Supabase.');

  const { data, error } = await Promise.race([
    supabase.functions.invoke('admin-backup', { body }),
    new Promise((_, reject) => setTimeout(() => reject(new BackupServiceError('The backup service took too long to respond. Please try again.')), timeoutMs)),
  ]);

  if (error) {
    const payload = await readErrorBody(error);
    const status = error?.context?.status;
    const message = payload?.error || payload?.message || error.message || 'The backup service is unavailable.';
    const notDeployed = error.name === 'FunctionsFetchError'
      || error.name === 'FunctionsRelayError'
      || (status === 404 && /function/i.test(String(payload?.message || payload?.code || message)));
    const sqlNeeded = /backups/i.test(message) && /(does not exist|schema cache|bucket not found)/i.test(message);
    throw new BackupServiceError(
      notDeployed ? 'The backup service is not deployed yet.' : message,
      { notDeployed, sqlNeeded },
    );
  }
  if (data?.error) throw new BackupServiceError(data.error);
  return data;
}

// Used when the backup service is not deployed: reads each table with the
// admin's own access and builds the same file format, so a download still works.
export async function exportDirect(actor) {
  if (!supabase) throw new Error('FairPlay is not connected to Supabase.');
  const tables = {};
  const counts = {};
  const skipped = [];
  for (const table of BACKUP_TABLES) {
    const rows = [];
    let failed = false;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select('*').order('id').range(from, from + 999);
      if (error) {
        failed = true;
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (failed) {
      skipped.push(table);
      continue;
    }
    tables[table] = rows;
    counts[table] = rows.length;
  }
  return {
    payload: {
      format: 'fairplay-backup',
      version: 2,
      createdAt: new Date().toISOString(),
      kind: 'manual',
      note: 'Downloaded directly from the browser',
      createdBy: actor,
      counts,
      tables,
    },
    skipped,
  };
}

export function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadFromUrl(url, fileName) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || '';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// Reads a picked file and describes it, without changing anything.
export function inspectBackupFile(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON, so it cannot be a FairPlay backup.' };
  }
  if (payload?.format === 'fairplay-backup' && payload?.version === 2 && payload.tables && typeof payload.tables === 'object') {
    const counts = Object.fromEntries(Object.entries(payload.tables).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0]));
    return { ok: true, legacy: false, payload, counts, createdAt: payload.createdAt, createdBy: payload.createdBy, kind: payload.kind, note: payload.note };
  }
  if (payload && Array.isArray(payload.users) && Array.isArray(payload.events)) {
    const counts = {};
    ['users', 'events', 'judges', 'registrations', 'scores', 'attendance'].forEach((key) => {
      if (Array.isArray(payload[key])) counts[key] = payload[key].length;
    });
    return { ok: true, legacy: true, payload, counts, createdAt: payload.generatedAt, createdBy: null, kind: 'old format', note: null };
  }
  return { ok: false, error: 'This file is not a FairPlay backup.' };
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

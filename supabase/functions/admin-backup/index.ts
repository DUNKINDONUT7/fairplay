// Admin-only full-database backup, backup history and restore.
//
// Deploy with JWT verification off (this function checks the caller itself,
// and the daily cron calls it with a shared secret instead of a user token):
//   npx supabase functions deploy admin-backup --no-verify-jwt
//   npx supabase secrets set BACKUP_CRON_SECRET=<long random string>
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-backup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Parents before children, so a restore never inserts a row whose foreign
// key target is not there yet.
const RESTORE_ORDER = [
  'profiles', 'events', 'teams', 'registrations', 'scores', 'audience_scores',
  'judges', 'judge_assignments', 'attendance', 'certificates', 'notifications',
  'tournaments', 'event_categories', 'event_locations', 'team_members',
  'solo_participants', 'brackets', 'matches', 'match_participants',
  'judge_status_logs', 'ai_detections', 'judge_invites', 'rubric_templates',
  'platform_settings',
];
// Backed up for the record, never written back (append-only history).
const BACKUP_ONLY = ['audit_log'];
const ALL_TABLES = [...RESTORE_ORDER, ...BACKUP_ONLY];

const PAGE_SIZE = 1000;
const WRITE_CHUNK = 500;
const AUTO_INTERVAL_DAYS = 3;
const KEEP_AUTOMATIC = 10;
const BUCKET = 'backups';

type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isMissingTable(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function readTable(db: SupabaseClient, table: string): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select('*').order('id').range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isMissingTable(error)) return null;
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function countTables(db: SupabaseClient) {
  const counts: Record<string, number | null> = {};
  await Promise.all(ALL_TABLES.map(async (table) => {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    counts[table] = error ? null : count ?? 0;
  }));
  return counts;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Row)
    .filter((key) => key !== 'updated_at')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Row)[key])}`);
  return `{${entries.join(',')}}`;
}

interface Actor { id: string | null; email: string | null; name: string | null }

async function createBackup(
  db: SupabaseClient,
  { kind, note, tables, actor }: { kind: string; note?: string; tables?: string[]; actor: Actor },
) {
  const wanted = (tables && tables.length > 0 ? ALL_TABLES.filter((t) => tables.includes(t)) : ALL_TABLES);
  const data: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  const skipped: string[] = [];

  for (const table of wanted) {
    const rows = await readTable(db, table);
    if (rows === null) {
      skipped.push(table);
      continue;
    }
    data[table] = rows;
    counts[table] = rows.length;
  }

  const createdAt = new Date().toISOString();
  const payload = {
    format: 'fairplay-backup',
    version: 2,
    createdAt,
    kind,
    note: note || null,
    createdBy: actor,
    counts,
    tables: data,
  };
  const body = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(body);
  const path = `${kind}/${createdAt.replace(/[:.]/g, '-')}.json`;

  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/json',
    upsert: false,
  });
  if (uploadError) throw new Error(`Could not store the backup file: ${uploadError.message}`);

  const totalRecords = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const { data: record, error: insertError } = await db.from('backups').insert({
    kind,
    note: note || null,
    storage_path: path,
    size_bytes: bytes.byteLength,
    table_counts: counts,
    total_records: totalRecords,
    created_by: actor.id,
    created_by_email: actor.email,
  }).select().single();
  if (insertError) {
    await db.storage.from(BUCKET).remove([path]);
    throw new Error(`Could not record the backup: ${insertError.message}`);
  }

  return { record, skipped };
}

async function pruneAutomatic(db: SupabaseClient) {
  const { data } = await db.from('backups').select('id, storage_path').eq('kind', 'automatic')
    .order('created_at', { ascending: false });
  const old = (data || []).slice(KEEP_AUTOMATIC);
  if (old.length === 0) return 0;
  await db.storage.from(BUCKET).remove(old.map((row) => row.storage_path));
  await db.from('backups').delete().in('id', old.map((row) => row.id));
  return old.length;
}

async function loadBackupFile(db: SupabaseClient, id: string) {
  const { data: record, error } = await db.from('backups').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!record) throw new Error('Backup not found.');
  const { data: file, error: downloadError } = await db.storage.from(BUCKET).download(record.storage_path);
  if (downloadError || !file) throw new Error('The backup file could not be read.');
  const payload = JSON.parse(await file.text());
  return { record, payload };
}

function validatePayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return 'This file is not a FairPlay backup.';
  if (payload.format !== 'fairplay-backup' || payload.version !== 2 || typeof payload.tables !== 'object') {
    return 'This file is not a FairPlay backup in the current format.';
  }
  for (const [table, rows] of Object.entries(payload.tables)) {
    if (!ALL_TABLES.includes(table)) return `Unknown table in backup: ${table}`;
    if (!Array.isArray(rows)) return `Table ${table} is not a list of records.`;
  }
  return null;
}

async function previewRestore(db: SupabaseClient, payload: any) {
  const tables = [];
  for (const table of ALL_TABLES) {
    const backupRows: Row[] | undefined = payload.tables?.[table];
    if (!backupRows) continue;
    const restorable = RESTORE_ORDER.includes(table);
    if (!restorable) {
      tables.push({ table, inBackup: backupRows.length, restorable, newCount: 0, changedCount: 0, unchangedCount: 0 });
      continue;
    }
    const current = await readTable(db, table);
    const currentById = new Map((current || []).map((row) => [String(row.id), stableStringify(row)]));
    let newCount = 0;
    let changedCount = 0;
    let unchangedCount = 0;
    for (const row of backupRows) {
      const existing = currentById.get(String(row.id));
      if (existing === undefined) newCount += 1;
      else if (existing === stableStringify(row)) unchangedCount += 1;
      else changedCount += 1;
    }
    tables.push({ table, inBackup: backupRows.length, restorable, missingInDatabase: current === null, newCount, changedCount, unchangedCount });
  }
  return tables;
}

async function restoreTables(db: SupabaseClient, payload: any, selected: string[]) {
  const results = [];
  for (const table of RESTORE_ORDER) {
    if (!selected.includes(table)) continue;
    const backupRows: Row[] = payload.tables?.[table] || [];
    const current = await readTable(db, table);
    if (current === null) {
      results.push({ table, written: 0, failed: backupRows.length, errors: ['This table does not exist in the database.'] });
      continue;
    }
    const currentById = new Map(current.map((row) => [String(row.id), stableStringify(row)]));
    // Only rows that are new or different get written; identical rows are left alone.
    const toWrite = backupRows.filter((row) => currentById.get(String(row.id)) !== stableStringify(row));

    let written = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < toWrite.length; i += WRITE_CHUNK) {
      const chunk = toWrite.slice(i, i + WRITE_CHUNK);
      const { error } = await db.from(table).upsert(chunk, { onConflict: 'id' });
      if (!error) {
        written += chunk.length;
        continue;
      }
      // One bad row (e.g. a locked score) should not sink the whole chunk.
      for (const row of chunk) {
        const { error: rowError } = await db.from(table).upsert(row, { onConflict: 'id' });
        if (rowError) {
          failed += 1;
          if (errors.length < 3) errors.push(`#${row.id}: ${rowError.message}`);
        } else {
          written += 1;
        }
      }
    }
    results.push({ table, written, failed, errors });
  }
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Backup service is not configured.' }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  // Automatic backup, called daily by the Vercel cron with a shared secret;
  // it only actually backs up once every AUTO_INTERVAL_DAYS days.
  const cronSecret = Deno.env.get('BACKUP_CRON_SECRET') || '';
  const givenSecret = req.headers.get('x-backup-secret') || '';
  if (givenSecret) {
    if (!cronSecret || givenSecret !== cronSecret) return json({ error: 'Unauthorized.' }, 401);
    try {
      const { data: latest } = await db.from('backups').select('created_at').eq('kind', 'automatic')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      // An hour of slack so a cron that fires a little early is not pushed a whole day.
      const dueAfter = AUTO_INTERVAL_DAYS * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
      if (latest && Date.now() - new Date(latest.created_at).getTime() < dueAfter) {
        return json({ skipped: true, reason: `Last automatic backup is less than ${AUTO_INTERVAL_DAYS} days old.` });
      }
      const { record, skipped } = await createBackup(db, {
        kind: 'automatic',
        note: `Automatic backup (every ${AUTO_INTERVAL_DAYS} days)`,
        actor: { id: null, email: null, name: 'Automatic' },
      });
      const pruned = await pruneAutomatic(db);
      return json({ backup: record, skipped, pruned });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  // Everything else requires a signed-in admin.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData?.user) return json({ error: 'Please sign in again.' }, 401);
  const { data: profile } = await db.from('profiles').select('id, email, full_name, role').eq('id', authData.user.id).maybeSingle();
  if (!profile || profile.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const actor: Actor = { id: profile.id, email: profile.email || authData.user.email || null, name: profile.full_name || null };

  try {
    switch (action) {
      case 'overview': {
        const [counts, list] = await Promise.all([
          countTables(db),
          db.from('backups').select('*').order('created_at', { ascending: false }).limit(200),
        ]);
        if (list.error) throw new Error(list.error.message);
        return json({
          counts,
          backups: list.data,
          automaticConfigured: Boolean(cronSecret),
          keepAutomatic: KEEP_AUTOMATIC,
          intervalDays: AUTO_INTERVAL_DAYS,
        });
      }

      case 'create': {
        const tables = Array.isArray(body.tables) ? body.tables.map(String) : undefined;
        const note = typeof body.note === 'string' ? body.note.slice(0, 200) : '';
        const { record, skipped } = await createBackup(db, { kind: 'manual', note, tables, actor });
        return json({ backup: record, skipped });
      }

      case 'download': {
        const { data: record } = await db.from('backups').select('storage_path, created_at, kind').eq('id', String(body.id)).maybeSingle();
        if (!record) return json({ error: 'Backup not found.' }, 404);
        const fileName = `fairplay-backup-${String(record.created_at).slice(0, 19).replace(/[:T]/g, '-')}-${record.kind}.json`;
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(record.storage_path, 120, { download: fileName });
        if (error || !data) throw new Error('Could not create a download link.');
        return json({ url: data.signedUrl, fileName });
      }

      case 'delete': {
        const { data: record } = await db.from('backups').select('id, storage_path').eq('id', String(body.id)).maybeSingle();
        if (!record) return json({ error: 'Backup not found.' }, 404);
        await db.storage.from(BUCKET).remove([record.storage_path]);
        const { error } = await db.from('backups').delete().eq('id', record.id);
        if (error) throw new Error(error.message);
        return json({ deleted: true });
      }

      case 'import': {
        const payload = body.payload;
        const problem = validatePayload(payload);
        if (problem) return json({ error: problem }, 400);
        const counts: Record<string, number> = {};
        for (const [table, rows] of Object.entries(payload.tables)) counts[table] = (rows as Row[]).length;
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        const path = `uploaded/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/json' });
        if (uploadError) throw new Error(`Could not store the file: ${uploadError.message}`);
        const { data: record, error } = await db.from('backups').insert({
          kind: 'uploaded',
          note: typeof body.note === 'string' ? body.note.slice(0, 200) : `Uploaded file${payload.createdBy?.email ? ` (made by ${payload.createdBy.email})` : ''}`,
          storage_path: path,
          size_bytes: bytes.byteLength,
          table_counts: counts,
          total_records: Object.values(counts).reduce((sum, n) => sum + n, 0),
          created_by: actor.id,
          created_by_email: actor.email,
          source_created_at: payload.createdAt || null,
        }).select().single();
        if (error) {
          await db.storage.from(BUCKET).remove([path]);
          throw new Error(error.message);
        }
        return json({ backup: record });
      }

      case 'preview-restore': {
        const { record, payload } = await loadBackupFile(db, String(body.id));
        const problem = validatePayload(payload);
        if (problem) return json({ error: problem }, 400);
        return json({ backup: record, tables: await previewRestore(db, payload) });
      }

      case 'restore': {
        const selected: string[] = Array.isArray(body.tables) ? body.tables.map(String).filter((t: string) => RESTORE_ORDER.includes(t)) : [];
        if (selected.length === 0) return json({ error: 'Choose at least one table to restore.' }, 400);
        const { payload } = await loadBackupFile(db, String(body.id));
        const problem = validatePayload(payload);
        if (problem) return json({ error: problem }, 400);

        // Safety net: snapshot the current data before touching anything.
        const { record: safety } = await createBackup(db, {
          kind: 'pre-restore',
          note: `Automatic safety backup before restoring ${selected.length} table${selected.length === 1 ? '' : 's'}`,
          actor,
        });
        const results = await restoreTables(db, payload, selected);
        return json({ results, safetyBackup: safety });
      }

      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message || 'Something went wrong.' }, 500);
  }
});

// Vercel Cron Job: runs daily and asks the admin-backup Edge Function for an
// automatic backup. The function only takes one every 3 days (it skips the
// other runs) and keeps the latest 10.
//
// Needs BACKUP_CRON_SECRET in both places: Vercel env vars (here) and the
// Supabase function secrets (`npx supabase secrets set BACKUP_CRON_SECRET=...`).
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const backupSecret = process.env.BACKUP_CRON_SECRET;
  if (!supabaseUrl || !backupSecret) {
    console.error('daily-backup: missing VITE_SUPABASE_URL or BACKUP_CRON_SECRET.');
    return res.status(500).json({ error: 'Backup cron is not configured.' });
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-backup-secret': backupSecret },
    body: JSON.stringify({ action: 'create' }),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('daily-backup: failed:', result?.error || response.status);
    return res.status(502).json({ error: result?.error || 'Backup failed.' });
  }

  if (result.skipped) return res.status(200).json({ skipped: true, reason: result.reason });
  return res.status(200).json({ backup: result.backup?.id, records: result.backup?.total_records, pruned: result.pruned });
}

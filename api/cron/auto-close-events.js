// Vercel Cron Job: closes events an organizer never manually closed.
//
// Schedule lives in vercel.json ("crons"). Vercel invokes this route on a
// GET request and, when the CRON_SECRET env var is set, automatically signs
// the request with `Authorization: Bearer <CRON_SECRET>` — the check below
// rejects anything that doesn't carry that header, so this endpoint can't be
// hit by a random request and mass-close every event on demand.
//
// This does the same query the `public.auto_close_expired_events()` Postgres
// function (supabase/schema.sql) runs on its own daily pg_cron schedule. Only
// enable one of the two schedules in a given environment — running both is
// harmless (the second run just finds nothing left to close) but redundant.
import { createClient } from '@supabase/supabase-js';

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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('auto-close-events: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    return res.status(500).json({ error: 'Supabase service credentials are not configured.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Anything already in a terminal status is left alone; every other status
  // (active, ongoing, upcoming, etc.) counts as "still open" for this check.
  const TERMINAL_STATUSES = ['draft', 'completed', 'archived', 'rejected'];
  const graceCutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('events')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
    .lte('end_date', graceCutoff)
    .select('id, title, end_date');

  if (error) {
    console.error('auto-close-events: update failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ closed: data.length, events: data });
}

// One-time helper to create the FairPlay demo/seed accounts as real Supabase
// Auth users, so login no longer has to fall back to the local demo mode.
//
// The `on_auth_user_created` trigger (supabase/schema.sql) reads
// raw_user_meta_data.full_name / .role off the created auth user and inserts
// the matching `profiles` row automatically — this script does not touch
// `profiles` directly.
//
// Usage (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-secret"
//   node scripts/seed-auth-users.mjs
//
// The service_role key is found in the Supabase dashboard under
// Project Settings > API > "service_role" secret. NEVER put it in .env
// (or anything with a VITE_ prefix) — that key bypasses Row Level Security
// and must never ship to the browser. Only pass it as a local env var, and
// only for running this script.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lflwjlgexsghiyiwwzys.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var. See the comment at the top of this script.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: 'admin@fairplay.com', password: 'Admin123!', name: 'Admin User', role: 'admin' },
  { email: 'organizer@fairplay.com', password: 'Organizer123!', name: 'Organizer User', role: 'organizer' },
  { email: 'judge@fairplay.com', password: 'Judge123!', name: 'Judge User', role: 'judge' },
  { email: 'participant@fairplay.com', password: 'Participant123!', name: 'Participant User', role: 'participant' },
];

for (const seedUser of USERS) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: seedUser.email,
    password: seedUser.password,
    email_confirm: true,
    user_metadata: { full_name: seedUser.name, role: seedUser.role },
  });

  if (error) {
    if (error.message?.toLowerCase().includes('already been registered') || error.code === 'email_exists') {
      console.log(`- ${seedUser.email} already exists, skipping.`);
    } else {
      console.error(`x ${seedUser.email} failed: ${error.message}`);
    }
    continue;
  }

  console.log(`+ ${seedUser.email} created (id ${data.user.id}).`);
}

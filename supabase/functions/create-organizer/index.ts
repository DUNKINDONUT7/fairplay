import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Organizer accounts are no longer self-service (see authStore.js's
// register() — the public Register form now only ever creates participant
// accounts). This is the only remaining way an organizer account gets
// created: an admin sets the email and password directly here, and the
// account is active immediately — the admin creating it *is* the approval,
// unlike the old pending-application flow this replaces for new accounts.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Admin service is not configured.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  const { data: callerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Admin access required.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!name) {
    return jsonResponse({ error: 'Organizer name is required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400);
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return jsonResponse({ error: 'Password must be at least 8 characters and include uppercase, lowercase, and a number.' }, 400);
  }

  const { data: existingUsersData, error: listUsersError } = await supabase.auth.admin.listUsers();
  if (listUsersError) {
    return jsonResponse({ error: listUsersError.message }, 500);
  }

  const existingUser = existingUsersData?.users?.find((user) => user.email?.toLowerCase() === email) || null;
  if (existingUser) {
    return jsonResponse({ error: 'An account with this email already exists.' }, 409);
  }

  const { data: createdUserData, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, role: 'organizer' },
  });

  if (createUserError || !createdUserData?.user) {
    return jsonResponse({ error: createUserError?.message || 'Unable to create the organizer account.' }, 500);
  }

  // The on_auth_user_created trigger already inserted a profiles row from
  // this same createUser call, but with status 'pending' (its default for
  // role 'organizer', built for the old self-service flow) — this upsert
  // overrides that: an admin-created organizer is active right away.
  const { error: profileUpsertError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: createdUserData.user.id,
        email,
        full_name: name,
        role: 'organizer',
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (profileUpsertError) {
    return jsonResponse({ error: profileUpsertError.message }, 500);
  }

  return jsonResponse({ created: true, userId: createdUserData.user.id, email, name });
});

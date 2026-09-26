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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  // Same key lookup as create-organizer: this project stores the working
  // service_role key as PROJECT_SERVICE_ROLE_KEY (see the note there).
  const serviceRoleKey = Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Admin service is not configured.' }, 500);
  }

  // Caller-identity client only: the caller's own token, used to confirm who
  // is asking. The privileged client below must keep the service_role key as
  // its Authorization header — overriding it with the caller's token (as this
  // function used to) makes the Admin API reject deleteUser.
  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: 'Please sign in again.' }, 401);
  }

  const { data: callerProfile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !callerProfile) {
    return jsonResponse({ error: 'Your profile could not be loaded.' }, 403);
  }

  if (callerProfile.role !== 'admin' && callerProfile.role !== 'organizer') {
    return jsonResponse({ error: 'Admin or organizer access required.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || '').trim();

  if (!userId) {
    return jsonResponse({ error: 'userId is required.' }, 400);
  }
  if (userId === authData.user.id) {
    return jsonResponse({ error: 'You cannot delete your own account.' }, 400);
  }

  const { data: targetProfile, error: targetProfileError } = await serviceClient
    .from('profiles')
    .select('id, role, email')
    .eq('id', userId)
    .maybeSingle();

  if (targetProfileError) {
    return jsonResponse({ error: targetProfileError.message }, 500);
  }

  if (!targetProfile) {
    return jsonResponse({ error: 'User not found.' }, 404);
  }

  if (callerProfile.role !== 'admin' && targetProfile.role !== 'judge') {
    return jsonResponse({ error: 'Organizers can only remove judge accounts.' }, 403);
  }

  // Remove the sign-in account first: if that fails, nothing has changed and
  // the admin can retry, instead of leaving a profile-less account that can
  // still log in.
  const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(userId);
  if (authDeleteError && authDeleteError.status !== 404) {
    return jsonResponse({ error: `The account could not be deleted: ${authDeleteError.message}` }, 500);
  }

  const { error: profileDeleteError } = await serviceClient.from('profiles').delete().eq('id', userId);
  if (profileDeleteError) {
    return jsonResponse({ error: `The sign-in account was removed, but the profile could not be: ${profileDeleteError.message}` }, 500);
  }

  return jsonResponse({ deleted: true });
});

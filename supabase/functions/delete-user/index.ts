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
  const userId = String(body.userId || '').trim();

  if (!userId) {
    return jsonResponse({ error: 'userId is required.' }, 400);
  }
  if (userId === authData.user.id) {
    return jsonResponse({ error: 'You cannot delete your own account.' }, 400);
  }

  const { error: profileDeleteError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileDeleteError) {
    return jsonResponse({ error: profileDeleteError.message }, 500);
  }

  // Actually remove the Supabase Auth account — deleting only the profiles
  // row (the old behavior) left the account able to log in with no profile.
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
  if (authDeleteError && authDeleteError.status !== 404) {
    return jsonResponse({ error: `Profile removed, but the auth account could not be deleted: ${authDeleteError.message}` }, 500);
  }

  return jsonResponse({ deleted: true });
});

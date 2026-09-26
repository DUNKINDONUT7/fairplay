import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
// created: an admin sets the email and password here, the organizer gets a
// confirmation email, and the account waits as a pending application until
// an admin approves it. Signing in needs both the confirmed email and the
// approval.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  // The Supabase-auto-injected SUPABASE_SERVICE_ROLE_KEY has not
  // authenticated as service_role in this project (same issue noted in
  // notify-judge-invite), and the dashboard's Edge Function Secrets screen
  // now outright refuses to let a secret name start with SUPABASE_ anyway
  // (that prefix is reserved), so there is no way to override it under its
  // original name even if the auto-injected value were wrong. The actual
  // key has to be stored under a different name instead — set
  // PROJECT_SERVICE_ROLE_KEY to the legacy-format service_role key from
  // Project Settings > API Keys > "Legacy anon, service_role API keys".
  const serviceRoleKey = Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Admin service is not configured. Set the PROJECT_SERVICE_ROLE_KEY secret.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';

  // Caller-identity client only — anon key with the caller's own forwarded
  // token, used solely to confirm who's asking and that they're an admin.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Admin access required.' }, 403);
  }

  // Privileged client — the real service role key, with its own default
  // Authorization header left untouched. The Admin API below requires that
  // header to literally be the service_role key; building this from the
  // same client as the caller check above (overriding its Authorization
  // with the caller's own token, as create-organizer originally did) is
  // exactly what produced "User not allowed" — the Admin API saw the
  // caller's regular session token instead of service_role, every time,
  // regardless of whether the key itself was valid.
  const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  // listUsers() only returns one page (50 by default), so page through them;
  // otherwise an existing email beyond the first page goes unnoticed.
  for (let page = 1; page <= 50; page += 1) {
    const { data: pageData, error: listUsersError } = await serviceRoleClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (listUsersError) {
      return jsonResponse({ error: listUsersError.message }, 500);
    }
    const users = pageData?.users || [];
    if (users.some((user) => user.email?.toLowerCase() === email)) {
      return jsonResponse({ error: 'An account with this email already exists.' }, 409);
    }
    if (users.length < 1000) break;
  }

  // Only an http(s) origin the app itself reports is used as the link target;
  // Supabase also refuses any URL not in the project's Redirect URLs list.
  const requestedOrigin = String(body.redirectTo || '').trim().replace(/\/$/, '');
  const siteUrl = /^https?:\/\/[^\s/]+$/i.test(requestedOrigin)
    ? requestedOrigin
    : (Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || '').replace(/\/$/, '');
  const confirmRedirect = siteUrl ? `${siteUrl}/auth/confirmed` : undefined;

  // Creates the account unconfirmed and returns its confirmation link without
  // emailing it, so it can go out through the project's own Gmail sender
  // (Supabase's built-in mailer only allows a few emails per hour).
  const { data: linkData, error: linkError } = await serviceRoleClient.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      data: { full_name: name, role: 'organizer' },
      redirectTo: confirmRedirect,
    },
  });

  if (linkError || !linkData?.user) {
    const message = linkError?.message || 'Unable to create the organizer account.';
    if (/already (been )?registered|already exists/i.test(message)) {
      return jsonResponse({ error: 'An account with this email already exists.' }, 409);
    }
    return jsonResponse({ error: message }, 500);
  }

  // The on_auth_user_created trigger already created the profile as a
  // 'pending' organizer. It stays pending: the organizer confirms their email
  // first, then an admin approves them from the pending applications list.
  // (Changing the status here is refused by the profile guard trigger anyway,
  // since this function is not a signed-in admin.) Only fill in the profile if
  // the trigger somehow did not run — inserting is allowed, updating is not.
  const { data: existingProfile } = await serviceRoleClient
    .from('profiles')
    .select('id')
    .eq('id', linkData.user.id)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileInsertError } = await serviceRoleClient.from('profiles').insert({
      id: linkData.user.id,
      email,
      full_name: name,
      role: 'organizer',
      status: 'pending',
    });
    if (profileInsertError) {
      return jsonResponse({ error: profileInsertError.message }, 500);
    }
  }

  const confirmUrl = linkData.properties?.action_link || '';
  let confirmationSent = false;
  let sentVia = '';

  const gmailUser = Deno.env.get('GMAIL_USER') || '';
  const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD') || '';
  const fromEmail = Deno.env.get('APPROVAL_EMAIL_FROM') || (gmailUser ? `FairPlay <${gmailUser}>` : '');

  if (confirmUrl && gmailUser && gmailAppPassword) {
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeUrl = escapeHtml(confirmUrl);
    const html = `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;padding:28px">
          <h1 style="margin:0 0 12px;color:#2563eb;font-size:24px">Confirm your organizer account</h1>
          <p style="font-size:15px;line-height:1.6">Hi ${safeName},</p>
          <p style="font-size:15px;line-height:1.6">A FairPlay administrator created an <strong>organizer account</strong> for <strong>${safeEmail}</strong>. Please confirm your email address to continue.</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Confirm my email</a>
          </p>
          <p style="font-size:13px;line-height:1.6;color:#64748b">After you confirm, an administrator will approve your account. Once approved, sign in with this email and the password your administrator gave you. If you did not expect this email, you can ignore it.</p>
          <p style="font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all">If the button does not work, open this link: ${safeUrl}</p>
        </div>
      </div>`;

    try {
      const client = new SMTPClient({
        connection: {
          hostname: 'smtp.gmail.com',
          port: 465,
          tls: true,
          auth: { username: gmailUser, password: gmailAppPassword },
        },
      });
      try {
        await client.send({ from: fromEmail, to: email, subject: 'Confirm your FairPlay organizer account', html });
        confirmationSent = true;
        sentVia = 'gmail';
      } finally {
        try { await client.close(); } catch { /* closing is best-effort */ }
      }
    } catch (err) {
      console.warn('Organizer confirmation via Gmail failed:', err instanceof Error ? err.message : err);
    }
  }

  // Fallback: ask Supabase to send its own confirmation email.
  if (!confirmationSent) {
    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: resendError } = await publicClient.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmRedirect },
    });
    if (resendError) {
      console.warn('Organizer confirmation via Supabase failed:', resendError.message);
    } else {
      confirmationSent = true;
      sentVia = 'supabase';
    }
  }

  return jsonResponse({ created: true, userId: linkData.user.id, email, name, confirmationSent, sentVia });
});

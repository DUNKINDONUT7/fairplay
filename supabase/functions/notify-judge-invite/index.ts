import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Every field is optional — the invite must still send if the event has no
// schedule filled in yet, so the block only renders the rows it actually has
// and returns '' (no block at all) when there's nothing to show.
function buildScheduleBlock(startDate: string, startTime: string, endTime: string, location: string) {
  let dateLabel = '';
  if (startDate) {
    try {
      const parsed = new Date(startDate);
      if (!Number.isNaN(parsed.getTime())) {
        dateLabel = parsed.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
    } catch {
      // Malformed date from the caller — skip the date row rather than
      // failing the whole invite send over a cosmetic field.
      dateLabel = '';
    }
  }

  let timeLabel = '';
  if (startTime && endTime) timeLabel = `${startTime} – ${endTime}`;
  else if (startTime) timeLabel = startTime;

  const rows: string[] = [];
  if (dateLabel) rows.push(`<div><strong>Date:</strong> ${escapeHtml(dateLabel)}</div>`);
  if (timeLabel) rows.push(`<div><strong>Time:</strong> ${escapeHtml(timeLabel)}</div>`);
  if (location) rows.push(`<div><strong>Venue:</strong> ${escapeHtml(location)}</div>`);

  if (rows.length === 0) return '';

  return `
            <div style="margin-top:16px;padding:14px 16px;border-radius:12px;background:#f0f9ff;border:1px solid #bae6fd;font-size:14px;line-height:1.8;color:#0f172a">
              ${rows.join('\n              ')}
            </div>`;
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
  // Sending via the organizer's own Gmail account over SMTP — no sender
  // domain to verify, unlike Resend/SendGrid-style transactional APIs.
  // GMAIL_USER must have 2-Step Verification on, with GMAIL_APP_PASSWORD
  // being a 16-character App Password (myaccount.google.com/apppasswords),
  // not the account's real login password.
  const gmailUser = Deno.env.get('GMAIL_USER') || '';
  const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD') || '';
  const fromEmail = Deno.env.get('APPROVAL_EMAIL_FROM') || (gmailUser ? `FairPlay <${gmailUser}>` : '');
  const siteUrl = (Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || '').replace(/\/$/, '');

  const missingSecrets = [
    !supabaseUrl ? 'SUPABASE_URL' : null,
    !anonKey ? 'SUPABASE_ANON_KEY' : null,
    !gmailUser ? 'GMAIL_USER' : null,
    !gmailAppPassword ? 'GMAIL_APP_PASSWORD' : null,
  ].filter(Boolean);

  if (missingSecrets.length > 0) {
    return jsonResponse({
      error: 'Email service is not configured. Missing Supabase Edge Function secrets: ' + missingSecrets.join(', '),
      missingSecrets,
    }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!bearerToken) {
    return jsonResponse({ error: 'Unauthorized.', reason: 'missing_bearer_token' }, 401);
  }

  // Runs entirely as the caller — no service-role client, and the anon key
  // rather than SUPABASE_SERVICE_ROLE_KEY. This project's auto-injected
  // service-role key does not authenticate as service_role (confirmed: it
  // returned "permission denied for table ..." on both profiles and
  // judge_invites), so nothing here depends on it. judge_invites originally
  // had RLS on with only a SELECT policy — no INSERT policy — which is what
  // actually made the insert impossible, service-role key or not. The real
  // gap was the missing policy; "Staff can create judge invites" (for
  // insert, to authenticated, with check is_staff_user()) now covers it,
  // mirroring the existing SELECT policy's rule (role in admin/organizer).
  // With that in place, the caller's own session is sufficient for
  // everything below, same as any browser request through the anon key.
  //
  // getUser(jwt) is called with the token passed explicitly rather than
  // relying on a client constructed with a forwarded Authorization header —
  // the explicit form is the documented, unambiguous way to validate a
  // caller's JWT in an Edge Function and avoids depending on how this
  // client instance's internal request headers get wired for auth calls
  // specifically (as opposed to plain table queries, which do still need
  // the forwarded header below for RLS to see the right caller).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await callerClient.auth.getUser(bearerToken);
  if (authError || !authData?.user) {
    return jsonResponse({
      error: 'Unauthorized.',
      reason: authError?.message || 'no_user_for_token',
    }, 401);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !['admin', 'organizer'].includes(callerProfile?.role || '')) {
    return jsonResponse({ error: 'Organizer or admin access required.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const eventId = Number(body.eventId);
  const eventTitle = String(body.eventTitle || 'FairPlay Event').trim();
  const judgeEmail = String(body.judgeEmail || '').trim().toLowerCase();
  const judgeName = String(body.judgeName || '').trim();
  const eventStartDate = body.eventStartDate ? String(body.eventStartDate) : '';
  const eventStartTime = body.eventStartTime ? String(body.eventStartTime) : '';
  const eventEndTime = body.eventEndTime ? String(body.eventEndTime) : '';
  const eventLocation = body.eventLocation ? String(body.eventLocation) : '';

  if (!eventId || Number.isNaN(eventId)) {
    return jsonResponse({ error: 'A valid eventId is required.' }, 400);
  }
  if (!judgeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(judgeEmail)) {
    return jsonResponse({ error: 'A valid judge email is required.' }, 400);
  }
  if (!judgeName) {
    return jsonResponse({ error: 'Judge name is required.' }, 400);
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const temporaryPassword = Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  let inviteId = Math.round(Date.now() * 1000 + Math.random() * 1000);
  let insertError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    inviteId = Math.round(Date.now() * 1000 + Math.random() * 1000);

    const insertResult = await callerClient.from('judge_invites').insert({
      id: inviteId,
      event_id: eventId,
      event_title: eventTitle,
      judge_email: judgeEmail,
      judge_name: judgeName,
      token,
      status: 'pending',
    });

    insertError = insertResult.error;

    if (!insertError) {
      break;
    }

    if (insertError.code !== '23505') {
      break;
    }
  }

  if (insertError) {
    return jsonResponse({ error: insertError.message }, 500);
  }

  // Set the SITE_URL secret so this never has to fall back. The fallback is
  // the real deployed domain, so a missing secret still produces a link that
  // works rather than one pointing at a project that does not exist.
  const inviteUrl = `${siteUrl || 'https://fairplay-kappa.vercel.app'}/judge/invite/${token}`;
  const safeName = escapeHtml(judgeName);
  const safeEventTitle = escapeHtml(eventTitle);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const scheduleHtml = buildScheduleBlock(eventStartDate, eventStartTime, eventEndTime, eventLocation);

  let authUserId: string | null = null;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (serviceRoleKey) {
    const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingUsersData, error: listUsersError } = await serviceRoleClient.auth.admin.listUsers();

    if (!listUsersError) {
      const existingUser = existingUsersData?.users?.find((user) => user.email?.toLowerCase() === judgeEmail) || null;

      if (existingUser) {
        authUserId = existingUser.id;
        await serviceRoleClient.auth.admin.updateUserById(existingUser.id, {
          password: temporaryPassword,
          user_metadata: { full_name: judgeName, role: 'judge' },
        });

        await serviceRoleClient
          .from('profiles')
          .upsert(
            {
              id: existingUser.id,
              email: judgeEmail,
              full_name: judgeName,
              role: 'judge',
              status: 'active',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
      } else {
        const { data: createdUserData, error: createUserError } = await serviceRoleClient.auth.admin.createUser({
          email: judgeEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { full_name: judgeName, role: 'judge' },
        });

        if (createUserError) {
          console.warn('Judge auth user create failed:', createUserError.message);
        } else {
          authUserId = createdUserData?.user?.id || null;
        }
      }
    } else {
      console.warn('Judge auth user lookup failed:', listUsersError.message);
    }
  }

  const emailHtml = `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;padding:28px">
            <h1 style="margin:0 0 12px;color:#2563eb;font-size:26px">Judge invitation</h1>
            <p style="font-size:15px;line-height:1.6">Hi ${safeName},</p>
            <p style="font-size:15px;line-height:1.6">You've been invited to judge <strong>${safeEventTitle}</strong> on FairPlay. Use the secure access link below to open your scoring session.</p>${scheduleHtml}
            <div style="margin-top:16px;padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #dbeafe;font-size:14px;line-height:1.8;color:#0f172a">
              <div><strong>Login Email:</strong> ${escapeHtml(judgeEmail)}</div>
              <div><strong>Temporary Password:</strong> ${escapeHtml(temporaryPassword)}</div>
            </div>
            <a href="${safeInviteUrl}" style="display:inline-block;margin-top:16px;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open my scoring link</a>
            <p style="margin-top:22px;color:#64748b;font-size:13px">If the button does not work, open this link: ${safeInviteUrl}</p>
            <p style="margin-top:8px;color:#94a3b8;font-size:12px">This link is unique to you, and the organizer can cancel access any time if attendance changes. The QR code remains as an emergency fallback only.</p>
          </div>
        </div>
      `;

  // Port 465 with implicit TLS — a single encrypted connection from the
  // start, no STARTTLS negotiation step. Confirmed reachable from this
  // runtime with a live probe before wiring this in (Deno Deploy's own
  // cloud blocks 25/465/587 outbound; Supabase's edge-runtime, a separate,
  // self-hosted project, does not — worth re-confirming if this ever moves
  // off Supabase).
  let emailSent = false;

  try {
    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailAppPassword,
        },
      },
    });

    try {
      await client.send({
        from: fromEmail,
        to: judgeEmail,
        subject: `You've been invited to judge ${eventTitle}`,
        html: emailHtml,
      });
      emailSent = true;
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        console.warn('SMTP close warning after send:', closeError instanceof Error ? closeError.message : closeError);
      }
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unable to send invite email.' }, 502);
  }

  if (!emailSent) {
    return jsonResponse({ error: 'Invite email was not sent.' }, 502);
  }

  return jsonResponse({ sent: true, token, inviteId, emailSent: true });
});

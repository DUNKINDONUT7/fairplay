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
    const parsed = new Date(startDate);
    if (!Number.isNaN(parsed.getTime())) {
      dateLabel = parsed.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const fromEmail = Deno.env.get('APPROVAL_EMAIL_FROM') || 'FairPlay <onboarding@resend.dev>';
  const siteUrl = (Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || '').replace(/\/$/, '');

  if (!supabaseUrl || !anonKey || !resendApiKey) {
    return jsonResponse({ error: 'Email service is not configured.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';

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
  const inviteId = Date.now();

  const { error: insertError } = await callerClient.from('judge_invites').insert({
    id: inviteId,
    event_id: eventId,
    event_title: eventTitle,
    judge_email: judgeEmail,
    judge_name: judgeName,
    token,
    status: 'pending',
  });

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

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [judgeEmail],
      subject: `You've been invited to judge ${eventTitle}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;padding:28px">
            <h1 style="margin:0 0 12px;color:#2563eb;font-size:26px">Judge invitation</h1>
            <p style="font-size:15px;line-height:1.6">Hi ${safeName},</p>
            <p style="font-size:15px;line-height:1.6">You've been invited to judge <strong>${safeEventTitle}</strong> on FairPlay. Use the link below to access your personal scoring session — no account setup needed.</p>${scheduleHtml}
            <a href="${safeInviteUrl}" style="display:inline-block;margin-top:14px;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open my scoring link</a>
            <p style="margin-top:22px;color:#64748b;font-size:13px">If the button does not work, open this link: ${safeInviteUrl}</p>
            <p style="margin-top:8px;color:#94a3b8;font-size:12px">This link is unique to you — please don't share it.</p>
          </div>
        </div>
      `,
    }),
  });

  const result = await emailResponse.json().catch(() => ({}));
  if (!emailResponse.ok) {
    return jsonResponse({ error: result?.message || 'Unable to send invite email.' }, 502);
  }

  return jsonResponse({ sent: true, token, inviteId });
});

// @ts-nocheck — this runs on Deno (Supabase Edge Functions), not Node/browser.
// See notify-judge-invite/index.ts for why the editor's TypeScript checker is
// switched off here.
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
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

// Only the rows the event actually has; '' when it has none of them.
function buildScheduleBlock(startDate: string, startTime: string, endTime: string, location: string) {
  let dateLabel = '';
  if (startDate) {
    const parsed = new Date(startDate);
    if (!Number.isNaN(parsed.getTime())) {
      dateLabel = parsed.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
    }
  }
  const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';

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
  // Same Gmail-over-SMTP sender as the judge invite email.
  const gmailUser = Deno.env.get('GMAIL_USER') || '';
  const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD') || '';
  const fromEmail = Deno.env.get('APPROVAL_EMAIL_FROM') || (gmailUser ? `FairPlay <${gmailUser}>` : '');

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

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await callerClient.auth.getUser(bearerToken);
  if (authError || !authData?.user) {
    return jsonResponse({ error: 'Unauthorized.', reason: authError?.message || 'no_user_for_token' }, 401);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  const role = callerProfile?.role || '';
  if (profileError || !['admin', 'organizer'].includes(role)) {
    return jsonResponse({ error: 'Organizer or admin access required.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const eventId = Number(body.eventId);
  const contestantName = String(body.contestantName || '').trim().slice(0, 200);
  const contestantType = body.contestantType === 'team' ? 'team' : 'individual';
  const email = String(body.email || '').trim().toLowerCase();

  if (!eventId || Number.isNaN(eventId)) {
    return jsonResponse({ error: 'A valid eventId is required.' }, 400);
  }
  if (!contestantName) {
    return jsonResponse({ error: 'The participant name is required.' }, 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400);
  }

  // The event's details come from the database, not from the request, so the
  // email can only ever describe a real event — and only its own organizer
  // (or an admin) can send one for it.
  const { data: event, error: eventError } = await callerClient
    .from('events')
    .select('id, title, owner_id, start_date, location, metadata')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError || !event) {
    return jsonResponse({ error: 'Event not found.' }, 404);
  }
  if (role !== 'admin' && String(event.owner_id || '') !== authData.user.id) {
    return jsonResponse({ error: 'You can only send participant emails for your own events.' }, 403);
  }

  const eventTitle = String(event.title || 'FairPlay Event');
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const scheduleHtml = buildScheduleBlock(
    event.start_date ? String(event.start_date) : '',
    metadata.startTime ? String(metadata.startTime) : '',
    metadata.endTime ? String(metadata.endTime) : '',
    event.location ? String(event.location) : '',
  );

  const safeName = escapeHtml(contestantName);
  const safeEventTitle = escapeHtml(eventTitle);
  const message = contestantType === 'team'
    ? `Your team <strong>${safeName}</strong> has been added as a participant in <strong>${safeEventTitle}</strong>. You are receiving this as the team's contact person — please let your teammates know.`
    : `Hi ${safeName}, you have been added as a participant in <strong>${safeEventTitle}</strong>.`;

  const emailHtml = `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;padding:28px">
            <h1 style="margin:0 0 12px;color:#2563eb;font-size:24px">You're in!</h1>
            <p style="font-size:15px;line-height:1.6">${message}</p>${scheduleHtml}
            <p style="margin-top:18px;font-size:14px;line-height:1.6;color:#334155">No action is needed. If you have questions about the event, please contact the organizer.</p>
            <p style="margin-top:14px;color:#94a3b8;font-size:12px">You received this because an event organizer on FairPlay added you using this email address. If this was a mistake, you can ignore this email.</p>
          </div>
        </div>
      `;

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
      await client.send({
        from: fromEmail,
        to: email,
        subject: `You've been added to ${eventTitle}`,
        html: emailHtml,
      });
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        console.warn('SMTP close warning after send:', closeError instanceof Error ? closeError.message : closeError);
      }
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unable to send the email.' }, 502);
  }

  return jsonResponse({ sent: true });
});

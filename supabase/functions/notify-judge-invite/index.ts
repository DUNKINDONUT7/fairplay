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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const fromEmail = Deno.env.get('APPROVAL_EMAIL_FROM') || 'FairPlay <onboarding@resend.dev>';
  const siteUrl = (Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || '').replace(/\/$/, '');

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ error: 'Email service is not configured.' }, 500);
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

  if (profileError || !['admin', 'organizer'].includes(callerProfile?.role || '')) {
    return jsonResponse({ error: 'Organizer or admin access required.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const eventId = Number(body.eventId);
  const eventTitle = String(body.eventTitle || 'FairPlay Event').trim();
  const judgeEmail = String(body.judgeEmail || '').trim().toLowerCase();
  const judgeName = String(body.judgeName || '').trim();

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

  const { error: insertError } = await supabase.from('judge_invites').insert({
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

  const inviteUrl = `${siteUrl || 'https://fairplay-gray.vercel.app'}/judge/invite/${token}`;
  const safeName = escapeHtml(judgeName);
  const safeEventTitle = escapeHtml(eventTitle);
  const safeInviteUrl = escapeHtml(inviteUrl);

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
            <p style="font-size:15px;line-height:1.6">You've been invited to judge <strong>${safeEventTitle}</strong> on FairPlay. Use the link below to access your personal scoring session — no account setup needed.</p>
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

// @ts-nocheck — this runs on Deno (Supabase Edge Functions), not Node/browser.
// VS Code's default TypeScript checker doesn't know the Deno global or how to
// resolve remote https:// imports, so it reports false-positive errors here.
// Deno itself type-checks and runs this file fine; install the "Deno" VS Code
// extension and scope it to supabase/functions if you want real checking.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_MESSAGES = 40;
// Every existing caller (chatbot, criteria generator, description generator,
// smart report) sends exactly one of these two models today — see
// VITE_AI_CHATBOT_MODEL / VITE_AI_CRITERIA_MODEL in .env. This allow-list
// stops a caller with just the public anon key from picking an arbitrary,
// possibly far more expensive model. Override/extend via the
// AI_ALLOWED_MODELS secret (comma-separated) if a new model is ever added,
// without needing a code change.
const DEFAULT_ALLOWED_MODELS = ['openai/gpt-oss-120b'];
const MAX_TOTAL_CONTENT_CHARS = 24000;
const MAX_OUTPUT_TOKENS = 4096;

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

  // Server-side only secrets — never prefixed with VITE_, so they never
  // ship in the client bundle. Set these via `supabase secrets set`.
  const groqKey = Deno.env.get('GROQ_API_KEY') || '';
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY') || '';
  const defaultProvider = Deno.env.get('AI_PROVIDER') || (groqKey ? 'groq' : 'openrouter');

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : null;
  const model = String(body.model || '').trim();

  if (!messages || messages.length === 0) {
    return jsonResponse({ error: 'messages array is required.' }, 400);
  }
  if (messages.length > MAX_MESSAGES) {
    return jsonResponse({ error: 'Too many messages in this request.' }, 400);
  }
  if (!model) {
    return jsonResponse({ error: 'model is required.' }, 400);
  }

  const allowedModels = (Deno.env.get('AI_ALLOWED_MODELS') || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const modelAllowList = allowedModels.length > 0 ? allowedModels : DEFAULT_ALLOWED_MODELS;
  if (!modelAllowList.includes(model)) {
    return jsonResponse({ error: 'This model is not allowed.' }, 400);
  }

  const totalContentChars = messages.reduce((sum, m) => sum + String(m?.content || '').length, 0);
  if (totalContentChars > MAX_TOTAL_CONTENT_CHARS) {
    return jsonResponse({ error: 'Request content is too long.' }, 400);
  }

  const provider = defaultProvider === 'groq' ? 'groq' : 'openrouter';
  const apiKey = provider === 'groq' ? groqKey : openRouterKey;
  const url = provider === 'groq' ? GROQ_URL : OPENROUTER_URL;

  if (!apiKey) {
    return jsonResponse({ error: 'AI provider is not configured on the server.' }, 500);
  }

  const upstreamBody: Record<string, unknown> = {
    model,
    messages,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  if (body.response_format) {
    upstreamBody.response_format = body.response_format;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = req.headers.get('origin') || 'https://fairplay-kappa.vercel.app';
    headers['X-Title'] = 'FairPlay';
  }

  const upstreamResponse = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(upstreamBody),
  });

  const result = await upstreamResponse.json().catch(() => ({}));
  return jsonResponse(result, upstreamResponse.status);
});

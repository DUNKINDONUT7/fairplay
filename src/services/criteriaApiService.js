import { supabase } from '../utils/supabaseClient';

// AI requests go through the `ai-proxy` Supabase Edge Function — the Groq/
// OpenRouter API key lives server-side only (Edge Function secrets), never
// in a VITE_* client var, so it can't be extracted from the browser bundle.
export function getApiConfig(modelOverride) {
  const model = modelOverride || import.meta.env.VITE_AI_CRITERIA_MODEL || 'openai/gpt-4o-mini';
  return { model, enabled: true };
}

export async function callAiProxy({ messages, model, temperature, responseFormat }) {
  if (!supabase) {
    throw new Error('AI features require FairPlay to be connected to Supabase.');
  }

  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      messages,
      model,
      temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function buildCriteriaPrompt(payload) {
  return `
Generate three professional judging rubric profiles for the FairPlay event management system.

Output strict JSON with this shape:
{
  "profiles": [
    {
      "profile": "Balanced Professional",
      "criteria": [
        {
          "id": "criterion-1",
          "name": "Technical Execution",
          "weight": 30,
          "description": "How well the participant performs the required skills",
          "scoringRange": "1-10",
          "judgeInstructions": "Score based on observable performance"
        }
      ],
      "scoringMethod": "Weighted Rubric",
      "tieBreaker": ["Highest technical score"],
      "judgeInstructions": "Apply the rubric consistently across all contestants."
    }
  ],
  "requestMeta": {
    "notes": "Short explanation of what changed between profiles"
  }
}

Rules:
- Return exactly 3 profiles with clearly different emphasis.
- Total criteria weight per profile must equal 100.
- Support audience impact only when appropriate for the event.
- If this is a sports fest or multi-event, tailor the rubric to the selected sub-event.
- Include at least 5 criteria in every profile.
- Include practical descriptions and judge instructions.
- Use the uploaded template if provided, but improve it professionally.
- Respect the organizer prompt override.
- Include tie-breakers that fit close judging scenarios.

Event payload:
${JSON.stringify(payload, null, 2)}
  `.trim();
}

export function buildEventDescriptionPrompt(payload) {
  return `
Write one editable event description for the FairPlay event management system.

Output strict JSON with this shape:
{
  "description": "A concise organizer-ready description."
}

Rules:
- Write 2 to 4 polished sentences.
- Mention the event purpose, expected participants, competition format, and judging flow when relevant.
- Keep it neutral, professional, and easy for an organizer to edit.
- Do not invent exact dates, venue names, fees, prizes, sponsors, or participant counts.
- Do not include markdown, bullet points, headings, or quotation marks around the description.

Event payload:
${JSON.stringify(payload, null, 2)}
  `.trim();
}

export function parseCriteriaApiResponse(content) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : content;
  return JSON.parse(raw);
}

function rebalanceWeights(criteria = []) {
  const normalized = criteria.map((criterion, index) => ({
    id: criterion.id || `criterion-${index + 1}`,
    name: criterion.name || `Criterion ${index + 1}`,
    weight: Number(criterion.weight || 0),
    description: criterion.description || '',
    scoringRange: criterion.scoringRange || '1-10',
    judgeInstructions: criterion.judgeInstructions || 'Score based on observable performance.',
  }));

  if (!normalized.length) return normalized;

  const total = normalized.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (total === 100) {
    return normalized;
  }

  const base = Math.floor(100 / normalized.length);
  const remainder = 100 % normalized.length;
  return normalized.map((criterion, index) => ({
    ...criterion,
    weight: base + (index < remainder ? 1 : 0),
  }));
}

function normalizeProfiles(rawProfiles = []) {
  return rawProfiles
    .filter(Boolean)
    .map((profile, index) => ({
      profile: profile.profile || `Profile ${index + 1}`,
      criteria: rebalanceWeights(Array.isArray(profile.criteria) ? profile.criteria : []),
      scoringMethod: profile.scoringMethod || 'Weighted Rubric',
      tieBreaker: Array.isArray(profile.tieBreaker) && profile.tieBreaker.length > 0
        ? profile.tieBreaker
        : ['Highest weighted total score'],
      judgeInstructions: profile.judgeInstructions || 'Apply the rubric consistently across all contestants.',
    }))
    .filter((profile) => profile.criteria.length >= 5);
}

export async function requestCriteriaProfiles(payload) {
  const config = getApiConfig();

  const json = await callAiProxy({
    model: config.model,
    temperature: 0.4,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a judging rubric generator for academic, sports, and cultural competitions.',
      },
      {
        role: 'user',
        content: buildCriteriaPrompt(payload),
      },
    ],
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Criteria API returned an empty response.');
  }

  const parsed = parseCriteriaApiResponse(content);
  const rawProfiles = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.profiles)
      ? parsed.profiles
      : Array.isArray(parsed?.data)
        ? parsed.data
        : [];
  const normalizedProfiles = normalizeProfiles(rawProfiles);

  if (normalizedProfiles.length > 0) {
    return normalizedProfiles;
  }

  throw new Error('Criteria API response format is invalid.');
}

export async function requestEventDescription(payload) {
  const config = getApiConfig();

  const json = await callAiProxy({
    model: config.model,
    temperature: 0.45,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You draft concise event descriptions for school, sports, cultural, and academic competitions.',
      },
      {
        role: 'user',
        content: buildEventDescriptionPrompt(payload),
      },
    ],
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Description API returned an empty response.');
  }

  const parsed = parseCriteriaApiResponse(content);
  const description = String(parsed?.description || '').trim();
  if (!description) {
    throw new Error('Description API response format is invalid.');
  }

  return description;
}

export function isCriteriaApiEnabled() {
  return getApiConfig().enabled;
}

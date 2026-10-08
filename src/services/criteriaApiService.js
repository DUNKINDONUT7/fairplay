import { supabase } from '../utils/supabaseClient';
import usePlatformSettingsStore from '../store/platformSettingsStore';
import { MIN_CRITERIA, normalizeScoreGuide, scaleWeightsTo100 } from '../utils/rubricTools';

// AI requests go through the `ai-proxy` Supabase Edge Function — the Groq/
// OpenRouter API key lives server-side only (Edge Function secrets), never
// in a VITE_* client var, so it can't be extracted from the browser bundle.
export function getApiConfig(modelOverride) {
  const model = modelOverride || import.meta.env.VITE_AI_CRITERIA_MODEL || 'openai/gpt-oss-120b';
  return { model, enabled: true };
}

export async function callAiProxy({ messages, model, temperature, responseFormat }) {
  if (!supabase) {
    throw new Error('AI features require FairPlay to be connected to Supabase.');
  }
  if (usePlatformSettingsStore.getState().aiEnabled === false) {
    throw new Error('AI features are currently turned off by the administrator.');
  }

  // functions.invoke() attaches the current session's access token
  // internally, which serializes through the same browser Web Locks
  // mechanism as auth.getSession() — a stale lock left by another tab can
  // make this hang forever (never resolves, never rejects). Left
  // unbounded, that silently defeats the local-fallback rubric generator
  // in aiCriteriaEngine.js, since its try/catch never gets a chance to
  // fire and the "Generating criteria..." UI is stuck for good.
  const { data, error } = await Promise.race([
    supabase.functions.invoke('ai-proxy', {
      body: {
        messages,
        model,
        temperature,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI request timed out.')), 25000)),
  ]);

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
      "summary": "One sentence on what this profile rewards and when to pick it.",
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
- Use the number of criteria that fits the event: at least ${MIN_CRITERIA}, usually 4 to 6. Do not pad with generic criteria.
- Criteria must not overlap: each one measures something the others do not.
- Descriptions say what is being judged; judge instructions say what to look or listen for.
- If "uploadedTemplate" is not empty, every profile keeps its criteria names and weights; only improve the wording of descriptions and judge instructions.
- Respect the organizer prompt override.
- Include tie-breakers that fit close judging scenarios.
- Write every name, description, instruction and summary in this language: ${payload.language || 'English'}. Keep the JSON keys in English.

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

function normalizeCriterion(criterion = {}, index = 0) {
  const scoreGuide = normalizeScoreGuide(criterion.scoreGuide);
  return {
    id: criterion.id || `criterion-${index + 1}`,
    name: String(criterion.name || `Criterion ${index + 1}`).trim(),
    weight: parseFloat(criterion.weight) || 0,
    description: String(criterion.description || '').trim(),
    scoringRange: String(criterion.scoringRange || '1-10').trim(),
    judgeInstructions: String(criterion.judgeInstructions || '').trim() || 'Score based on observable performance.',
    ...(scoreGuide.length ? { scoreGuide } : {}),
  };
}

// When the model's weights miss 100, keep its emphasis and scale them.
function rebalanceWeights(criteria = []) {
  return scaleWeightsTo100(criteria.map(normalizeCriterion));
}

function normalizeProfiles(rawProfiles = []) {
  return rawProfiles
    .filter(Boolean)
    .map((profile, index) => ({
      profile: profile.profile || `Profile ${index + 1}`,
      summary: String(profile.summary || '').trim(),
      criteria: rebalanceWeights(Array.isArray(profile.criteria) ? profile.criteria : []),
      scoringMethod: profile.scoringMethod || 'Weighted Rubric',
      tieBreaker: Array.isArray(profile.tieBreaker) && profile.tieBreaker.length > 0
        ? profile.tieBreaker
        : ['Highest weighted total score'],
      judgeInstructions: profile.judgeInstructions || 'Apply the rubric consistently across all contestants.',
    }))
    .filter((profile) => profile.criteria.length >= MIN_CRITERIA);
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
    // Attaches the model the server actually used (returned by the
    // OpenAI-compatible upstream response) for AI-usage logging, without the
    // client ever choosing or holding a model name itself.
    normalizedProfiles.model = json?.model || 'unknown';
    normalizedProfiles.notes = String(parsed?.requestMeta?.notes || '').trim();
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

const RUBRIC_SYSTEM_PROMPT = 'You are a judging rubric expert for academic, sports, and cultural competitions. You reply with strict JSON only.';

const compactRubric = (rubric = {}) => ({
  criteria: (rubric.criteria || []).map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    weight: criterion.weight,
    description: criterion.description,
    scoringRange: criterion.scoringRange,
    judgeInstructions: criterion.judgeInstructions,
  })),
  scoringMethod: rubric.scoringMethod,
  tieBreaker: rubric.tieBreaker,
  judgeInstructions: rubric.judgeInstructions,
});

const compactEvent = (event = {}) => ({
  title: event.title || '',
  eventType: event.eventType || '',
  description: String(event.description || '').slice(0, 1500),
});

async function requestRubricJson(prompt, temperature = 0.3) {
  const json = await callAiProxy({
    model: getApiConfig().model,
    temperature,
    responseFormat: { type: 'json_object' },
    messages: [
      { role: 'system', content: RUBRIC_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('The AI returned an empty response.');
  return { data: parseCriteriaApiResponse(content), model: json?.model || 'unknown' };
}

// Applies one organizer instruction ("add a costume criterion", "make vocals
// heavier") to the rubric being edited, instead of regenerating all of it.
export async function requestRubricRefinement({ rubric, instruction, event, language }) {
  const { data, model } = await requestRubricJson(`
Revise this judging rubric by following the organizer's instruction.

Output strict JSON with this shape:
{
  "criteria": [
    { "id": "keep the existing id, or a new one for a new criterion", "name": "", "weight": 0, "description": "", "scoringRange": "", "judgeInstructions": "" }
  ],
  "tieBreaker": ["..."],
  "judgeInstructions": "General instruction for all judges.",
  "changeSummary": "One sentence describing what you changed."
}

Rules:
- Change only what the instruction asks for. Copy every other criterion back exactly, with the same id, wording, weight and order.
- Total weight must equal 100. If you add, remove or reweight a criterion, adjust the others proportionally.
- Keep at least ${MIN_CRITERIA} criteria.
- Keep each scoringRange as it is; give new criteria the same range the others use.
- Write in ${language || 'English'}. Keep the JSON keys in English.

Organizer instruction: ${JSON.stringify(String(instruction || '').slice(0, 600))}

Event: ${JSON.stringify(compactEvent(event))}

Current rubric: ${JSON.stringify(compactRubric(rubric))}
  `.trim());

  const criteria = rebalanceWeights(Array.isArray(data?.criteria) ? data.criteria : []);
  if (criteria.length < MIN_CRITERIA) throw new Error('The AI did not return a usable rubric.');

  return {
    criteria,
    tieBreaker: Array.isArray(data.tieBreaker) && data.tieBreaker.length ? data.tieBreaker : rubric.tieBreaker,
    judgeInstructions: String(data.judgeInstructions || rubric.judgeInstructions || '').trim(),
    changeSummary: String(data.changeSummary || '').trim(),
    model,
  };
}

// Writes what each score level looks like for every criterion, so different
// judges read the scale the same way.
export async function requestScoreGuides({ criteria, event, language }) {
  const { data, model } = await requestRubricJson(`
Write a score guide for each judging criterion below.

Output strict JSON with this shape:
{
  "guides": [
    { "id": "the criterion id", "excellent": "", "good": "", "fair": "", "weak": "" }
  ]
}

Rules:
- One entry per criterion, using the same id.
- Each level is one sentence of at most 22 words describing what a judge would actually observe at that level for this specific criterion and event.
- "excellent" is the top of the scale, "good" is strong with minor lapses, "fair" is acceptable with clear gaps, "weak" is the bottom of the scale.
- Be concrete and observable. Do not mention numbers or scores.
- Write in ${language || 'English'}. Keep the JSON keys in English.

Event: ${JSON.stringify(compactEvent(event))}

Criteria: ${JSON.stringify((criteria || []).map((criterion) => ({ id: criterion.id, name: criterion.name, description: criterion.description })))}
  `.trim());

  const guides = {};
  (Array.isArray(data?.guides) ? data.guides : []).forEach((guide) => {
    const scoreGuide = normalizeScoreGuide(guide);
    if (guide?.id !== undefined && scoreGuide.length) guides[String(guide.id)] = scoreGuide;
  });
  if (Object.keys(guides).length === 0) throw new Error('The AI did not return any score guides.');

  return { guides, model };
}

// Reads criteria out of any uploaded document text, exactly as written.
export async function requestCriteriaExtraction({ text }) {
  const { data, model } = await requestRubricJson(`
Extract the judging criteria from the document text below.

Output strict JSON with this shape:
{
  "criteria": [
    { "name": "", "weight": 0, "description": "", "scoringRange": "", "judgeInstructions": "" }
  ],
  "tieBreaker": ["..."],
  "judgeInstructions": "General instruction for judges, if the document has one."
}

Rules:
- Copy the criteria exactly as the document states them. Do not add, merge, rename, reword or improve anything.
- "weight" is the criterion's percentage or points as a number. Use 0 when the document gives none.
- Leave "description", "scoringRange" and "judgeInstructions" as empty strings when the document does not provide them.
- Ignore titles, dates, venues, totals, signatures, page numbers and anything that is not a judging criterion.
- If the document contains no judging criteria, return {"criteria": []}.

Document text:
${String(text || '').slice(0, 12000)}
  `.trim(), 0);

  const criteria = (Array.isArray(data?.criteria) ? data.criteria : [])
    .filter((criterion) => String(criterion?.name || '').trim())
    .map((criterion, index) => ({
      id: `uploaded-${index + 1}`,
      name: String(criterion.name).trim(),
      weight: parseFloat(criterion.weight) || 0,
      description: String(criterion.description || '').trim(),
      scoringRange: String(criterion.scoringRange || '').trim(),
      judgeInstructions: String(criterion.judgeInstructions || '').trim(),
    }));

  return {
    criteria,
    tieBreaker: Array.isArray(data?.tieBreaker) ? data.tieBreaker.map(String).filter(Boolean) : [],
    judgeInstructions: String(data?.judgeInstructions || '').trim(),
    model,
  };
}

// A second opinion on the rubric being edited, with a ready-to-apply fix
// for each problem found.
export async function requestRubricReview({ rubric, event, language }) {
  const { data, model } = await requestRubricJson(`
Review this judging rubric for fairness and clarity.

Output strict JSON with this shape:
{
  "verdict": "One sentence overall assessment.",
  "issues": [
    { "severity": "high | medium | low", "criterion": "criterion name, or empty for the whole rubric", "problem": "", "fix": "A direct instruction that would fix it, e.g. Merge Stage Presence and Audience Impact into one criterion." }
  ]
}

Rules:
- Look for: criteria that overlap or double-count, vague descriptions judges would read differently, weights that do not match what this kind of event should reward, something important for this event that is missing, and instructions that invite bias.
- Report at most 5 issues, most important first. Return an empty "issues" array when the rubric is sound.
- Do not report that weights fail to total 100 or that score guides are missing.
- Each "fix" must be one concrete instruction that can be applied as written.
- Write "verdict", "problem" and "fix" in ${language || 'English'}. Keep the JSON keys and severity values in English.

Event: ${JSON.stringify(compactEvent(event))}

Rubric: ${JSON.stringify(compactRubric(rubric))}
  `.trim());

  return {
    verdict: String(data?.verdict || '').trim(),
    issues: (Array.isArray(data?.issues) ? data.issues : [])
      .filter((issue) => String(issue?.problem || '').trim())
      .slice(0, 5)
      .map((issue, index) => ({
        id: `review-${index}`,
        severity: ['high', 'medium', 'low'].includes(issue.severity) ? issue.severity : 'medium',
        criterion: String(issue.criterion || '').trim(),
        problem: String(issue.problem).trim(),
        fix: String(issue.fix || '').trim(),
      })),
    model,
  };
}

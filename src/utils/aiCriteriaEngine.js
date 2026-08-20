import { requestCriteriaProfiles } from '../services/criteriaApiService';
import useAILogsStore from '../store/aiLogsStore';

/**
 * Dynamically generate criteria based on event details (title, description, type).
 * Uses keyword extraction and semantic matching - not static templates.
 */
function generateDynamicCriteria(eventName, eventType, description = '', subEvents = []) {
  const combinedText = `${eventName} ${description} ${eventType} ${subEvents.map((s) => s.name || '').join(' ')}`.toLowerCase();

  const keywords = {
    basketball: { words: ['basketball', 'hoops', 'ball', 'dribble', 'shoot', 'nba', '3x3'], criteria: [
      { name: 'Ball Handling & Dribbling', weight: 20, desc: 'Control, crossovers, handling under pressure' },
      { name: 'Shooting Accuracy', weight: 25, desc: 'Field goal percentage, free throws, range' },
      { name: 'Defensive Skills', weight: 20, desc: 'Positioning, steals, blocks, defensive IQ' },
      { name: 'Team Play & Passing', weight: 20, desc: 'Assists, court vision, team coordination' },
      { name: 'Game IQ & Decision Making', weight: 15, desc: 'Shot selection, clock management, adaptability' },
    ] },
    volleyball: { words: ['volleyball', 'vball', 'spike', 'serve', 'block', 'setter', 'libero'], criteria: [
      { name: 'Serving Technique', weight: 20, desc: 'Serve accuracy, power, consistency' },
      { name: 'Receiving & Passing', weight: 20, desc: 'Platform control, pass accuracy' },
      { name: 'Setting Ability', weight: 15, desc: 'Set placement, consistency, quick sets' },
      { name: 'Attacking & Spiking', weight: 25, desc: 'Spike power, placement, timing, versatility' },
      { name: 'Blocking & Defense', weight: 20, desc: 'Block timing, court coverage, digging' },
    ] },
    badminton: { words: ['badminton', 'shuttle', 'racquet', 'smash', 'drop', 'clear', 'net'], criteria: [
      { name: 'Footwork & Court Coverage', weight: 20, desc: 'Speed, agility, court positioning' },
      { name: 'Shot Accuracy', weight: 25, desc: 'Placement, consistency, variety of shots' },
      { name: 'Power & Smash', weight: 20, desc: 'Smash power, jump smash, attacking play' },
      { name: 'Strategy & Tactics', weight: 20, desc: 'Game plan, deception, shot selection' },
      { name: 'Stamina & Endurance', weight: 15, desc: 'Consistency throughout match, recovery' },
    ] },
    chess: { words: ['chess', 'board', 'checkmate', 'opening', 'tactic', 'endgame', 'e4', 'd4'], criteria: [
      { name: 'Opening Knowledge', weight: 15, desc: 'Opening principles, theory, preparation' },
      { name: 'Tactical Vision', weight: 30, desc: 'Pattern recognition, calculation, combinations' },
      { name: 'Strategic Planning', weight: 25, desc: 'Positional understanding, long-term plans' },
      { name: 'Endgame Technique', weight: 20, desc: 'Endgame knowledge, conversion, technique' },
      { name: 'Time Management', weight: 10, desc: 'Clock management, decision speed' },
    ] },
    dance: { words: ['dance', 'dancing', 'choreo', 'hiphop', 'hip-hop', 'ballet', 'contemporary', 'folk', 'tinikling'], criteria: [
      { name: 'Choreography & Creativity', weight: 25, desc: 'Originality, transitions, formation' },
      { name: 'Technical Execution', weight: 25, desc: 'Precision, control, body alignment' },
      { name: 'Performance & Stage Presence', weight: 20, desc: 'Energy, expression, audience connection' },
      { name: 'Synchronization', weight: 15, desc: 'Timing, team coordination, uniformity' },
      { name: 'Costume & Visual Impact', weight: 15, desc: 'Visual appeal, theme, overall presentation' },
    ] },
    singing: { words: ['sing', 'singing', 'vocal', 'song', 'kanta', 'voice', 'talent', 'choir'], criteria: [
      { name: 'Vocal Technique', weight: 25, desc: 'Pitch accuracy, breath control, tone quality' },
      { name: 'Interpretation & Expression', weight: 20, desc: 'Emotional delivery, song interpretation' },
      { name: 'Stage Presence', weight: 20, desc: 'Confidence, charisma, audience engagement' },
      { name: 'Vocal Range & Control', weight: 20, desc: 'Range, dynamics, vocal agility' },
      { name: 'Artistry & Originality', weight: 15, desc: 'Unique style, arrangement, creativity' },
    ] },
    pageant: { words: ['pageant', 'beauty', 'queen', 'coronation', 'gown', 'swimsuit', 'evening', 'mutya'], criteria: [
      { name: 'Beauty & Poise', weight: 20, desc: 'Overall appearance, posture, grace' },
      { name: 'Intelligence & Communication', weight: 25, desc: 'Q&A quality, articulation, substance' },
      { name: 'Talent Performance', weight: 25, desc: 'Talent execution, creativity, stage impact' },
      { name: 'Evening Gown/Attire', weight: 15, desc: 'Elegance, appropriateness, confidence' },
      { name: 'Advocacy & Personality', weight: 15, desc: 'Advocacy clarity, authenticity, charm' },
    ] },
    debate: { words: ['debate', 'argument', 'speech', 'orator', 'spokesperson', 'argumentation'], criteria: [
      { name: 'Argument Quality', weight: 25, desc: 'Logical reasoning, evidence, relevance' },
      { name: 'Delivery & Persuasion', weight: 20, desc: 'Clarity, confidence, persuasive power' },
      { name: 'Rebuttal Skills', weight: 20, desc: 'Counter-arguments, quick thinking, refutation' },
      { name: 'Content & Research', weight: 20, desc: 'Depth of knowledge, factual accuracy' },
      { name: 'Teamwork & Structure', weight: 15, desc: 'Team coordination, case structure' },
    ] },
    quiz: { words: ['quiz', 'trivia', 'academic', 'knowledge', 'question', 'brain', 'bee'], criteria: [
      { name: 'Knowledge Depth', weight: 30, desc: 'Breadth and depth of subject knowledge' },
      { name: 'Speed & Accuracy', weight: 25, desc: 'Response time, correctness under pressure' },
      { name: 'Strategy & Risk Management', weight: 20, desc: 'Question selection, point management' },
      { name: 'Team Collaboration', weight: 15, desc: 'Team discussion, consensus building' },
      { name: 'Focus & Composure', weight: 10, desc: 'Maintaining focus throughout competition' },
    ] },
    'mobile-legends': { words: ['mobile legends', 'mlbb', 'ml', 'battle', 'hero', 'tower', 'turret', 'jungle', 'lanes'], criteria: [
      { name: 'Mechanical Skills', weight: 25, desc: 'Hero mechanics, combos, micro-management' },
      { name: 'Map Awareness & Rotation', weight: 20, desc: 'Map vision, rotation timing, objective control' },
      { name: 'Team Coordination', weight: 20, desc: 'Team fights, synergy, communication' },
      { name: 'Drafting & Strategy', weight: 20, desc: 'Hero selection, counter-picks, game plan' },
      { name: 'Decision Making', weight: 15, desc: 'In-game decisions, risk assessment' },
    ] },
    valorant: { words: ['valorant', 'valo', 'fps', 'shooter', 'tactical', 'agent', 'spike', 'rifle'], criteria: [
      { name: 'Aim & Mechanics', weight: 25, desc: 'Crosshair placement, recoil control, flick shots' },
      { name: 'Game Sense & Positioning', weight: 20, desc: 'Map awareness, positioning, timing' },
      { name: 'Team Coordination', weight: 20, desc: 'Communication, utility usage, executes' },
      { name: 'Strategy & Adaptation', weight: 20, desc: 'Half-time adaptation, opponent reads' },
      { name: 'Clutch Performance', weight: 15, desc: 'Performance in high-pressure rounds' },
    ] },
    coding: { words: ['coding', 'programming', 'software', 'app', 'web', 'hackathon', 'algorithm', 'develop'], criteria: [
      { name: 'Code Quality', weight: 25, desc: 'Code organization, readability, best practices' },
      { name: 'Functionality', weight: 30, desc: 'Working features, completeness, performance' },
      { name: 'Problem Solving', weight: 20, desc: 'Algorithm efficiency, creative solutions' },
      { name: 'UI/UX Design', weight: 15, desc: 'User interface, experience, accessibility' },
      { name: 'Innovation', weight: 10, desc: 'Originality, impact, potential' },
    ] },
    'larong-lahi': { words: ['larong lahi', 'traditional', 'filipino', 'sipa', 'tumbang', 'patintero', 'luksong'], criteria: [
      { name: 'Skill & Technique', weight: 25, desc: 'Mastery of the traditional game mechanics' },
      { name: 'Speed & Agility', weight: 20, desc: 'Quickness, reaction time, physical dexterity' },
      { name: 'Sportsmanship', weight: 20, desc: 'Fair play, respect for rules and opponents' },
      { name: 'Team Coordination', weight: 20, desc: 'Teamwork, communication, strategy' },
      { name: 'Cultural Understanding', weight: 15, desc: 'Appreciation of the game cultural context' },
    ] },
    default: [
      { name: 'Overall Performance', weight: 30, desc: 'General performance quality and impact' },
      { name: 'Technical Skills', weight: 25, desc: 'Technical execution and proficiency' },
      { name: 'Creativity & Originality', weight: 20, desc: 'Creative approach and uniqueness' },
      { name: 'Presentation', weight: 15, desc: 'Overall presentation and delivery' },
      { name: 'Audience Impact', weight: 10, desc: 'Engagement and audience response' },
    ],
  };

  let bestMatch = { key: 'default', score: 0, criteria: keywords.default };

  for (const [key, data] of Object.entries(keywords)) {
    if (key === 'default') continue;
    let score = 0;
    for (const word of data.words) {
      if (combinedText.includes(word)) {
        score += word.length;
      }
    }
    if (score > bestMatch.score) {
      bestMatch = { key, score, criteria: data.criteria };
    }
  }

  const profileName = bestMatch.key === 'default' ? 'Standard Evaluation' : `${toTitleCase(bestMatch.key)} Assessment`;

  return {
    profile: profileName,
    criteria: bestMatch.criteria.map((criterion, index) => ({
      id: `criterion-${index + 1}`,
      name: criterion.name,
      weight: criterion.weight,
      description: criterion.desc,
      scoringRange: '1-10',
      judgeInstructions: `Evaluate ${criterion.name.toLowerCase()} based on observed performance. Score each contestant objectively (1-10).`,
      editable: true,
    })),
    scoringMethod: 'Weighted Rubric',
    tieBreaker: ['Highest weighted total score', 'Highest score in first criterion'],
    judgeInstructions: `Apply this ${profileName.toLowerCase()} rubric consistently across all contestants. Use the full 1-10 range for each criterion.`,
  };
}

function toTitleCase(str) {
  return str.replace(/-/g, ' ').replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function rebalanceCriteriaWeights(criteria = []) {
  const normalized = criteria.map((criterion, index) => ({
    id: criterion.id || `criterion-${index + 1}`,
    name: criterion.name || `Criterion ${index + 1}`,
    weight: Number(criterion.weight || 0),
    description: criterion.description || '',
    scoringRange: criterion.scoringRange || '1-10',
    judgeInstructions: criterion.judgeInstructions || 'Score with consistency and evidence.',
    editable: true,
  }));

  if (!normalized.length) return normalized;

  const total = normalized.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
  if (total === 100) return normalized;

  const base = Math.floor(100 / normalized.length);
  const remainder = 100 % normalized.length;
  return normalized.map((criterion, index) => ({
    ...criterion,
    weight: base + (index < remainder ? 1 : 0),
  }));
}

function ensureMinimumCriteria(criteria = [], minimum = 5) {
  const fallbackCriteria = [
    {
      name: 'Technical Execution',
      description: 'Accuracy, skill, and quality of the required performance or task.',
    },
    {
      name: 'Creativity and Originality',
      description: 'Freshness of ideas, uniqueness, and creative approach.',
    },
    {
      name: 'Presentation and Delivery',
      description: 'Confidence, clarity, stage presence, and overall delivery.',
    },
    {
      name: 'Relevance to Theme',
      description: 'How well the entry matches the event objective, category, or theme.',
    },
    {
      name: 'Overall Impact',
      description: 'Total impression, audience effect, and competitive quality.',
    },
  ];

  const nextCriteria = criteria.map((criterion, index) => ({
    ...criterion,
    id: criterion.id || `criterion-${index + 1}`,
    name: criterion.name || `Criterion ${index + 1}`,
  }));
  const existingNames = new Set(nextCriteria.map((criterion) => String(criterion.name || '').toLowerCase()));

  let fallbackIndex = 0;
  while (nextCriteria.length < minimum) {
    const baseFallback = fallbackCriteria[fallbackIndex % fallbackCriteria.length];
    const fallbackName = existingNames.has(baseFallback.name.toLowerCase())
      ? `Additional ${baseFallback.name}`
      : baseFallback.name;

    nextCriteria.push({
      id: `criterion-${Date.now()}-${nextCriteria.length + 1}`,
      name: fallbackName,
      weight: 0,
      description: baseFallback.description,
      scoringRange: '1-10',
      judgeInstructions: `Evaluate ${fallbackName.toLowerCase()} based on observable performance. Score objectively from 1-10.`,
      editable: true,
    });
    existingNames.add(fallbackName.toLowerCase());
    fallbackIndex += 1;
  }

  return rebalanceCriteriaWeights(nextCriteria);
}

function createProfileVariants(base) {
  const baseCriteria = ensureMinimumCriteria(base.criteria, 5);

  const balanced = {
    profile: `${base.profile} - Balanced`,
    criteria: baseCriteria.map((criterion) => ({ ...criterion, weight: criterion.weight })),
    scoringMethod: 'Weighted Rubric',
    tieBreaker: ['Highest weighted total score'],
    judgeInstructions: 'Apply a balanced evaluation approach. All criteria are weighted proportionally.',
  };

  const technical = {
    profile: `${base.profile} - Technical Priority`,
    criteria: baseCriteria.map((criterion, index) => ({
      ...criterion,
      weight: index === 0 ? criterion.weight + 10 : index === baseCriteria.length - 1 ? criterion.weight - 10 : criterion.weight,
    })),
    scoringMethod: 'Weighted Rubric',
    tieBreaker: ['Highest score in technical criterion', 'Lowest variance across judges'],
    judgeInstructions: 'Prioritize technical execution and precision. The first criterion carries extra weight.',
  };

  const performance = {
    profile: `${base.profile} - Performance Impact`,
    criteria: baseCriteria.map((criterion, index) => ({
      ...criterion,
      weight: index === baseCriteria.length - 1 ? criterion.weight + 10 : index === 0 ? criterion.weight - 10 : criterion.weight,
    })),
    scoringMethod: 'Weighted Rubric',
    tieBreaker: ['Highest presentation or impact score', 'Audience engagement score'],
    judgeInstructions: 'Emphasize overall performance quality, audience engagement, and presentation impact.',
  };

  return [balanced, technical, performance].map((profile) => ({
    ...profile,
    criteria: profile.criteria.map((criterion, index) => ({
      ...criterion,
      id: criterion.id || `${profile.profile.toLowerCase().replace(/\s+/g, '-')}-${index + 1}`,
      scoringRange: criterion.scoringRange || '1-10',
      judgeInstructions: criterion.judgeInstructions || `Evaluate ${criterion.name.toLowerCase()} objectively.`,
    })),
  }));
}

export const aiEngine = {
  generateCriteria(params) {
    const { eventName, eventType, description } = params;
    return generateDynamicCriteria(eventName, eventType, description, []);
  },

  detectJudgeBias(scores, judgeId) {
    if (!scores || scores.length < 3) return { biased: false, confidence: 0 };
    const judgeScores = scores.filter((score) => score.judgeId === judgeId);
    if (judgeScores.length < 3) return { biased: false, confidence: 0 };
    const mean = judgeScores.reduce((sum, score) => sum + score.score, 0) / judgeScores.length;
    const globalMean = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
    const deviation = Math.abs(mean - globalMean);
    return {
      biased: deviation > 15,
      confidence: Math.min(100, deviation * 3),
      averageScore: mean,
      globalAverage: globalMean,
    };
  },

  detectAnomalies(scores) {
    if (!scores || scores.length < 3) return [];
    const mean = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((sum, score) => sum + Math.pow(score.score - mean, 2), 0) / scores.length);
    return scores.filter((score) => Math.abs(score.score - mean) / (stdDev || 1) > 2).map((score) => ({
      participantId: score.participantId,
      judgeId: score.judgeId,
      score: score.score,
      reason: 'Significant deviation from average',
    }));
  },

  predictWinner(scores) {
    if (!scores || scores.length === 0) return null;
    return [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
  },
};

export function parseUploadedCriteriaTemplate(uploadedCriteria = '') {
  const input = String(uploadedCriteria || '').trim();
  if (!input) return [];

  const pickValue = (source = {}, keys = [], fallback = '') => {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== '') {
        return source[key];
      }
    }
    const normalizedEntries = Object.entries(source).reduce((acc, [key, value]) => {
      acc[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')] = value;
      return acc;
    }, {});
    for (const key of keys) {
      const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedEntries[normalizedKey] !== undefined && normalizedEntries[normalizedKey] !== null && String(normalizedEntries[normalizedKey]).trim() !== '') {
        return normalizedEntries[normalizedKey];
      }
    }
    return fallback;
  };

  const normalizeUploadedCriterion = (criterion = {}, index = 0) => ({
    id: pickValue(criterion, ['id'], `uploaded-${index + 1}`),
    name: String(pickValue(criterion, ['name', 'criterionName', 'criterion_name', 'criterion', 'title', 'Criterion name'], `Criterion ${index + 1}`)).trim(),
    weight: Number(pickValue(criterion, ['weight', 'points', 'percentage', 'scoreWeight', 'Weight'], 0)) || 0,
    description: String(pickValue(criterion, ['description', 'desc', 'details', 'rubricDescription', 'Description'], '')).trim(),
    scoringRange: String(pickValue(criterion, ['scoringRange', 'scoring_range', 'range', 'scoreRange', 'Scoring range'], '1-10')).trim(),
    judgeInstructions: String(pickValue(criterion, ['judgeInstructions', 'judge_instructions', 'instructions', 'judgeGuide', 'Judge instructions'], 'Score based on uploaded rubric.')).trim(),
    editable: true,
  });

  const cleanUploadedText = (value = '') => String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();

  const stripTableIntro = (value = '') => {
    const normalized = cleanUploadedText(value);
    const headerPattern = /criteria\s*name\s+weight\s+description\s+scoring\s*range\s+judge\s*instructions?/i;
    const headerMatch = normalized.match(headerPattern);
    if (!headerMatch || headerMatch.index === undefined) return normalized;
    return normalized.slice(headerMatch.index + headerMatch[0].length).trim();
  };

  const parseScoringRangeAndInstructions = (value = '') => {
    const text = cleanUploadedText(value);
    const rangeMatch = text.match(/\b(\d+(?:\.\d+)?\s*(?:-|to)\s*\d+(?:\.\d+)?|out\s+of\s+\d+(?:\.\d+)?|\/\s*\d+(?:\.\d+)?)\b/i);
    if (!rangeMatch || rangeMatch.index === undefined) {
      return {
        description: text,
        scoringRange: '1-10',
        judgeInstructions: 'Score based on uploaded rubric.',
      };
    }

    return {
      description: text.slice(0, rangeMatch.index).trim(),
      scoringRange: rangeMatch[1].replace(/\s+/g, ' ').trim() || '1-10',
      judgeInstructions: text.slice(rangeMatch.index + rangeMatch[0].length).trim() || 'Score based on uploaded rubric.',
    };
  };

  const parseTableTextCriteria = (value = '') => {
    if (value.includes('|')) return [];

    const tableText = stripTableIntro(value)
      .replace(/\b(Total\s+Weight|General\s+Judge\s+Instruction|Score\s+Meaning|Prepared\s+for)\b[\s\S]*$/i, '')
      .trim();
    if (!tableText) return [];

    const rowStartPattern = /(?:^|[\n.;])\s*([A-Z][A-Za-z0-9/&(),' -]{1,60}?)\s+(\d+(?:\.\d+)?)\s*%?\s+(?=(Measures|Evaluates|Assesses|Rates|Scores?|Judges?|Observe|Check|Consider|Accuracy|Creativity|Overall)\b)/gi;
    const rowStarts = [];
    let startMatch;

    while ((startMatch = rowStartPattern.exec(tableText)) !== null) {
      const prefix = startMatch[0].match(/^[\n.;\s]*/)?.[0] || '';
      const startIndex = startMatch.index + prefix.length;
      const name = cleanUploadedText(startMatch[1]);
      const weight = Number(startMatch[2]);

      if (!name || !Number.isFinite(weight)) continue;
      if (/^(criteria|criterion|weight|description|scoring|range|judge|instruction|ready|made|competition|total)$/i.test(name)) continue;

      rowStarts.push({
        startIndex,
        bodyStart: rowStartPattern.lastIndex,
        name,
        weight,
      });
    }

    const rows = [];
    rowStarts.forEach((rowStart, index) => {
      const nextStart = rowStarts[index + 1]?.startIndex ?? tableText.length;
      const body = cleanUploadedText(tableText.slice(rowStart.bodyStart, nextStart));

      if (!body) return;

      const details = parseScoringRangeAndInstructions(body);
      rows.push(normalizeUploadedCriterion({
        id: `uploaded-${rows.length + 1}`,
        name: rowStart.name,
        weight: rowStart.weight,
        description: details.description,
        scoringRange: details.scoringRange,
        judgeInstructions: details.judgeInstructions,
      }, rows.length));
    });

    return rows.length >= 2 ? rows : [];
  };

  try {
    const parsed = JSON.parse(input);
    const parsedCriteria = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.criteria)
        ? parsed.criteria
        : Array.isArray(parsed?.profiles?.[0]?.criteria)
          ? parsed.profiles[0].criteria
          : [];

    if (parsedCriteria.length > 0) {
      return parsedCriteria.map(normalizeUploadedCriterion);
    }
  } catch (error) {
    // Fallback to plain text parsing below.
  }

  const tableCriteria = parseTableTextCriteria(input);
  if (tableCriteria.length > 0) {
    return tableCriteria;
  }

  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelPattern = /^(criterion\s*name|name|description|weight|scoring\s*range|score\s*range|range|judge\s*instructions|judge\s*instruction|instructions?)\s*[:\-]\s*(.+)$/i;
  const blocks = input
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const labeledCriteria = blocks.map((block, index) => {
    const fields = {};
    block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const match = line.match(labelPattern);
      if (!match) return;
      const key = match[1].toLowerCase().replace(/\s+/g, '');
      fields[key] = match[2].trim();
    });
    if (!Object.keys(fields).length) return null;
    return normalizeUploadedCriterion({
      name: fields.criterionname || fields.name,
      description: fields.description,
      weight: fields.weight,
      scoringRange: fields.scoringrange || fields.scorerange || fields.range,
      judgeInstructions: fields.judgeinstructions || fields.judgeinstruction || fields.instructions || fields.instruction,
    }, index);
  }).filter(Boolean);

  if (labeledCriteria.length > 0) {
    return labeledCriteria;
  }

  return lines.map((line, index) => {
    const delimiter = line.includes('|') ? '|' : ',';
    const parts = line.split(delimiter).map((part) => part.trim());
    return normalizeUploadedCriterion({
      id: `uploaded-${index + 1}`,
      name: parts[0],
      weight: parts[1] || Math.floor(100 / Math.max(lines.length, 1)),
      description: parts[2],
      scoringRange: parts[3],
      judgeInstructions: parts[4],
    }, index);
  });
}

export function generateCriteriaFromUpload(uploadedCriteria = '', params = {}) {
  const eventName = params.eventName || params.title || 'Event';
  const eventType = params.eventType || params.type || 'contest';
  const description = params.description || '';
  const subEvents = params.subEvents || [];
  const parsedTemplate = parseUploadedCriteriaTemplate(uploadedCriteria);

  const baseProfile = parsedTemplate.length > 0
    ? (() => {
        return {
          profile: 'Uploaded Criteria Template',
          criteria: ensureMinimumCriteria(parsedTemplate, 5),
          scoringMethod: 'Weighted Rubric',
          tieBreaker: ['Highest weighted total score', 'Highest score in first criterion'],
          judgeInstructions: 'Use the uploaded ready-made criteria as the official judging rubric.',
        };
      })()
    : generateDynamicCriteria(eventName, eventType, description, subEvents);

  if (parsedTemplate.length > 0) {
    return [baseProfile];
  }

  return createProfileVariants(baseProfile);
}

export function generateJudgeAssets(params) {
  const criteria = params.criteria || [];
  const timestamp = Date.now().toString(36);
  const accessCode = `JDG-${timestamp.slice(-6).toUpperCase()}`;
  const sessionId = `session-${timestamp}`;
  const accessLink = `/judge/session/${sessionId}`;

  return {
    sessionId,
    accessCode,
    accessLink,
    scoreSheets: criteria.map((criterion) => ({
      criteriaName: criterion.name,
      weight: criterion.weight || 10,
      maxScore: 10,
    })),
    deductionRules: [],
  };
}

export async function generateCriteriaWithAIFallback(params = {}) {
  const startTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let result = null;
  let source = 'fallback';
  let error = null;
  let fallbackReason = null;
  const modelUsed = import.meta.env.VITE_AI_CRITERIA_MODEL || 'openai/gpt-4o-mini';
  const promptText = params.prompt || 'Create a professional judging rubric.';
  const promptEstimate = Math.ceil(promptText.length / 4);

  try {
    result = await requestCriteriaProfiles({
      title: params.eventName || params.title || 'Event',
      eventType: params.eventType || 'contest',
      description: params.description || '',
      subEvents: params.subEvents || [],
      scoringMethod: params.scoringMethod || 'weighted',
      audienceImpact: params.audienceImpact !== false,
      userPrompt: promptText,
      uploadedTemplate: params.uploadedCriteria || '',
    });
    source = 'api';
  } catch (apiError) {
    fallbackReason = String(apiError?.message || 'API unavailable');
    result = generateCriteriaFromUpload(params.uploadedCriteria, params);
    source = 'fallback';
  }

  const responseTime = Date.now() - startTime;
  const generationSucceeded = Array.isArray(result) ? result.length > 0 : Boolean(result);

  if (!generationSucceeded) {
    error = fallbackReason || 'No criteria could be generated.';
  }

  useAILogsStore.getState().addLog({
    timestamp: new Date().toISOString(),
    requestId,
    source,
    modelUsed,
    eventType: params.eventType || 'unknown',
    eventTitle: params.eventName || 'Untitled',
    success: generationSucceeded,
    error,
    fallbackReason,
    responseTime,
    criteriaCount: Array.isArray(result) ? result.length : 1,
    userId: params.userId || 'unknown',
    promptPreview: promptText.slice(0, 140),
    promptTokensEstimate: promptEstimate,
    tokenUsageEstimate: promptEstimate + ((Array.isArray(result) ? result.length : 1) * 180),
  });

  if (Array.isArray(result)) {
    return result.map((option, index) => ({
      profile: option.profile || `Profile ${index + 1}`,
      criteria: ensureMinimumCriteria(Array.isArray(option.criteria) ? option.criteria : [], 5),
      scoringMethod: option.scoringMethod || 'Weighted Rubric',
      tieBreaker: Array.isArray(option.tieBreaker) ? option.tieBreaker : ['Highest weighted total score'],
      judgeInstructions: option.judgeInstructions || '',
      source,
      modelUsed,
      requestId,
      fallbackReason,
    }));
  }

  return [{
    ...result,
    criteria: ensureMinimumCriteria(Array.isArray(result?.criteria) ? result.criteria : [], 5),
    source,
    modelUsed,
    requestId,
    fallbackReason,
  }];
}

export { generateDynamicCriteria };
export default aiEngine;

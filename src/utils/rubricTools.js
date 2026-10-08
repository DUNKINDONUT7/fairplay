// Shared rubric helpers used by the criteria maker, the judge scoring pages,
// the event page and the criteria PDF, so they all read a rubric the same way.

export const MIN_CRITERIA = 3;

// Score guide levels are stored as a share of the criterion's top score, so a
// guide keeps working when the organizer switches the event's point scale.
export const SCORE_LEVELS = [
  { key: 'excellent', label: 'Excellent', minPercent: 90, tone: '#047857', soft: '#ecfdf5' },
  { key: 'good', label: 'Good', minPercent: 75, tone: '#1d4ed8', soft: '#eff6ff' },
  { key: 'fair', label: 'Fair', minPercent: 60, tone: '#b45309', soft: '#fffbeb' },
  { key: 'weak', label: 'Needs Improvement', minPercent: 0, tone: '#b91c1c', soft: '#fef2f2' },
];

const levelKey = (value = '') => {
  const text = String(value).toLowerCase();
  if (/excel|outstand|superior/.test(text)) return 'excellent';
  if (/good|profic|strong/.test(text)) return 'good';
  if (/fair|average|satisf|develop/.test(text)) return 'fair';
  if (/weak|poor|needs|improve|begin|below/.test(text)) return 'weak';
  return '';
};

// Accepts an array of levels or an object keyed by level, and always returns
// the four levels in order. Returns [] when there is no guide text at all.
export function normalizeScoreGuide(raw) {
  const descriptions = {};

  if (Array.isArray(raw)) {
    raw.forEach((level, index) => {
      const key = levelKey(level?.key || level?.label || level?.level) || SCORE_LEVELS[index]?.key;
      const description = String(level?.description || level?.text || '').trim();
      if (key && description && !descriptions[key]) descriptions[key] = description;
    });
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([name, value]) => {
      const key = levelKey(name);
      const description = String(value?.description || value || '').trim();
      if (key && description) descriptions[key] = description;
    });
  }

  if (Object.keys(descriptions).length === 0) return [];

  return SCORE_LEVELS.map((level) => ({
    key: level.key,
    label: level.label,
    minPercent: level.minPercent,
    description: descriptions[level.key] || '',
  }));
}

export function hasScoreGuide(criterion) {
  return normalizeScoreGuide(criterion?.scoreGuide).some((level) => level.description);
}

export function buildDefaultScoreGuide(criterion = {}) {
  const subject = String(criterion.name || 'this criterion').trim().toLowerCase();
  return normalizeScoreGuide({
    excellent: `Outstanding ${subject}. Consistently strong from start to finish with no noticeable weaknesses.`,
    good: `Strong ${subject} with only minor lapses that do not affect the overall result.`,
    fair: `Acceptable ${subject}, but with noticeable inconsistencies or missed opportunities.`,
    weak: `Weak ${subject}. Frequent or major problems, or the requirement is largely not met.`,
  });
}

export function parseRangeBounds(scoringRange) {
  const numbers = (String(scoringRange || '').match(/\d+(\.\d+)?/g) || []).map(Number);
  const max = numbers[numbers.length - 1] || 10;
  const min = numbers.length > 1 ? Math.min(numbers[0], max) : 1;
  return { min, max };
}

// Turns the percentage levels into real scores for a criterion's range,
// e.g. on 1-10: Excellent 9-10, Good 8, Fair 6-7, Needs Improvement 1-5.
export function describeScoreBands(scoreGuide, scoringRange) {
  const levels = normalizeScoreGuide(scoreGuide);
  if (levels.length === 0) return [];

  const { min, max } = parseRangeBounds(scoringRange);
  let ceiling = max;

  return levels.map((level, index) => {
    const meta = SCORE_LEVELS[index];
    const isLast = index === levels.length - 1;
    const from = isLast ? min : Math.max(Math.ceil((level.minPercent / 100) * max), min);
    const to = ceiling;
    ceiling = from - 1;
    return {
      ...level,
      tone: meta.tone,
      soft: meta.soft,
      from,
      to,
      rangeLabel: from === to ? String(from) : `${from}-${to}`,
    };
  }).filter((band) => band.from <= band.to);
}

export function getScoreBand(score, scoreGuide, scoringRange) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return null;
  return describeScoreBands(scoreGuide, scoringRange).find((band) => value >= band.from && value <= band.to) || null;
}

// Scales weights to total exactly 100 while keeping their proportions
// (largest-remainder rounding), instead of flattening them to equal shares.
export function scaleWeightsTo100(criteria = []) {
  if (!criteria.length) return criteria;

  const weights = criteria.map((criterion) => Math.max(Number(criterion.weight) || 0, 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 100 && weights.every(Number.isInteger)) return criteria;

  const exact = total > 0
    ? weights.map((weight) => (weight / total) * 100)
    : weights.map(() => 100 / weights.length);
  const floors = exact.map(Math.floor);
  let leftover = 100 - floors.reduce((sum, weight) => sum + weight, 0);

  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (leftover <= 0) return;
      floors[index] += 1;
      leftover -= 1;
    });

  return criteria.map((criterion, index) => ({ ...criterion, weight: floors[index] }));
}

// Instant, offline checks shown beside the editor. `severity` is
// 'error' (blocks saving), 'warning' or 'tip'.
export function checkRubricHealth(rubric = {}) {
  const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];
  const issues = [];
  if (criteria.length === 0) return issues;

  const total = criteria.reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0);
  if (total !== 100) {
    issues.push({ id: 'total', severity: 'error', fix: 'scale', message: `Weights add up to ${total}%, not 100%.` });
  }
  if (criteria.length < MIN_CRITERIA) {
    issues.push({ id: 'count', severity: 'error', message: `Add at least ${MIN_CRITERIA} criteria. You have ${criteria.length}.` });
  }

  const seen = new Map();
  criteria.forEach((criterion, index) => {
    const label = String(criterion.name || '').trim() || `Criterion ${index + 1}`;
    const key = label.toLowerCase();
    if (seen.has(key)) {
      issues.push({ id: `dup-${index}`, severity: 'warning', message: `"${label}" appears more than once.` });
    }
    seen.set(key, true);

    if (!String(criterion.name || '').trim()) {
      issues.push({ id: `name-${index}`, severity: 'error', message: `Criterion ${index + 1} has no name.` });
    }
    if ((Number(criterion.weight) || 0) <= 0) {
      issues.push({ id: `zero-${index}`, severity: 'warning', message: `"${label}" has no weight, so it will not affect the result.` });
    }
    if ((Number(criterion.weight) || 0) > 60) {
      issues.push({ id: `heavy-${index}`, severity: 'tip', message: `"${label}" carries ${criterion.weight}% — one criterion decides most of the result.` });
    }
    if (String(criterion.description || '').trim().length < 12) {
      issues.push({ id: `desc-${index}`, severity: 'tip', message: `"${label}" needs a clearer description for judges.` });
    }
  });

  const withoutGuide = criteria.filter((criterion) => !hasScoreGuide(criterion)).length;
  if (withoutGuide > 0) {
    issues.push({
      id: 'guide',
      severity: 'tip',
      fix: 'guides',
      message: `${withoutGuide} ${withoutGuide === 1 ? 'criterion has' : 'criteria have'} no score guide, so judges may read the scale differently.`,
    });
  }

  return issues;
}

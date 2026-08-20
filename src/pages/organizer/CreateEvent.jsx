import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useRubricTemplateStore from '../../store/rubricTemplateStore';
import {
  generateCriteriaFromUpload,
  generateCriteriaWithAIFallback,
  generateJudgeAssets,
} from '../../utils/aiCriteriaEngine';
import { getBusinessActorId } from '../../utils/identity';
import { requestEventDescription } from '../../services/criteriaApiService';
import { ensureEventTournamentAutomation } from '../../services/automationService';
import {
  ESPORTS_GAMES,
  TEAM_EVENT_CATEGORIES,
  getParticipantLimitMessage,
  getTeamLimitPreset,
} from '../../utils/teamEventRules';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const STEPS = [
  { id: 1, title: 'Event Setup', icon: 'bi bi-card-checklist' },
  { id: 2, title: 'Competition Format', icon: 'bi bi-diagram-3' },
  { id: 3, title: 'AI Criteria', icon: 'bi bi-cpu' },
  { id: 4, title: 'Judge Access', icon: 'bi bi-person-badge' },
  { id: 5, title: 'Review', icon: 'bi bi-rocket-takeoff' },
];

const EVENT_TYPES = [
  { value: 'tournament', label: 'Tournament', icon: 'bi-trophy', desc: 'Bracket-based competition', mode: 'tournament' },
  { value: 'sportsfest', label: 'Sports Fest', icon: 'bi-bicycle', desc: 'Multiple sub-events with brackets', mode: 'tournament' },
  { value: 'singing', label: 'Singing Contest', icon: 'bi-mic', desc: 'Points leaderboard judging', mode: 'performance' },
  { value: 'pageant', label: 'Pageant', icon: 'bi-stars', desc: 'Score-based judging and ranking', mode: 'performance' },
  { value: 'dance', label: 'Dance Contest', icon: 'bi-music-note-beamed', desc: 'Points leaderboard by criteria', mode: 'performance' },
  { value: 'academic', label: 'Academic Contest', icon: 'bi-book', desc: 'Knowledge-based judging', mode: 'performance' },
  { value: 'contest', label: 'General Contest', icon: 'bi-award', desc: 'Flexible scoring competition', mode: 'performance' },
];

const TOURNAMENT_TYPES = ['tournament', 'sportsfest', 'esports', 'sports'];
const AUDIENCE_IMPACT_EVENT_TYPES = ['singing', 'pageant', 'dance', 'academic', 'contest'];

function createTimeOptions() {
  const options = [];
  for (let hour = 7; hour <= 17; hour += 1) {
    const value = `${String(hour).padStart(2, '0')}:00`;
    const displayHour = hour > 12 ? hour - 12 : hour;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    options.push({ value, label: `${displayHour}:00 ${suffix}` });
  }
  return options;
}

const TIME_OPTIONS = createTimeOptions();

const BRACKET_TYPES = [
  { value: 'single', label: 'Single Elimination', icon: 'bi-diagram-2', desc: 'One loss and you\'re out. Fast and decisive.' },
  { value: 'round-robin', label: 'Round Robin', icon: 'bi-arrow-repeat', desc: 'Everyone plays everyone. Best record wins.' },
  { value: 'group-knockout', label: 'Group Stage + Knockout', icon: 'bi-diagram-3', desc: 'Round robin groups then elimination rounds.' },
];

const PERFORMANCE_SCORING_MODES = [
  {
    value: 'points-leaderboard',
    label: 'Points leaderboard',
    icon: 'bi-bar-chart-line',
    desc: 'Judges score everyone once. Highest total average score becomes champion.',
  },
  {
    value: 'ranked-leaderboard',
    label: 'Judge ranking',
    icon: 'bi-list-ol',
    desc: 'Judges rank contestants by placement. Lowest rank total wins.',
  },
  {
    value: 'multi-round',
    label: 'Round elimination',
    icon: 'bi-arrow-right-circle',
    desc: 'Use elimination, semi-finals, and finals with top contestants advancing.',
  },
  {
    value: 'head-to-head-bracket',
    label: 'Head-to-head bracket',
    icon: 'bi-diagram-3',
    desc: 'Use bracket matches for performance contests that need direct face-offs.',
  },
];

const defaultRounds = () => [
  { id: `r-${Date.now()}-1`, name: 'Elimination Round', advanceTo: 10 },
  { id: `r-${Date.now()}-2`, name: 'Semi-Finals', advanceTo: 5 },
  { id: `r-${Date.now()}-3`, name: 'Finals', advanceTo: null },
];

const SUB_EVENT_CATEGORIES = [
  'Indoor Sport',
  'Outdoor Sport',
  'Esports',
  'Performing Arts',
  'Academic',
  'Cultural',
  'Special Event',
  'Custom',
];

const CATEGORY_KEYWORDS = [
  { category: 'Indoor Sport', keywords: ['basketball', 'volleyball', 'badminton', 'table tennis', 'chess', 'futsal', 'indoor'] },
  { category: 'Outdoor Sport', keywords: ['football', 'soccer', 'baseball', 'softball', 'athletics', 'track', 'field', 'running', 'outdoor'] },
  { category: 'Esports', keywords: ['mlbb', 'mobile legends', 'valorant', 'codm', 'dota', 'league of legends', 'esport', 'gaming'] },
  { category: 'Performing Arts', keywords: ['dance', 'singing', 'vocal', 'music', 'band', 'talent', 'performance'] },
  { category: 'Academic', keywords: ['quiz', 'debate', 'spelling', 'math', 'science', 'coding', 'programming', 'academic'] },
  { category: 'Cultural', keywords: ['pageant', 'costume', 'folk', 'cultural', 'poster', 'art'] },
];

function getTodayDateInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function combineDateAndTime(date, time) {
  if (!date) return '';
  return `${date}T${time || '07:00'}`;
}

function getDisplayDateTime(date, time) {
  if (!date) return 'Not set';
  const option = TIME_OPTIONS.find((entry) => entry.value === time);
  return `${date} ${option?.label || ''}`.trim();
}

const emptySubEvent = () => ({
  id: `subevent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: '',
  category: 'Indoor Sport',
  format: 'individual',
  tournamentFormat: 'single',
  sportType: 'Basketball',
  esportGame: '',
  customSportName: '',
  minParticipants: 5,
  maxTeamMembers: 12,
  coachRequired: false,
  substitutesAllowed: true,
  maxParticipants: '',
  venue: '',
});

function suggestSubEventCategory(name = '') {
  const normalized = name.toLowerCase();
  const match = CATEGORY_KEYWORDS.find((group) =>
    group.keywords.some((keyword) => normalized.includes(keyword))
  );
  return match?.category || 'Special Event';
}

function normalizeSubEventForSave(subEvent) {
  const category = subEvent.category === 'Custom'
    ? subEvent.customCategory?.trim() || 'Custom'
    : subEvent.category;

  return {
    ...subEvent,
    category,
    tournamentFormat: subEvent.tournamentFormat || 'single',
    sportType: subEvent.sportType || category,
    esportGame: subEvent.esportGame || '',
    customSportName: subEvent.customSportName?.trim() || '',
    minParticipants: Number(subEvent.minParticipants || 1),
    maxTeamMembers: Number(subEvent.maxTeamMembers || subEvent.maxParticipants || 1),
    coachRequired: Boolean(subEvent.coachRequired),
    substitutesAllowed: subEvent.substitutesAllowed !== false,
    maxParticipants: subEvent.maxParticipants || '',
    venue: subEvent.venue?.trim() || '',
  };
}

function normalizeCriteriaOption(result, index = 0) {
  const rawCriteria = Array.isArray(result?.criteria) ? result.criteria : [];
  const criteria = rawCriteria.map((criterion, criterionIndex) => ({
    id: criterion.id || `criterion-${index}-${criterionIndex}`,
    name: criterion.name || `Criterion ${criterionIndex + 1}`,
    weight: Number(criterion.weight || 0),
    description: criterion.description || '',
    scoringRange: criterion.scoringRange || '1-10',
    judgeInstructions: criterion.judgeInstructions || 'Score with consistency and evidence.',
    editable: true,
  }));

  return {
    profile: result?.profile || `Profile ${index + 1}`,
    criteria,
    scoringMethod: result?.scoringMethod || 'Weighted Rubric',
    tieBreaker: Array.isArray(result?.tieBreaker) ? result.tieBreaker : ['Highest weighted total score'],
    judgeInstructions: result?.judgeInstructions || 'Apply the rubric consistently across all contestants.',
  };
}

function getCriteriaSourceLabel(source) {
  if (source === 'api') return 'AI API';
  if (source === 'uploaded') return 'Uploaded template';
  return 'Local fallback';
}

function getCriteriaSourceTone(source) {
  if (source === 'api') return '#2563eb';
  if (source === 'uploaded') return '#059669';
  return '#b45309';
}

async function extractPdfText(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pageTexts.push(text);
  }

  return pageTexts.join('\n').trim();
}

function StepIndicator({ currentStep, activeSteps, competitionMode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeSteps.length}, 1fr)`, gap: 12, marginBottom: 24 }}>
      {activeSteps.map((step, displayIndex) => {
        const stepTitle = step.id === 4 && competitionMode === 'tournament' ? 'Scorer Access' : step.title;
        const active = step.id === currentStep;
        const complete = activeSteps.findIndex((s) => s.id === currentStep) > displayIndex;
        return (
          <div
            key={step.id}
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              border: active ? '1px solid rgba(37,99,235,0.28)' : '1px solid #e2e8f0',
              background: active ? 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(14,165,233,0.10))' : '#ffffff',
              boxShadow: active ? '0 12px 30px rgba(37,99,235,0.10)' : '0 8px 24px rgba(15,23,42,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: complete ? 'rgba(37,99,235,0.12)' : active ? 'rgba(14,165,233,0.14)' : '#f1f5f9',
                color: complete ? '#2563eb' : active ? '#0284c7' : '#64748b',
              }}
            >
              <i className={complete ? 'bi bi-check2' : step.icon} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Step {displayIndex + 1}
              </div>
              <div style={{ fontWeight: 700, color: complete || active ? '#1d4ed8' : '#334155' }}>{stepTitle}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CreateEvent() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createEvent } = useEventStore();
  const { success, error } = useNotificationStore();
  const { templates: rubricTemplates, fetchTemplates: fetchRubricTemplates, saveTemplate: saveRubricTemplate } = useRubricTemplateStore();

  const [step, setStep] = useState(1);
  const [showRubricLibrary, setShowRubricLibrary] = useState(false);

  useEffect(() => {
    fetchRubricTemplates();
  }, [fetchRubricTemplates]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [criteriaOptions, setCriteriaOptions] = useState([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [uploadedCriteriaText, setUploadedCriteriaText] = useState('');
  const [uploadedCriteriaName, setUploadedCriteriaName] = useState('');
  const [criteriaDraft, setCriteriaDraft] = useState({
    profile: 'Pending generation',
    criteria: [],
    scoringMethod: 'Weighted Rubric',
    tieBreaker: ['Highest weighted total score'],
    judgeInstructions: '',
  });
  const [form, setForm] = useState({
    title: '',
    eventType: 'tournament',
    description: '',
    imageUrl: '',
    location: '',
    format: 'in-person',
    scoringType: 'weighted',
    // Competition format
    bracketType: 'single',
    performanceScoringMode: 'points-leaderboard',
    pointScale: '100',
    championRule: 'highest-average-score',
    maxParticipants: '',
    rounds: defaultRounds(),
    subEvents: [emptySubEvent()],
    teamEventCategory: 'Basketball',
    esportGame: '',
    customSportName: '',
    minTeamMembers: 5,
    maxTeamMembers: 12,
    coachRequired: false,
    substitutesAllowed: true,
    // Schedule
    startDate: '',
    startTime: '07:00',
    endDate: '',
    endTime: '17:00',
    registrationDeadline: '',
    // Controls
    enableQR: true,
    enableCertificates: true,
    attendanceTracking: true,
    audienceImpact: false,
    audienceImpactWeight: 10,
    audienceVotingOpen: false,
  });
  const todayDate = useMemo(() => getTodayDateInputValue(), []);
  const hasAutoGenerated = useRef(false);

  const selectedEventType = EVENT_TYPES.find((et) => et.value === form.eventType);

  const totalWeight = useMemo(
    () => criteriaDraft.criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0),
    [criteriaDraft.criteria]
  );

  const judgeAssets = useMemo(() => {
    const fallbackCriteria = [{ name: 'Overall Performance', weight: 100 }];
    return generateJudgeAssets({
      criteria: criteriaDraft.criteria.length > 0 ? criteriaDraft.criteria : fallbackCriteria,
      rubrics: [],
      deductions: [],
    });
  }, [criteriaDraft.criteria]);

  const judgeQRValue = useMemo(
    () => `${window.location.origin}${judgeAssets.accessLink}`,
    [judgeAssets.accessLink]
  );
  const teamLimitPreview = useMemo(
    () => getTeamLimitPreset({
      sportType: form.teamEventCategory,
      esportGame: form.esportGame,
      customSportName: form.customSportName,
      minParticipants: form.minTeamMembers,
      maxParticipants: form.maxTeamMembers,
    }),
    [form.customSportName, form.esportGame, form.maxTeamMembers, form.minTeamMembers, form.teamEventCategory]
  );

  const handleFieldChange = useCallback((event) => {
    const { name, value, type, checked } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;

    setForm((current) => {
      const next = { ...current, [name]: nextValue };

      if (name === 'startDate' && value) {
        if (next.endDate && next.endDate < value) next.endDate = '';
        if (next.registrationDeadline && next.registrationDeadline > value) next.registrationDeadline = '';
      }

      if ((name === 'startDate' || name === 'endDate' || name === 'startTime' || name === 'endTime') &&
        next.startDate && next.endDate && next.startDate === next.endDate && next.endTime < next.startTime) {
        next.endTime = next.startTime;
      }

      if (name === 'performanceScoringMode') {
        if (value === 'points-leaderboard') {
          next.scoringType = 'points';
          next.championRule = 'highest-average-score';
        } else if (value === 'ranked-leaderboard') {
          next.scoringType = 'ranking';
          next.championRule = 'lowest-rank-total';
        } else if (value === 'head-to-head-bracket') {
          next.scoringType = 'weighted';
          next.championRule = 'bracket-winner';
        } else {
          next.scoringType = 'weighted';
          next.championRule = 'final-round-highest-score';
        }
      }

      if (name === 'eventType') {
        const isAudienceRelevant = AUDIENCE_IMPACT_EVENT_TYPES.includes(value);
        if (!isAudienceRelevant) {
          next.audienceImpact = false;
          next.audienceVotingOpen = false;
        }
      }

      if (name === 'teamEventCategory' || name === 'esportGame') {
        const sportType = name === 'teamEventCategory' ? value : next.teamEventCategory;
        const esportGame = name === 'esportGame' ? value : next.esportGame;
        const preset = getTeamLimitPreset({
          sportType,
          esportGame,
          customSportName: next.customSportName,
        });
        if (sportType !== 'Other Team Sports' && !(sportType === 'Esports' && esportGame === 'Other')) {
          next.minTeamMembers = preset.min;
          next.maxTeamMembers = preset.max;
        }
      }

      return next;
    });
  }, []);

  const handleEventImageUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      error('Please upload a PNG or JPEG image only.');
      event.target.value = '';
      return;
    }

    const maxSizeInBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      error('Image is too large. Please upload a PNG or JPEG under 2 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        imageUrl: String(reader.result || ''),
      }));
      success('Event image uploaded.');
    };
    reader.onerror = () => {
      error('Unable to read the image file.');
    };
    reader.readAsDataURL(file);
  }, [error, success]);

  const updateRound = useCallback((id, field, value) => {
    setForm((cur) => ({
      ...cur,
      rounds: cur.rounds.map((r) => r.id === id ? { ...r, [field]: value } : r),
    }));
  }, []);

  const addRound = useCallback(() => {
    setForm((cur) => ({
      ...cur,
      rounds: [
        ...cur.rounds.slice(0, -1),
        { id: `r-${Date.now()}`, name: 'New Round', advanceTo: 3 },
        cur.rounds[cur.rounds.length - 1],
      ],
    }));
  }, []);

  const removeRound = useCallback((id) => {
    setForm((cur) => ({
      ...cur,
      rounds: cur.rounds.length > 2 ? cur.rounds.filter((r) => r.id !== id) : cur.rounds,
    }));
  }, []);

  const generateDescription = useCallback(async () => {
    const title = form.title.trim();
    if (!title) {
      error('Enter an event title first.');
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const description = await requestEventDescription({
        title,
        eventType: form.eventType,
        eventTypeLabel: selectedEventType?.label,
        eventTypeDescription: selectedEventType?.desc,
        deliveryFormat: form.format,
        scoringType: form.scoringType,
        subEvents: form.subEvents.filter((subEvent) => subEvent.name.trim()).map(normalizeSubEventForSave),
      });

      setForm((current) => ({ ...current, description }));
      success('AI drafted the event description.');
    } catch (descriptionError) {
      error(String(descriptionError?.message || 'Unable to generate event description.'));
    } finally {
      setIsGeneratingDescription(false);
    }
  }, [
    error,
    form.description,
    form.eventType,
    form.format,
    form.scoringType,
    form.subEvents,
    form.title,
    selectedEventType?.desc,
    selectedEventType?.label,
    success,
  ]);

  const updateSubEvent = useCallback((subEventId, field, value) => {
    setForm((current) => ({
      ...current,
      subEvents: current.subEvents.map((subEvent) =>
        subEvent.id === subEventId
          ? (() => {
            const next = {
              ...subEvent,
              [field]: value,
              ...(field === 'name' && !subEvent.categoryCustom
                ? { category: suggestSubEventCategory(value) }
                : {}),
            };
            if (field === 'sportType' || field === 'esportGame') {
              const preset = getTeamLimitPreset({
                sportType: field === 'sportType' ? value : next.sportType,
                esportGame: field === 'esportGame' ? value : next.esportGame,
                customSportName: next.customSportName,
              });
              if (next.sportType !== 'Other Team Sports' && !(next.sportType === 'Esports' && next.esportGame === 'Other')) {
                next.minParticipants = preset.min;
                next.maxTeamMembers = preset.max;
              }
            }
            return next;
          })()
          : subEvent
      ),
    }));
  }, []);

  const updateSubEventCategory = useCallback((subEventId, value) => {
    setForm((current) => ({
      ...current,
      subEvents: current.subEvents.map((subEvent) =>
        subEvent.id === subEventId
          ? {
              ...subEvent,
              category: value,
              categoryCustom: value === 'Custom',
            }
          : subEvent
      ),
    }));
  }, []);

  const addSubEvent = useCallback(() => {
    setForm((current) => ({ ...current, subEvents: [...current.subEvents, emptySubEvent()] }));
  }, []);

  const removeSubEvent = useCallback((subEventId) => {
    setForm((current) => ({
      ...current,
      subEvents: current.subEvents.length > 1
        ? current.subEvents.filter((subEvent) => subEvent.id !== subEventId)
        : current.subEvents,
    }));
  }, []);

  const validateStep = useCallback((targetStep) => {
    if (targetStep === 1) {
      if (!form.title.trim()) return 'Event title is required.';
      if (!form.description.trim()) return 'Event description is required.';
    }

    if (targetStep === 2) {
      if (!form.startDate || !form.endDate) return 'Start date and end date are required.';
      if (form.startDate < todayDate) return 'Start date cannot be in the past.';
      if (form.endDate < form.startDate) return 'End date must be on or after the start date.';
      if (!form.startTime || !form.endTime) return 'Start time and end time are required.';
      if (form.startDate === form.endDate && form.endTime < form.startTime) return 'End time must be on or after start time.';
      if (form.registrationDeadline) {
        if (form.registrationDeadline < todayDate) return 'Registration deadline cannot be in the past.';
        if (form.registrationDeadline > form.startDate) return 'Registration deadline must be on or before the start date.';
      }
      if (form.eventType !== 'sportsfest' && !form.location.trim()) return 'Location is required.';
      const mode = TOURNAMENT_TYPES.includes(form.eventType) ? 'tournament' : 'performance';
      if (mode === 'tournament') {
        if (!form.maxParticipants) return 'Set the maximum number of teams/participants.';
        if (form.teamEventCategory === 'Other Team Sports' && !form.customSportName.trim()) return 'Type the custom team sport name.';
        if (form.teamEventCategory === 'Esports' && !form.esportGame) return 'Choose the esports game.';
        if (form.teamEventCategory === 'Esports' && form.esportGame === 'Other' && !form.customSportName.trim()) return 'Type the custom esports game name.';
        if (Number(form.minTeamMembers || 0) < 1 || Number(form.maxTeamMembers || 0) < Number(form.minTeamMembers || 0)) {
          return 'Set a valid minimum and maximum team member limit.';
        }
        if (form.eventType === 'sportsfest') {
          const validSubEvents = form.subEvents.filter((subEvent) => subEvent.name.trim());
          if (validSubEvents.length === 0) return 'Add at least one sub-event for a sports fest.';
          if (validSubEvents.some((subEvent) => subEvent.category === 'Custom' && !subEvent.customCategory?.trim())) {
            return 'Type a custom category or choose one from the category dropdown.';
          }
          if (validSubEvents.some((subEvent) => Number(subEvent.maxParticipants || 0) < 1)) {
            return 'Set maximum participants for each sub-event.';
          }
          if (validSubEvents.some((subEvent) => subEvent.format === 'team' && Number(subEvent.maxTeamMembers || 0) < Number(subEvent.minParticipants || 0))) {
            return 'Set valid team member limits for each team sub-event.';
          }
        }
      }
      if (mode === 'performance') {
        if (!form.maxParticipants) return 'Set the maximum number of contestants.';
        if (form.audienceImpact && (Number(form.audienceImpactWeight || 0) < 1 || Number(form.audienceImpactWeight || 0) > 30)) {
          return 'Audience Impact weight must be between 1% and 30%.';
        }
        if (form.performanceScoringMode === 'multi-round' && form.rounds.length < 2) {
          return 'Add at least 2 rounds (e.g. Eliminations and Finals).';
        }
      }
    }

    if (targetStep === 3) {
      if (criteriaDraft.criteria.length < 5) return 'Generate at least five judging criteria.';
      if (totalWeight !== 100) return `Total criteria weight must be 100. Current total is ${totalWeight}.`;
    }

    return '';
  }, [
    criteriaDraft.criteria.length,
    form.description,
    form.audienceImpact,
    form.audienceImpactWeight,
    form.customSportName,
    form.endDate,
    form.endTime,
    form.esportGame,
    form.eventType,
    form.location,
    form.maxParticipants,
    form.maxTeamMembers,
    form.minTeamMembers,
    form.registrationDeadline,
    form.startDate,
    form.startTime,
    form.subEvents,
    form.teamEventCategory,
    form.title,
    todayDate,
    totalWeight,
  ]);

  const generateCriteria = useCallback(async () => {
    const descriptionPrompt = form.description.trim();
    if (!descriptionPrompt) {
      error('Add an event description first. FairPlay uses that as the criteria prompt.');
      return;
    }

    setIsGenerating(true);
    try {
      const options = await generateCriteriaWithAIFallback({
        eventName: form.title,
        eventType: form.eventType,
        description: form.description,
        prompt: descriptionPrompt,
        uploadedCriteria: uploadedCriteriaText,
        subEvents: form.subEvents.filter((subEvent) => subEvent.name.trim()).map(normalizeSubEventForSave),
        scoringMethod: form.scoringType,
        audienceImpact: form.audienceImpact,
        userId: user?.id,
      });

      const normalized = (Array.isArray(options) ? options : [options]).map((opt, idx) => normalizeCriteriaOption(opt, idx)).filter((option) => option.criteria.length > 0);
      if (normalized.length === 0) {
        throw new Error('No criteria returned.');
      }

      // Preserve AI metadata
      const enhancedNormalized = normalized.map((opt, idx) => ({
        ...opt,
        source: options[idx]?.source || 'fallback',
        modelUsed: options[idx]?.modelUsed || 'local',
        requestId: options[idx]?.requestId || 'local-gen',
      }));

      setCriteriaOptions(enhancedNormalized);
      setSelectedOptionIndex(0);
      setCriteriaDraft(enhancedNormalized[0]);

      // Show source information
      const source = options[0]?.source === 'api' ? '(AI Generated)' : '(Local Generation)';
      success(`Generated ${normalized.length} criteria profile${normalized.length > 1 ? 's' : ''} ${source}.`);
      return true;
    } catch (generationError) {
      error(String(generationError?.message || 'Unable to generate criteria. Please try again.'));
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [error, form.audienceImpact, form.description, form.eventType, form.scoringType, form.subEvents, form.title, success, uploadedCriteriaText, user?.id]);

  const handleCriteriaFileUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const text = isPdf ? await extractPdfText(file) : await file.text();
      if (!text.trim()) {
        throw new Error(isPdf ? 'No readable text found in this PDF.' : 'The uploaded criteria file is empty.');
      }
      setUploadedCriteriaText(text);
      setUploadedCriteriaName(file.name);
      success('Criteria file loaded. You can edit it, import it, or regenerate with AI.');
    } catch (uploadError) {
      error(String(uploadError?.message || 'Unable to read criteria file.'));
    } finally {
      event.target.value = '';
    }
  }, [error, success]);

  const handleImportUploadedCriteria = useCallback(() => {
    if (!uploadedCriteriaText.trim()) {
      error('Upload or paste your ready-made criteria first.');
      return;
    }

    const options = generateCriteriaFromUpload(uploadedCriteriaText, {
      eventName: form.title,
      eventType: form.eventType,
      description: form.description,
      subEvents: form.subEvents.filter((subEvent) => subEvent.name.trim()).map(normalizeSubEventForSave),
    });
    const normalized = (Array.isArray(options) ? options : [options])
      .map((opt, idx) => normalizeCriteriaOption(opt, idx))
      .filter((option) => option.criteria.length >= 5)
      .map((option) => ({
        ...option,
        source: 'uploaded',
        modelUsed: uploadedCriteriaName || 'uploaded-template',
        requestId: `uploaded-${Date.now()}`,
      }));

    if (normalized.length === 0) {
      error('Unable to read usable criteria from the uploaded template.');
      return;
    }

    setCriteriaOptions(normalized);
    setSelectedOptionIndex(0);
    setCriteriaDraft(normalized[0]);
    success(`Uploaded ${normalized[0].criteria.length} criteria. You can now edit them before review.`);
  }, [error, form.description, form.eventType, form.subEvents, form.title, success, uploadedCriteriaName, uploadedCriteriaText]);

  useEffect(() => {
    if (step === 3 && !hasAutoGenerated.current) {
      hasAutoGenerated.current = true;
      generateCriteria();
    }
    // only re-run when step changes, not on every generateCriteria recreation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSelectOption = useCallback((index) => {
    setSelectedOptionIndex(index);
    setCriteriaDraft(criteriaOptions[index]);
  }, [criteriaOptions]);

  const handleCriteriaChange = useCallback((index, field, value) => {
    setCriteriaDraft((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, criterionIndex) =>
        criterionIndex === index ? { ...criterion, [field]: field === 'weight' ? Number(value) : value } : criterion
      ),
    }));
  }, []);

  const handleAddCriterion = useCallback(() => {
    setCriteriaDraft((current) => ({
      ...current,
      criteria: [
        ...current.criteria,
        {
          id: `criterion-${Date.now()}`,
          name: 'New Criterion',
          weight: 10,
          description: 'Describe what judges should evaluate.',
          scoringRange: '1-10',
          judgeInstructions: 'Use objective evidence when assigning a score.',
        },
      ],
    }));
  }, []);

  const handleRemoveCriterion = useCallback((index) => {
    setCriteriaDraft((current) => ({
      ...current,
      criteria: current.criteria.length > 5
        ? current.criteria.filter((_, criterionIndex) => criterionIndex !== index)
        : current.criteria,
    }));
  }, []);

  const handleBalanceWeights = useCallback(() => {
    setCriteriaDraft((current) => {
      const count = current.criteria.length || 1;
      const base = Math.floor(100 / count);
      const remainder = 100 % count;
      return {
        ...current,
        criteria: current.criteria.map((criterion, index) => ({
          ...criterion,
          weight: base + (index < remainder ? 1 : 0),
        })),
      };
    });
    success('Criteria weights balanced to 100.');
  }, [success]);

  const handleSaveRubricAsTemplate = useCallback(async () => {
    if (criteriaDraft.criteria.length === 0) {
      error('Generate or build a rubric first before saving it as a template.');
      return;
    }
    const name = window.prompt('Name this rubric template:', form.title ? `${form.title} rubric` : 'My rubric');
    if (!name || !name.trim()) return;
    await saveRubricTemplate({
      name: name.trim(),
      eventType: form.eventType,
      criteria: criteriaDraft.criteria,
      scoringMethod: criteriaDraft.scoringMethod,
      tieBreaker: criteriaDraft.tieBreaker,
      judgeInstructions: criteriaDraft.judgeInstructions,
    });
    success(`Saved "${name.trim()}" to your rubric library.`);
  }, [criteriaDraft, error, form.eventType, form.title, saveRubricTemplate, success]);

  const handleLoadRubricTemplate = useCallback((template) => {
    setCriteriaDraft({
      profile: template.name,
      criteria: template.criteria,
      scoringMethod: template.scoringMethod,
      tieBreaker: template.tieBreaker,
      judgeInstructions: template.judgeInstructions,
      source: 'template',
      modelUsed: '',
    });
    setShowRubricLibrary(false);
    success(`Loaded rubric template "${template.name}".`);
  }, [success]);

  const handleReorderCriterion = useCallback((index, direction) => {
    setCriteriaDraft((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.criteria.length) {
        return current;
      }
      const nextCriteria = [...current.criteria];
      [nextCriteria[index], nextCriteria[targetIndex]] = [nextCriteria[targetIndex], nextCriteria[index]];
      return { ...current, criteria: nextCriteria };
    });
  }, []);

  const handleCopy = useCallback(async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      success(`${label} copied.`);
    } catch (copyError) {
      error(`Unable to copy ${label.toLowerCase()}.`);
    }
  }, [error, success]);

  const competitionMode = useMemo(
    () => (TOURNAMENT_TYPES.includes(form.eventType) ? 'tournament' : 'performance'),
    [form.eventType]
  );

  const activeSteps = useMemo(
    () => competitionMode === 'tournament'
      ? STEPS.filter((s) => s.id !== 3)
      : STEPS,
    [competitionMode]
  );

  const nextStep = useCallback(() => {
    const validationError = validateStep(step);
    if (validationError) {
      error(validationError);
      return;
    }
    const currentIndex = activeSteps.findIndex((s) => s.id === step);
    const nextActive = activeSteps[currentIndex + 1];
    if (nextActive) setStep(nextActive.id);
  }, [error, step, validateStep, activeSteps]);

  const previousStep = useCallback(() => {
    const currentIndex = activeSteps.findIndex((s) => s.id === step);
    const prevActive = activeSteps[currentIndex - 1];
    if (prevActive) setStep(prevActive.id);
  }, [step, activeSteps]);

  const handleSubmit = useCallback(async () => {
    if (competitionMode === 'performance') {
      const validationError = validateStep(3);
      if (validationError) {
        error(validationError);
        return;
      }
    }

    setLoading(true);
    try {
      const subEventsForSave = form.subEvents.filter((subEvent) => subEvent.name.trim()).map(normalizeSubEventForSave);
      const totalMaxParticipants = subEventsForSave.reduce(
        (sum, subEvent) => sum + Number(subEvent.maxParticipants || 0),
        0
      );
      const mode = TOURNAMENT_TYPES.includes(form.eventType) ? 'tournament' : 'performance';
      const audienceImpactEnabled = mode === 'performance' && Boolean(form.audienceImpact);
      const createdEvent = await createEvent({
        organizer_id: getBusinessActorId(user),
        organizerAuthProfileId: user?.id || '',
        organizerEmail: user?.email || '',
        title: form.title,
        eventType: form.eventType,
        type: form.eventType,
        description: form.description,
        image: form.imageUrl,
        imageUrl: form.imageUrl,
        coverImage: form.imageUrl,
        location: form.location,
        format: form.format,
        scoringType: form.scoringType,
        competitionMode: mode,
        bracketType: mode === 'tournament' || form.performanceScoringMode === 'head-to-head-bracket' ? form.bracketType : null,
        performanceScoringMode: mode === 'performance' ? form.performanceScoringMode : null,
        pointScale: mode === 'performance' && form.performanceScoringMode !== 'head-to-head-bracket' ? form.pointScale : null,
        championRule: mode === 'performance' ? form.championRule : null,
        rounds: mode === 'performance' && form.performanceScoringMode === 'multi-round' ? form.rounds : null,
        tournamentFormat: mode === 'tournament' || form.performanceScoringMode === 'head-to-head-bracket' ? form.bracketType : null,
        startDate: combineDateAndTime(form.startDate, form.startTime),
        endDate: combineDateAndTime(form.endDate, form.endTime),
        startTime: form.startTime,
        endTime: form.endTime,
        registrationDeadline: form.registrationDeadline,
        maxParticipants: totalMaxParticipants || Number(form.maxParticipants) || 0,
        sportType: form.teamEventCategory,
        esportGame: form.teamEventCategory === 'Esports' ? form.esportGame : '',
        customSportName: form.customSportName,
        minParticipants: Number(form.minTeamMembers || teamLimitPreview.min || 0),
        maxTeamMembers: Number(form.maxTeamMembers || teamLimitPreview.max || 0),
        coachRequired: form.coachRequired,
        substitutesAllowed: form.substitutesAllowed,
        enableQR: form.enableQR,
        enableCertificates: form.enableCertificates,
        attendanceTracking: form.attendanceTracking,
        audienceImpact: audienceImpactEnabled,
        audienceImpactEnabled,
        audienceImpactWeight: audienceImpactEnabled ? Number(form.audienceImpactWeight || 10) : 0,
        audienceVotingOpen: audienceImpactEnabled && Boolean(form.audienceVotingOpen),
        audienceQrToken: audienceImpactEnabled ? `audience-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : '',
        subEvents: subEventsForSave,
        criteria: criteriaDraft.criteria,
        judgeProfile: criteriaDraft.profile,
        scoringMethod: criteriaDraft.scoringMethod,
        tieBreaker: criteriaDraft.tieBreaker,
        judgeInstructions: criteriaDraft.judgeInstructions,
        judgeSessions: [judgeAssets],
        status: 'draft',
        participants: 0,
        createdAt: new Date().toISOString(),
      });
      if (!createdEvent) {
        throw new Error('Event was not saved to Supabase.');
      }
      try {
        await ensureEventTournamentAutomation(createdEvent, []);
      } catch (automationError) {
        console.warn('Event was created, but automation setup did not finish:', automationError?.message || automationError);
      }
      success('Event created successfully.');
      navigate('/organizer/events');
    } catch (submissionError) {
      console.error('Failed to create event:', submissionError);
      error(`Failed to create event${submissionError?.message ? `: ${submissionError.message}` : '.'}`);
    } finally {
      setLoading(false);
    }
  }, [competitionMode, createEvent, criteriaDraft, error, form, judgeAssets, navigate, success, teamLimitPreview.max, teamLimitPreview.min, user?.id, validateStep]);

  const sectionCardStyle = {
    background: '#ffffff',
    border: '1px solid #dbeafe',
    borderRadius: 18,
    padding: 24,
    boxShadow: '0 14px 40px rgba(37, 99, 235, 0.08)',
  };

  return (
    <DashboardLayout title="Create Event" subtitle="Configure your event, generate AI-ready judging criteria, and publish a complete scoring workflow.">
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <StepIndicator currentStep={step} activeSteps={activeSteps} competitionMode={competitionMode} />

        <AnimatePresence mode="wait">
          <motion.div
            key={`step-${step}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.18 }}
          >
            {step === 1 && (
              <div style={{ display: 'grid', gap: 20 }}>
                <div style={sectionCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                    <div>
                      <div style={eyebrowStyle}>Step 1 of 5</div>
                      <h2 style={panelTitleStyle}>Event Setup</h2>
                    </div>
                    <button onClick={() => navigate('/organizer/events')} style={secondaryButtonStyle}>
                      <i className="bi bi-arrow-left" /><span>Back to Events</span>
                    </button>
                  </div>

                  <Field label="Event Title">
                    <input name="title" value={form.title} onChange={handleFieldChange} placeholder="Example: University Week 2026" style={inputStyle} />
                  </Field>

                  {/* Visual event type selector */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 12 }}>Event Type</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                      {EVENT_TYPES.map((et) => {
                        const active = form.eventType === et.value;
                        return (
                          <button
                            key={et.value}
                            type="button"
                            onClick={() => setForm((c) => ({
                              ...c,
                              eventType: et.value,
                              ...(et.mode === 'performance'
                                ? {
                                    scoringType: 'points',
                                    performanceScoringMode: 'points-leaderboard',
                                    championRule: 'highest-average-score',
                                  }
                                : {
                                    scoringType: 'weighted',
                                  }),
                            }))}
                            style={{
                              padding: '14px 12px',
                              borderRadius: 16,
                              border: active ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                              background: active ? 'linear-gradient(135deg,rgba(37,99,235,0.1),rgba(14,165,233,0.08))' : '#f8fafc',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                              boxShadow: active ? '0 8px 24px rgba(37,99,235,0.12)' : 'none',
                            }}
                          >
                            <i className={`bi ${et.icon}`} style={{ fontSize: 22, color: active ? '#2563eb' : '#94a3b8', display: 'block', marginBottom: 8 }} />
                            <div style={{ fontWeight: 700, fontSize: 13, color: active ? '#1d4ed8' : '#0f172a', marginBottom: 3 }}>{et.label}</div>
                            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{et.desc}</div>
                            <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: et.mode === 'tournament' ? '#0ea5e9' : '#8b5cf6' }}>
                              {et.mode === 'tournament' ? 'Bracket' : 'Score-based'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field label="Event Description">
                    <div className={`ai-description-field${isGeneratingDescription ? ' is-drafting' : ''}`}>
                      <textarea
                        name="description"
                        value={form.description}
                        onChange={handleFieldChange}
                        rows={4}
                        placeholder={isGeneratingDescription ? 'AI is drafting...' : 'Describe the event scope, participants, rules, and judging expectations.'}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </div>
                    <div style={descriptionActionPanelStyle}>
                      <div>
                        <div style={{ color: '#1e3a8a', fontWeight: 800, fontSize: 14 }}>AI description helper</div>
                        <div style={helperTextStyle}>{form.description.trim() ? 'Regenerate to get a fresh AI draft.' : 'Set a title and type first, then generate.'}</div>
                      </div>
                      <button type="button" onClick={generateDescription} disabled={isGeneratingDescription || !form.title.trim()}
                        style={{ ...descriptionActionButtonStyle, opacity: isGeneratingDescription || !form.title.trim() ? 0.62 : 1, cursor: isGeneratingDescription || !form.title.trim() ? 'not-allowed' : 'pointer' }}>
                        <i className={isGeneratingDescription ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-magic'} />
                        <span>{isGeneratingDescription ? 'Drafting...' : form.description.trim() ? 'Regenerate' : 'Generate Description'}</span>
                      </button>
                    </div>
                  </Field>

                  <Field label="Event Image">
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 14, alignItems: 'stretch' }}>
                      <div style={{ display: 'grid', gap: 10 }}>
                        <input
                          name="imageUrl"
                          value={form.imageUrl}
                          onChange={handleFieldChange}
                          placeholder="Paste event poster, banner, or cover image link"
                          style={inputStyle}
                        />
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <label style={uploadImageButtonStyle}>
                            <i className="bi bi-image" />
                            Upload PNG/JPEG
                            <input
                              type="file"
                              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                              onChange={handleEventImageUpload}
                              style={{ display: 'none' }}
                            />
                          </label>
                          {form.imageUrl && (
                            <button
                              type="button"
                              onClick={() => setForm((current) => ({ ...current, imageUrl: '' }))}
                              style={clearImageButtonStyle}
                            >
                              Remove image
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ borderRadius: 14, border: '1px solid #dbeafe', background: '#f8fbff', overflow: 'hidden', minHeight: 72 }}>
                        {form.imageUrl ? (
                          <img
                            src={form.imageUrl}
                            alt="Event preview"
                            style={{ width: '100%', height: '100%', minHeight: 72, objectFit: 'cover', display: 'block' }}
                            onError={(event) => { event.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ height: '100%', minHeight: 72, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>
                            No image yet
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={helperTextStyle}>Paste an image link or upload a PNG/JPEG poster. This image is shown on admin oversight and event cards.</div>
                  </Field>

                  <div style={gridTwoStyle}>
                    <Field label="Delivery Format">
                      <select name="format" value={form.format} onChange={handleFieldChange} style={inputStyle}>
                        <option value="in-person">In person</option>
                        <option value="online">Online</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </Field>
                    <Field label="Scoring Type">
                      <select name="scoringType" value={form.scoringType} onChange={handleFieldChange} style={inputStyle}>
                        <option value="weighted">Weighted rubric</option>
                        <option value="points">Points based</option>
                        <option value="ranking">Ranking based</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'grid', gap: 20 }}>

                {/* Competition mode banner */}
                <div style={{ ...infoPanelStyle, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <i className={`bi ${selectedEventType?.icon}`} style={{ fontSize: 32, color: '#2563eb' }} />
                  <div>
                    <div style={eyebrowStyle}>{competitionMode === 'tournament' ? 'Bracket-based' : 'Score-based'} competition</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{selectedEventType?.label}</div>
                    <div style={{ color: '#475569', fontSize: 13 }}>{selectedEventType?.desc}</div>
                  </div>
                </div>

                {/* ── TOURNAMENT CONFIG ── */}
                {competitionMode === 'tournament' && (
                  <>
                    <div style={sectionCardStyle}>
                      <div style={eyebrowStyle}>Bracket format</div>
                      <h2 style={panelTitleStyle}>How will matches be structured?</h2>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                        {BRACKET_TYPES.map((bt) => {
                          const active = form.bracketType === bt.value;
                          return (
                            <button key={bt.value} type="button"
                              onClick={() => setForm((c) => ({ ...c, bracketType: bt.value }))}
                              style={{ padding: 18, borderRadius: 16, border: active ? '2px solid #2563eb' : '1.5px solid #e2e8f0', background: active ? 'rgba(37,99,235,0.08)' : '#f8fafc', cursor: 'pointer', textAlign: 'left', boxShadow: active ? '0 8px 24px rgba(37,99,235,0.12)' : 'none' }}>
                              <i className={`bi ${bt.icon}`} style={{ fontSize: 24, color: active ? '#2563eb' : '#94a3b8', display: 'block', marginBottom: 10 }} />
                              <div style={{ fontWeight: 800, color: active ? '#1d4ed8' : '#0f172a', marginBottom: 4 }}>{bt.label}</div>
                              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{bt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                      <Field label="Maximum teams / participants">
                        <input name="maxParticipants" type="number" min="2" value={form.maxParticipants} onChange={handleFieldChange} placeholder="e.g. 8 teams" style={inputStyle} />
                      </Field>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
                        <Field label="Team sport category">
                          <select name="teamEventCategory" value={form.teamEventCategory} onChange={handleFieldChange} style={inputStyle}>
                            {TEAM_EVENT_CATEGORIES.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </Field>
                        {form.teamEventCategory === 'Esports' && (
                          <Field label="Esports game">
                            <select name="esportGame" value={form.esportGame} onChange={handleFieldChange} style={inputStyle}>
                              <option value="">Select game</option>
                              {ESPORTS_GAMES.map((game) => (
                                <option key={game} value={game}>{game}</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {(form.teamEventCategory === 'Other Team Sports' || form.esportGame === 'Other') && (
                          <Field label={form.teamEventCategory === 'Esports' ? 'Custom game name' : 'Custom sport name'}>
                            <input name="customSportName" value={form.customSportName} onChange={handleFieldChange} placeholder="Type custom name" style={inputStyle} />
                          </Field>
                        )}
                        <Field label="Minimum players">
                          <input name="minTeamMembers" type="number" min="1" value={form.minTeamMembers} onChange={handleFieldChange} style={inputStyle} />
                        </Field>
                        <Field label="Maximum players">
                          <input name="maxTeamMembers" type="number" min="1" value={form.maxTeamMembers} onChange={handleFieldChange} style={inputStyle} />
                        </Field>
                      </div>
                      <div style={{ ...infoPanelStyle, marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span>{getParticipantLimitMessage(teamLimitPreview)}</span>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
                          <input name="coachRequired" type="checkbox" checked={form.coachRequired} onChange={handleFieldChange} />
                          Coach required
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
                          <input name="substitutesAllowed" type="checkbox" checked={form.substitutesAllowed} onChange={handleFieldChange} />
                          Substitutes allowed
                        </label>
                      </div>
                    </div>

                    {/* Sub-events for Sports Fest */}
                    {form.eventType === 'sportsfest' && (
                      <div style={sectionCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                          <div>
                            <div style={eyebrowStyle}>Sports Fest structure</div>
                            <h2 style={panelTitleStyle}>Sub-events</h2>
                          </div>
                          <button onClick={addSubEvent} style={secondaryButtonStyle}><i className="bi bi-plus-lg" /><span>Add sub-event</span></button>
                        </div>
                        <div style={{ display: 'grid', gap: 12 }}>
                          {form.subEvents.map((subEvent, index) => (
                            <div key={subEvent.id} style={nestedPanelStyle}>
                              <div style={subEventGridStyle}>
                                <Field label={`Sub-event ${index + 1}`}>
                                  <input value={subEvent.name} onChange={(e) => updateSubEvent(subEvent.id, 'name', e.target.value)} placeholder="e.g. Basketball" style={inputStyle} />
                                </Field>
                                <Field label="Category">
                                  <select value={subEvent.category || 'Indoor Sport'} onChange={(e) => updateSubEventCategory(subEvent.id, e.target.value)} style={inputStyle}>
                                    {SUB_EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </Field>
                                <Field label="Format">
                                  <select value={subEvent.format} onChange={(e) => updateSubEvent(subEvent.id, 'format', e.target.value)} style={inputStyle}>
                                    <option value="individual">Individual</option>
                                    <option value="team">Team</option>
                                  </select>
                                </Field>
                                <Field label="Bracket">
                                  <select value={subEvent.tournamentFormat || 'single'} onChange={(e) => updateSubEvent(subEvent.id, 'tournamentFormat', e.target.value)} style={inputStyle}>
                                    <option value="single">Single elimination</option>
                                    <option value="round-robin">Round robin</option>
                                    <option value="group-knockout">Group + Knockout</option>
                                  </select>
                                </Field>
                                <Field label="Max participants">
                                  <input type="number" min="1" value={subEvent.maxParticipants || ''} onChange={(e) => updateSubEvent(subEvent.id, 'maxParticipants', e.target.value)} placeholder="e.g. 16" style={inputStyle} />
                                </Field>
                                {subEvent.format === 'team' && (
                                  <>
                                    <Field label="Team sport">
                                      <select value={subEvent.sportType || 'Basketball'} onChange={(e) => updateSubEvent(subEvent.id, 'sportType', e.target.value)} style={inputStyle}>
                                        {TEAM_EVENT_CATEGORIES.map((category) => (
                                          <option key={category} value={category}>{category}</option>
                                        ))}
                                      </select>
                                    </Field>
                                    {subEvent.sportType === 'Esports' && (
                                      <Field label="Esports game">
                                        <select value={subEvent.esportGame || ''} onChange={(e) => updateSubEvent(subEvent.id, 'esportGame', e.target.value)} style={inputStyle}>
                                          <option value="">Select game</option>
                                          {ESPORTS_GAMES.map((game) => (
                                            <option key={game} value={game}>{game}</option>
                                          ))}
                                        </select>
                                      </Field>
                                    )}
                                    {(subEvent.sportType === 'Other Team Sports' || subEvent.esportGame === 'Other') && (
                                      <Field label={subEvent.sportType === 'Esports' ? 'Custom game' : 'Custom sport'}>
                                        <input value={subEvent.customSportName || ''} onChange={(e) => updateSubEvent(subEvent.id, 'customSportName', e.target.value)} placeholder="Type custom name" style={inputStyle} />
                                      </Field>
                                    )}
                                    <Field label="Min team members">
                                      <input type="number" min="1" value={subEvent.minParticipants || ''} onChange={(e) => updateSubEvent(subEvent.id, 'minParticipants', e.target.value)} style={inputStyle} />
                                    </Field>
                                    <Field label="Max team members">
                                      <input type="number" min="1" value={subEvent.maxTeamMembers || ''} onChange={(e) => updateSubEvent(subEvent.id, 'maxTeamMembers', e.target.value)} style={inputStyle} />
                                    </Field>
                                  </>
                                )}
                                <Field label="Venue">
                                  <input value={subEvent.venue || ''} onChange={(e) => updateSubEvent(subEvent.id, 'venue', e.target.value)} placeholder="e.g. Brgy. Olympia Court" style={inputStyle} />
                                </Field>
                                <button onClick={() => removeSubEvent(subEvent.id)} style={iconButtonStyle} title="Remove"><i className="bi bi-trash3" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── PERFORMANCE CONFIG ── */}
                {competitionMode === 'performance' && (
                  <div style={sectionCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={eyebrowStyle}>Scoring system</div>
                        <h2 style={panelTitleStyle}>How will the champion be decided?</h2>
                      </div>
                      {form.performanceScoringMode === 'multi-round' && (
                        <button type="button" onClick={addRound} style={secondaryButtonStyle}><i className="bi bi-plus-lg" /><span>Add Round</span></button>
                      )}
                    </div>
                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                      For singing, dance, pageant, and similar contests, use a points leaderboard instead of bracket matches. Judges score everyone, then the highest total score becomes champion.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
                      {PERFORMANCE_SCORING_MODES.map((modeOption) => {
                        const active = form.performanceScoringMode === modeOption.value;
                        return (
                          <button
                            key={modeOption.value}
                            type="button"
                            onClick={() => handleFieldChange({ target: { name: 'performanceScoringMode', value: modeOption.value, type: 'button' } })}
                            style={{
                              ...nestedPanelStyle,
                              textAlign: 'left',
                              cursor: 'pointer',
                              border: active ? '2px solid #2563eb' : '1px solid #dbeafe',
                              background: active ? 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(14,165,233,0.08))' : '#ffffff',
                              boxShadow: active ? '0 12px 28px rgba(37,99,235,0.14)' : 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              <span style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', background: active ? '#dbeafe' : '#f1f5f9', color: '#2563eb' }}>
                                <i className={`bi ${modeOption.icon}`} />
                              </span>
                              <strong style={{ color: '#0f172a' }}>{modeOption.label}</strong>
                            </div>
                            <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>{modeOption.desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ ...infoPanelStyle, marginTop: 0, marginBottom: 18 }}>
                      <div style={eyebrowStyle}>Champion rule</div>
                      <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: 6 }}>
                        {form.performanceScoringMode === 'ranked-leaderboard'
                          ? 'Lowest rank total wins'
                          : form.performanceScoringMode === 'multi-round'
                            ? 'Final round highest score wins'
                            : form.performanceScoringMode === 'head-to-head-bracket'
                              ? 'Bracket winner becomes champion'
                            : 'Highest average score wins'}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.55 }}>
                        {form.performanceScoringMode === 'multi-round'
                          ? 'Use this only when the contest needs elimination rounds before finals.'
                          : form.performanceScoringMode === 'head-to-head-bracket'
                            ? 'Use this when contestants or teams face each other directly and advance through a bracket.'
                          : 'No bracket will be generated. The results page can rank contestants directly from submitted judge scores.'}
                      </div>
                    </div>

                    {form.performanceScoringMode === 'head-to-head-bracket' ? (
                      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
                        <div style={{ fontSize: 13, color: '#334155', fontWeight: 800 }}>Bracket format</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                          {BRACKET_TYPES.map((bracketOption) => {
                            const active = form.bracketType === bracketOption.value;
                            return (
                              <button
                                key={bracketOption.value}
                                type="button"
                                onClick={() => setForm((current) => ({ ...current, bracketType: bracketOption.value }))}
                                style={{
                                  ...nestedPanelStyle,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  border: active ? '2px solid #2563eb' : '1px solid #dbeafe',
                                  background: active ? 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(14,165,233,0.08))' : '#ffffff',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                  <i className={`bi ${bracketOption.icon}`} style={{ color: '#2563eb' }} />
                                  <strong style={{ color: '#0f172a' }}>{bracketOption.label}</strong>
                                </div>
                                <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>{bracketOption.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                        <Field label="Maximum contestants">
                          <input name="maxParticipants" type="number" min="2" value={form.maxParticipants} onChange={handleFieldChange} placeholder="e.g. 16 contestants" style={inputStyle} />
                        </Field>
                      </div>
                    ) : (
                      <div style={gridTwoStyle}>
                        <Field label="Point scale">
                          <select name="pointScale" value={form.pointScale} onChange={handleFieldChange} style={inputStyle}>
                            <option value="10">10-point scale</option>
                            <option value="50">50-point scale</option>
                            <option value="100">100-point scale</option>
                          </select>
                        </Field>
                        <Field label="Maximum contestants">
                          <input name="maxParticipants" type="number" min="2" value={form.maxParticipants} onChange={handleFieldChange} placeholder="e.g. 30 contestants" style={inputStyle} />
                        </Field>
                      </div>
                    )}

                    {form.performanceScoringMode === 'multi-round' && (
                    <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
                      {form.rounds.map((round, idx) => {
                        const isFinals = idx === form.rounds.length - 1;
                        return (
                          <div key={round.id} style={{ ...nestedPanelStyle, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: isFinals ? 'linear-gradient(135deg,#f59e0b,#f97316)' : 'rgba(37,99,235,0.1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              <i className={isFinals ? 'bi bi-trophy' : 'bi bi-arrow-right-circle'} style={{ color: isFinals ? '#fff' : '#2563eb' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <input
                                value={round.name}
                                onChange={(e) => updateRound(round.id, 'name', e.target.value)}
                                style={{ ...inputStyle, fontWeight: 700, padding: '8px 12px' }}
                                placeholder="Round name"
                              />
                            </div>
                            {!isFinals && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>Top</span>
                                <input
                                  type="number" min="1" value={round.advanceTo || ''}
                                  onChange={(e) => updateRound(round.id, 'advanceTo', Number(e.target.value))}
                                  style={{ ...inputStyle, width: 72, padding: '8px 10px', textAlign: 'center' }}
                                  placeholder="10"
                                />
                                <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>advance</span>
                              </div>
                            )}
                            {isFinals && (
                              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Finals</span>
                            )}
                            {!isFinals && form.rounds.length > 2 && (
                              <button onClick={() => removeRound(round.id)} style={{ ...iconButtonStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#ef4444' }}>
                                <i className="bi bi-trash3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                )}

                {/* ── SCHEDULE (shared) ── */}
                <div style={sectionCardStyle}>
                  <div style={eyebrowStyle}>Schedule and venue</div>
                  <h2 style={panelTitleStyle}>When and Where</h2>
                  <div style={gridTwoStyle}>
                    <Field label="Start date"><input name="startDate" type="date" min={todayDate} value={form.startDate} onChange={handleFieldChange} style={inputStyle} /></Field>
                    <Field label="Start time">
                      <select name="startTime" value={form.startTime} onChange={handleFieldChange} style={inputStyle}>
                        {TIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="End date"><input name="endDate" type="date" min={form.startDate || todayDate} value={form.endDate} onChange={handleFieldChange} style={inputStyle} /></Field>
                    <Field label="End time">
                      <select name="endTime" value={form.endTime} onChange={handleFieldChange} style={inputStyle}>
                        {TIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Registration deadline">
                      <input name="registrationDeadline" type="date" min={todayDate} max={form.startDate || undefined} value={form.registrationDeadline} onChange={handleFieldChange} style={inputStyle} />
                    </Field>
                    {form.eventType !== 'sportsfest' && (
                      <Field label="Venue / location"><input name="location" value={form.location} onChange={handleFieldChange} placeholder="e.g. Main gymnasium" style={inputStyle} /></Field>
                    )}
                  </div>
                  <div style={{ ...helperTextStyle, marginTop: 10 }}>Event time is limited to dropdown choices from 7:00 AM to 5:00 PM.</div>
                </div>

                {/* ── CONTROLS (shared) ── */}
                <div style={sectionCardStyle}>
                  <div style={eyebrowStyle}>Automation</div>
                  <h2 style={panelTitleStyle}>Operational Controls</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <ToggleCard label="Judge QR access" name="enableQR" value={form.enableQR} onChange={handleFieldChange} description="Create session QR codes for judges." />
                    <ToggleCard label="Certificate automation" name="enableCertificates" value={form.enableCertificates} onChange={handleFieldChange} description="Auto-generate certificates at finalization." />
                    <ToggleCard label="Attendance tracking" name="attendanceTracking" value={form.attendanceTracking} onChange={handleFieldChange} description="Track participant and judge attendance." />
                    {competitionMode === 'performance' && AUDIENCE_IMPACT_EVENT_TYPES.includes(form.eventType) && (
                      <ToggleCard label="Enable Audience Impact" name="audienceImpact" value={form.audienceImpact} onChange={handleFieldChange} description="Generate an audience QR and include audience score in final totals." />
                    )}
                  </div>
                  {competitionMode === 'performance' && form.audienceImpact && (
                    <div style={{ ...infoPanelStyle, marginTop: 16 }}>
                      <div style={eyebrowStyle}>Audience impact settings</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                        <Field label="Audience impact weight">
                          <input
                            name="audienceImpactWeight"
                            type="number"
                            min="1"
                            max="30"
                            value={form.audienceImpactWeight}
                            onChange={handleFieldChange}
                            style={inputStyle}
                          />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#0f172a', fontWeight: 800, paddingTop: 24 }}>
                          <input name="audienceVotingOpen" type="checkbox" checked={form.audienceVotingOpen} onChange={handleFieldChange} />
                          Open audience voting when event is published
                        </label>
                      </div>
                      <p style={{ margin: '8px 0 0', color: '#475569', fontSize: 13 }}>
                        Final score uses judges {100 - Number(form.audienceImpactWeight || 10)}% and audience {Number(form.audienceImpactWeight || 10)}%.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 20 }}>
                <div style={{ display: 'grid', gap: 20, alignSelf: 'start' }}>
                  <div style={sectionCardStyle}>
                    <div style={eyebrowStyle}>Event description prompt</div>
                    <h2 style={panelTitleStyle}>Criteria Source</h2>
                    <Field label="Prompt used by AI">
                      <textarea
                        value={form.description}
                        readOnly
                        rows={8}
                        placeholder="Go back to Event Setup and add a description first."
                        style={{ ...inputStyle, resize: 'vertical', background: '#f8fafc', color: '#334155' }}
                      />
                    </Field>
                    <div style={{ ...infoPanelStyle, background: '#ffffff' }}>
                      <div style={eyebrowStyle}>Ready-made criteria</div>
                      <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: 8 }}>Upload or paste template</div>
                      <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
                        Minimum is 5 criteria, but FairPlay will import all uploaded criteria even if the template has more. Format: Name | Weight | Description | Scoring range | Judge instructions.
                      </div>
                      <input
                        type="file"
                        accept=".pdf,application/pdf,.json,.txt,.csv,.md"
                        onChange={handleCriteriaFileUpload}
                        style={{ ...inputStyle, padding: 12, height: 'auto', marginBottom: 10 }}
                      />
                      {uploadedCriteriaName && (
                        <div style={{ color: '#059669', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                          Loaded: {uploadedCriteriaName}
                        </div>
                      )}
                      <textarea
                        value={uploadedCriteriaText}
                        onChange={(event) => setUploadedCriteriaText(event.target.value)}
                        rows={6}
                        placeholder={'Example:\nCreativity | 20 | Originality and uniqueness | 1-10 | Score creative concept, freshness, and theme fit.\nExecution | 20 | Skill and accuracy | 1-10 | Score clean delivery, timing, and control.'}
                        style={{ ...inputStyle, resize: 'vertical', color: '#0f172a', marginBottom: 12 }}
                      />
                      <button
                        type="button"
                        onClick={handleImportUploadedCriteria}
                        style={{ ...secondaryButtonStyle, width: '100%', justifyContent: 'center' }}
                      >
                        <i className="bi bi-upload" />
                        <span>Use uploaded criteria</span>
                      </button>
                    </div>
                    <div style={infoPanelStyle}>
                      <div style={eyebrowStyle}>Criteria basis</div>
                      <div style={{ color: '#0f172a', fontWeight: 700, marginBottom: 6 }}>{selectedEventType?.label}</div>
                      <div style={{ color: '#475569', fontSize: 14 }}>
                        {form.subEvents.filter((subEvent) => subEvent.name.trim()).map(normalizeSubEventForSave).map((subEvent) => `${subEvent.name} - ${subEvent.category}, ${subEvent.format}, ${subEvent.tournamentFormat}`).join('; ') || 'No sub-events listed'}
                      </div>
                    </div>
                  </div>

                  <div style={sectionCardStyle}>
                    <div style={eyebrowStyle}>Profile summary</div>
                    <h2 style={panelTitleStyle}>Generated Overview</h2>
                    <div style={summaryStatGridStyle}>
                      <StatTile label="Criteria count" value={String(criteriaDraft.criteria.length)} />
                      <StatTile label="Total weight" value={`${totalWeight}%`} tone={totalWeight === 100 ? '#2563eb' : '#b45309'} />
                      <StatTile label="Scoring method" value={criteriaDraft.scoringMethod} />
                      <StatTile label="Generation source" value={getCriteriaSourceLabel(criteriaDraft.source)} tone={getCriteriaSourceTone(criteriaDraft.source)} />
                      <StatTile label="Model" value={criteriaDraft.modelUsed || 'local'} />
                    </div>
                    {criteriaDraft.fallbackReason && (
                      <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13 }}>
                        AI API unavailable, so FairPlay used the local rubric generator. Reason: {criteriaDraft.fallbackReason}
                      </div>
                    )}
                    <div style={{ marginTop: 16, color: '#475569', fontSize: 14 }}>{criteriaDraft.judgeInstructions || 'Generate a profile to see judging guidance.'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 20 }}>
                  <div style={sectionCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                      <div>
                        <div style={eyebrowStyle}>Generated criteria</div>
                        <h2 style={panelTitleStyle}>Criteria Editor</h2>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { hasAutoGenerated.current = true; generateCriteria(); }}
                          disabled={isGenerating}
                          style={{
                            ...secondaryButtonStyle,
                            opacity: isGenerating ? 0.6 : 1,
                            cursor: isGenerating ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <i className={isGenerating ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-stars'} />
                          <span>{isGenerating ? 'Generating...' : 'Regenerate'}</span>
                        </button>
                        <button onClick={handleBalanceWeights} disabled={isGenerating} style={{ ...secondaryButtonStyle, opacity: isGenerating ? 0.5 : 1 }}>
                          <i className="bi bi-distribute-horizontal" />
                          <span>Balance weights</span>
                        </button>
                        <button onClick={handleAddCriterion} disabled={isGenerating} style={{ ...secondaryButtonStyle, opacity: isGenerating ? 0.5 : 1 }}>
                          <i className="bi bi-plus-lg" />
                          <span>Add criterion</span>
                        </button>
                        <button onClick={handleSaveRubricAsTemplate} disabled={isGenerating} style={{ ...secondaryButtonStyle, opacity: isGenerating ? 0.5 : 1 }}>
                          <i className="bi bi-bookmark-plus" />
                          <span>Save as template</span>
                        </button>
                        <div style={{ position: 'relative' }}>
                          <button onClick={() => setShowRubricLibrary((v) => !v)} disabled={isGenerating} style={{ ...secondaryButtonStyle, opacity: isGenerating ? 0.5 : 1 }}>
                            <i className="bi bi-collection" />
                            <span>Load template ({rubricTemplates.length})</span>
                          </button>
                          {showRubricLibrary && (
                            <div style={{ position: 'absolute', right: 0, top: '110%', width: 280, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #dbeafe', borderRadius: 14, boxShadow: '0 20px 50px rgba(37,99,235,0.15)', zIndex: 50, padding: 8 }}>
                              {rubricTemplates.length === 0 ? (
                                <div style={{ padding: 16, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                                  No saved templates yet. Generate a rubric, then "Save as template".
                                </div>
                              ) : rubricTemplates.map((template) => (
                                <button
                                  key={template.id}
                                  onClick={() => handleLoadRubricTemplate(template)}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{template.name}</div>
                                  <div style={{ fontSize: 11, color: '#64748b' }}>{template.criteria.length} criteria · {template.eventType || 'any type'}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {criteriaOptions.length > 1 && !isGenerating && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                        {criteriaOptions.map((option, index) => {
                          const active = index === selectedOptionIndex;
                          return (
                            <button
                              key={`${option.profile}-${index}`}
                              onClick={() => handleSelectOption(index)}
                              style={{
                                textAlign: 'left',
                                padding: 16,
                                borderRadius: 16,
                                border: active ? '1px solid rgba(37,99,235,0.32)' : '1px solid #e2e8f0',
                                background: active ? 'rgba(37,99,235,0.10)' : '#ffffff',
                                color: '#0f172a',
                                cursor: 'pointer',
                                boxShadow: active ? '0 10px 26px rgba(37,99,235,0.10)' : 'none',
                              }}
                            >
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>{option.profile}</div>
                              <div style={{ fontSize: 13, color: '#64748b' }}>{option.criteria.length} criteria</div>
                              <div style={{ fontSize: 13, color: '#2563eb', marginTop: 10 }}>{option.scoringMethod}</div>
                              <div style={{ fontSize: 12, color: getCriteriaSourceTone(option.source), marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {getCriteriaSourceLabel(option.source)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {isGenerating && (
                      <div style={{ ...nestedPanelStyle, textAlign: 'center', padding: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                        <div style={{ fontSize: 40, color: '#2563eb' }}>
                          <i className="bi bi-arrow-repeat animate-spin" />
                        </div>
                        <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 18 }}>Generating your criteria...</div>
                        <div style={{ color: '#64748b', fontSize: 14, maxWidth: 360, lineHeight: 1.6 }}>
                          AI is analyzing your event description and building a professional judging rubric. This usually takes a few seconds.
                        </div>
                      </div>
                    )}

                    {!isGenerating && criteriaDraft.criteria.length === 0 && (
                      <div style={{ ...nestedPanelStyle, textAlign: 'center', padding: 36 }}>
                        <div style={{ color: '#2563eb', fontSize: 30, marginBottom: 10 }}>
                          <i className="bi bi-stars" />
                        </div>
                        <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: 6 }}>No criteria generated yet</div>
                        <div style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                          Click Regenerate to build your judging rubric from the event description.
                        </div>
                        <button onClick={() => { hasAutoGenerated.current = true; generateCriteria(); }} style={secondaryButtonStyle}>
                          <i className="bi bi-stars" />
                          <span>Generate Criteria</span>
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'grid', gap: 12, opacity: isGenerating ? 0.3 : 1, pointerEvents: isGenerating ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                      {criteriaDraft.criteria.map((criterion, index) => (
                        <div key={criterion.id} style={nestedPanelStyle}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                            <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Criterion {index + 1}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handleReorderCriterion(index, -1)} style={iconButtonStyle} disabled={index === 0}>
                                <i className="bi bi-arrow-up" />
                              </button>
                              <button onClick={() => handleReorderCriterion(index, 1)} style={iconButtonStyle} disabled={index === criteriaDraft.criteria.length - 1}>
                                <i className="bi bi-arrow-down" />
                              </button>
                              <button onClick={() => handleRemoveCriterion(index)} style={iconButtonStyle} disabled={criteriaDraft.criteria.length <= 5}>
                                <i className="bi bi-trash3" />
                              </button>
                            </div>
                          </div>
                          <div style={gridTwoStyle}>
                            <Field label="Criterion name">
                              <input value={criterion.name} onChange={(event) => handleCriteriaChange(index, 'name', event.target.value)} style={inputStyle} />
                            </Field>
                            <Field label="Weight">
                              <input type="number" value={criterion.weight} onChange={(event) => handleCriteriaChange(index, 'weight', event.target.value)} style={inputStyle} />
                            </Field>
                          </div>
                          <Field label="Description">
                            <textarea value={criterion.description} onChange={(event) => handleCriteriaChange(index, 'description', event.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                          </Field>
                          <div style={gridTwoStyle}>
                            <Field label="Scoring range">
                              <input value={criterion.scoringRange} onChange={(event) => handleCriteriaChange(index, 'scoringRange', event.target.value)} style={inputStyle} />
                            </Field>
                            <Field label="Judge instructions">
                              <textarea value={criterion.judgeInstructions} onChange={(event) => handleCriteriaChange(index, 'judgeInstructions', event.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 20 }}>
                <div style={{ ...sectionCardStyle, background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <QRCodeSVG
                    value={judgeQRValue}
                    size={260}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="H"
                    includeMargin={false}
                  />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                      {competitionMode === 'tournament' ? 'Scorer Session QR' : 'Judge Session QR'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{judgeAssets.accessCode}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 20 }}>
                  <div style={sectionCardStyle}>
                    <div style={eyebrowStyle}>{competitionMode === 'tournament' ? 'Scorer session metadata' : 'Judge session metadata'}</div>
                    <h2 style={panelTitleStyle}>{competitionMode === 'tournament' ? 'Game Scorer Access Package' : 'Judge Access Package'}</h2>
                    <div style={summaryStatGridStyle}>
                      <StatTile label="Session ID" value={judgeAssets.sessionId} />
                      <StatTile label="Access code" value={judgeAssets.accessCode} tone="#2563eb" />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <Field label={competitionMode === 'tournament' ? 'Scorer access link' : 'Judge access link'}>
                        <div style={copyFieldStyle}>
                          <span style={{ overflowWrap: 'anywhere', color: '#0f172a' }}>{`${window.location.origin}${judgeAssets.accessLink}`}</span>
                        </div>
                      </Field>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button onClick={() => handleCopy(judgeAssets.accessCode, 'Access code')} style={secondaryButtonStyle}>
                        <i className="bi bi-copy" />
                        <span>Copy code</span>
                      </button>
                      <button onClick={() => handleCopy(`${window.location.origin}${judgeAssets.accessLink}`, 'Access link')} style={secondaryButtonStyle}>
                        <i className="bi bi-link-45deg" />
                        <span>Copy link</span>
                      </button>
                    </div>
                  </div>

                  <div style={sectionCardStyle}>
                    <div style={eyebrowStyle}>{competitionMode === 'tournament' ? 'Scorer experience' : 'Judge experience'}</div>
                    <h2 style={panelTitleStyle}>Expected Mobile Flow</h2>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {(competitionMode === 'tournament' ? [
                        'Assigned teacher/official opens the link or scans the QR code.',
                        'Bracket matches appear — scorer selects the match and enters the game result.',
                        'Results save in real time and update the bracket automatically.',
                        'Organizer can monitor all match results and advance the bracket.',
                      ] : [
                        'Judge opens the secure session link or scans the QR code.',
                        'Assigned criteria appear in a mobile-friendly scoring layout.',
                        'Scores save into the central scoring store and can sync to Supabase.',
                        'The organizer can monitor live submissions and lock results at finalization.',
                      ]).map((item) => (
                        <div key={item} style={{ display: 'flex', gap: 12, color: '#475569' }}>
                          <i className="bi bi-check2-circle" style={{ color: '#2563eb' }} />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div style={{ display: 'grid', gap: 20 }}>
                <div style={sectionCardStyle}>
                  <div style={eyebrowStyle}>Publication review</div>
                  <h2 style={panelTitleStyle}>Event Summary</h2>
                  <div style={summaryStatGridStyle}>
                    <StatTile label="Event title" value={form.title || 'Not set'} />
                    <StatTile label="Event type" value={selectedEventType?.label || form.eventType} />
                    <StatTile label="Competition mode" value={competitionMode === 'tournament' ? 'Bracket / Tournament' : 'Score-based / Performance'} tone={competitionMode === 'tournament' ? '#0ea5e9' : '#8b5cf6'} />
                    {competitionMode === 'tournament' && <StatTile label="Bracket type" value={BRACKET_TYPES.find((b) => b.value === form.bracketType)?.label || form.bracketType} />}
                    {competitionMode === 'performance' && (
                      <StatTile
                        label="Scoring system"
                        value={PERFORMANCE_SCORING_MODES.find((modeOption) => modeOption.value === form.performanceScoringMode)?.label || 'Points leaderboard'}
                      />
                    )}
                    {competitionMode === 'performance' && (
                      <StatTile
                        label="Audience Impact"
                        value={form.audienceImpact ? `Enabled (${Number(form.audienceImpactWeight || 10)}%)` : 'Disabled'}
                        tone={form.audienceImpact ? '#059669' : '#64748b'}
                      />
                    )}
                    {competitionMode === 'performance' && form.performanceScoringMode === 'head-to-head-bracket' && <StatTile label="Bracket type" value={BRACKET_TYPES.find((b) => b.value === form.bracketType)?.label || form.bracketType} />}
                    {competitionMode === 'performance' && form.performanceScoringMode === 'multi-round' && <StatTile label="Rounds" value={form.rounds.map((r) => r.name).join(' -> ')} />}
                    <StatTile label="Max participants" value={form.maxParticipants || '—'} />
                    <StatTile label="Venue" value={form.location || 'Not set'} />
                    <StatTile label="Schedule" value={form.startDate && form.endDate ? `${getDisplayDateTime(form.startDate, form.startTime)} to ${getDisplayDateTime(form.endDate, form.endTime)}` : 'Not set'} />
                  </div>
                </div>

                <div style={sectionCardStyle}>
                  <div style={eyebrowStyle}>Configured modules</div>
                  <h2 style={panelTitleStyle}>Automation Overview</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    <ReviewBlock title="Sub-events" body={form.subEvents.filter((subEvent) => subEvent.name.trim()).map(normalizeSubEventForSave).map((subEvent) => `${subEvent.name} (${subEvent.category}, ${subEvent.format}, ${subEvent.tournamentFormat}, max ${subEvent.maxParticipants}${subEvent.venue ? `, @ ${subEvent.venue}` : ''})`).join('\n') || 'No sub-events listed'} />
                    <ReviewBlock title="Criteria profile" body={criteriaDraft.profile} />
                    <ReviewBlock title="Tie-breaker" body={criteriaDraft.tieBreaker[0] || 'Highest weighted total score'} />
                    <ReviewBlock title="Judge access" body={`${judgeAssets.sessionId} / ${judgeAssets.accessCode}`} />
                  </div>
                </div>

                <div style={sectionCardStyle}>
                  <div style={eyebrowStyle}>Criteria list</div>
                  <h2 style={panelTitleStyle}>Final Rubric</h2>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {criteriaDraft.criteria.map((criterion) => (
                      <div key={criterion.id} style={{ ...nestedPanelStyle, display: 'flex', justifyContent: 'space-between', gap: 12, padding: '14px 16px' }}>
                        <div>
                          <div style={{ color: '#0f172a', fontWeight: 700 }}>{criterion.name}</div>
                          <div style={{ color: '#64748b', fontSize: 13 }}>{criterion.description}</div>
                        </div>
                        <div style={{ color: '#2563eb', fontWeight: 800 }}>{criterion.weight}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <button onClick={previousStep} disabled={step === 1 || isGenerating} style={secondaryButtonStyle}>
            <i className="bi bi-arrow-left" />
            <span>Previous</span>
          </button>
          {step < 5 ? (
            <button onClick={nextStep} style={primaryButtonStyle} disabled={isGenerating}>
              <span>Next</span>
              <i className={isGenerating ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-arrow-right'} />
            </button>
          ) : (
            <button onClick={handleSubmit} style={primaryButtonStyle} disabled={loading}>
              <i className={loading ? 'bi bi-arrow-repeat spin' : 'bi bi-send-check'} />
              <span>{loading ? 'Publishing event...' : 'Publish Event'}</span>
            </button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, action, children }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function ToggleCard({ label, name, value, onChange, description }) {
  return (
    <label style={{ display: 'block', padding: 18, borderRadius: 16, background: value ? 'rgba(37,99,235,0.08)' : '#f8fafc', border: value ? '1px solid rgba(37,99,235,0.22)' : '1px solid #e2e8f0', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <div style={{ color: '#0f172a', fontWeight: 700, marginBottom: 6 }}>{label}</div>
          <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>{description}</div>
        </div>
        <input type="checkbox" name={name} checked={value} onChange={onChange} style={{ width: 18, height: 18, accentColor: '#2563eb' }} />
      </div>
    </label>
  );
}

function StatTile({ label, value, tone = '#2563eb' }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: tone, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function ReviewBlock({ title, body }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>
      <div style={{ color: '#0f172a', fontWeight: 700 }}>{body}</div>
    </div>
  );
}

const eyebrowStyle = {
  color: '#2563eb',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 8,
  fontWeight: 700,
};

const panelTitleStyle = {
  color: '#0f172a',
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 18,
};

const gridTwoStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};

const subEventGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
  alignItems: 'end',
};

const summaryStatGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
};

const infoPanelStyle = {
  marginTop: 18,
  padding: '16px 18px',
  borderRadius: 16,
  background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(14,165,233,0.07))',
  border: '1px solid rgba(37,99,235,0.16)',
};

const nestedPanelStyle = {
  padding: 18,
  borderRadius: 16,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const inputStyle = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  padding: '13px 14px',
  fontSize: 14,
  outline: 'none',
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  borderRadius: 14,
  border: 'none',
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  fontWeight: 800,
  padding: '13px 20px',
  cursor: 'pointer',
  minHeight: 48,
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  borderRadius: 14,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 700,
  padding: '12px 18px',
  cursor: 'pointer',
  minHeight: 46,
};

const uploadImageButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 800,
  fontSize: 13,
  padding: '10px 14px',
  cursor: 'pointer',
};

const clearImageButtonStyle = {
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#dc2626',
  borderRadius: 12,
  fontWeight: 800,
  fontSize: 13,
  padding: '10px 14px',
  cursor: 'pointer',
};

const helperTextStyle = {
  color: '#64748b',
  fontSize: 12,
  lineHeight: 1.5,
};

const descriptionActionPanelStyle = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: '1px solid rgba(37,99,235,0.18)',
  background: 'linear-gradient(135deg, rgba(239,246,255,0.98), rgba(255,255,255,0.98))',
  boxShadow: '0 14px 34px rgba(37,99,235,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
};

const descriptionActionButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  borderRadius: 14,
  border: 'none',
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 800,
  padding: '12px 16px',
  minHeight: 44,
  boxShadow: '0 12px 28px rgba(37,99,235,0.22)',
};

const iconButtonStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
};

const copyFieldStyle = {
  borderRadius: 14,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  padding: '14px',
  minHeight: 52,
  display: 'flex',
  alignItems: 'center',
};

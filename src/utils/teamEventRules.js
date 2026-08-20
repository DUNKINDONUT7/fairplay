export const TEAM_EVENT_CATEGORIES = [
  'Basketball',
  'Volleyball',
  'Esports',
  'Football / Soccer',
  'Futsal',
  'Baseball',
  'Softball',
  'Sepak Takraw',
  'Badminton Doubles',
  'Tennis Doubles',
  'Table Tennis Doubles',
  'Chess Team Event',
  'Dance Competition',
  'Cheer Dance',
  'Relay Race',
  'Other Team Sports',
];

export const ESPORTS_GAMES = [
  'Mobile Legends',
  'Valorant',
  'Dota',
  'Call of Duty Mobile',
  'League of Legends',
  'Other',
];

const SPORT_LIMITS = {
  basketball: { label: 'Basketball', min: 5, max: 12, positions: ['Guard', 'Forward', 'Center'] },
  volleyball: { label: 'Volleyball', min: 6, max: 12, positions: ['Setter', 'Spiker', 'Libero', 'Middle Blocker'] },
  'football / soccer': { label: 'Football / Soccer', min: 11, max: 18, positions: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'] },
  football: { label: 'Football / Soccer', min: 11, max: 18, positions: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'] },
  soccer: { label: 'Football / Soccer', min: 11, max: 18, positions: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'] },
  futsal: { label: 'Futsal', min: 5, max: 10, positions: ['Goalkeeper', 'Defender', 'Winger', 'Pivot'] },
  baseball: { label: 'Baseball', min: 9, max: 15, positions: ['Pitcher', 'Catcher', 'Infielder', 'Outfielder'] },
  softball: { label: 'Softball', min: 9, max: 15, positions: ['Pitcher', 'Catcher', 'Infielder', 'Outfielder'] },
  'sepak takraw': { label: 'Sepak Takraw', min: 3, max: 5, positions: ['Tekong', 'Feeder', 'Killer', 'Substitute'] },
  'badminton doubles': { label: 'Badminton Doubles', min: 2, max: 2, positions: ['Player', 'Partner'] },
  'tennis doubles': { label: 'Tennis Doubles', min: 2, max: 2, positions: ['Player', 'Partner'] },
  'table tennis doubles': { label: 'Table Tennis Doubles', min: 2, max: 2, positions: ['Player', 'Partner'] },
  'chess team event': { label: 'Chess Team Event', min: 4, max: 6, positions: ['Board 1', 'Board 2', 'Board 3', 'Reserve'] },
  'dance competition': { label: 'Dance Competition', min: 5, max: 20, positions: ['Leader', 'Dancer', 'Reserve'] },
  'cheer dance': { label: 'Cheer Dance', min: 8, max: 25, positions: ['Captain', 'Base', 'Flyer', 'Spotter'] },
  'relay race': { label: 'Relay Race', min: 4, max: 6, positions: ['Runner', 'Reserve'] },
};

const ESPORTS_LIMITS = {
  'mobile legends': { label: 'Mobile Legends', min: 5, max: 6 },
  valorant: { label: 'Valorant', min: 5, max: 6 },
  dota: { label: 'Dota', min: 5, max: 6 },
  'call of duty mobile': { label: 'Call of Duty Mobile', min: 5, max: 6 },
  'league of legends': { label: 'League of Legends', min: 5, max: 6 },
};

const ESPORTS_POSITIONS = ['Captain', 'Player', 'Substitute'];
const DEFAULT_OTHER_LIMITS = { label: 'Other Team Sports', min: 1, max: 99, positions: ['Captain', 'Player', 'Substitute'] };

function normalizeKey(value = '') {
  return String(value).trim().toLowerCase();
}

export function getTeamLimitPreset({ sportType = '', esportGame = '', customSportName = '', minParticipants, maxParticipants } = {}) {
  const sportKey = normalizeKey(sportType);
  const gameKey = normalizeKey(esportGame);

  if (sportKey === 'esports') {
    const esportPreset = ESPORTS_LIMITS[gameKey];
    return {
      label: gameKey === 'other'
        ? customSportName || 'Other Esports'
        : esportPreset?.label || esportGame || 'Esports',
      min: Number(minParticipants || esportPreset?.min || 1),
      max: Number(maxParticipants || esportPreset?.max || 99),
      positions: ESPORTS_POSITIONS,
      isExact: Number(minParticipants || esportPreset?.min) === Number(maxParticipants || esportPreset?.max),
    };
  }

  const preset = SPORT_LIMITS[sportKey] || DEFAULT_OTHER_LIMITS;
  return {
    label: sportKey === 'other team sports' ? customSportName || preset.label : preset.label,
    min: Number(minParticipants || preset.min),
    max: Number(maxParticipants || preset.max),
    positions: preset.positions,
    isExact: Number(minParticipants || preset.min) === Number(maxParticipants || preset.max),
  };
}

export function inferTeamLimitConfig(event = {}, subEvent = null) {
  const source = subEvent || event;
  const metadata = source.metadata || event.metadata || {};
  const sportType =
    source.sportType ||
    source.sport_type ||
    metadata.sportType ||
    source.category ||
    event.sportType ||
    event.sport_type ||
    event.event_category ||
    event.eventType ||
    '';
  const esportGame = source.esportGame || source.esport_game || metadata.esportGame || event.esportGame || event.esport_game || '';
  const customSportName = source.customSportName || source.custom_sport_name || metadata.customSportName || event.customSportName || '';
  const minParticipants = source.minParticipants || source.min_participants || source.minTeamMembers || metadata.minParticipants || event.minParticipants;
  const maxParticipants = source.maxTeamMembers || source.maxParticipants || source.max_participants || metadata.maxParticipants || event.maxTeamMembers;

  return {
    ...getTeamLimitPreset({ sportType, esportGame, customSportName, minParticipants, maxParticipants }),
    sportType,
    esportGame,
    customSportName,
    coachRequired: Boolean(source.coachRequired ?? source.coach_required ?? metadata.coachRequired ?? event.coachRequired),
    substitutesAllowed: source.substitutesAllowed ?? source.substitutes_allowed ?? metadata.substitutesAllowed ?? event.substitutesAllowed ?? true,
  };
}

export function getParticipantLimitMessage(config) {
  if (!config) return 'Please follow the participant limit set by the organizer.';
  if (config.isExact) return `${config.label} requires exactly ${config.min} players.`;
  return `${config.label} requires at least ${config.min} players and allows a maximum of ${config.max} players.`;
}

export function validateTeamMemberCount(count, config) {
  if (!config) return '';
  if (count < config.min) return getParticipantLimitMessage(config);
  if (count > config.max) return getParticipantLimitMessage(config);
  return '';
}

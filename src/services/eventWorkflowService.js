const SPORTS_FEST_PRESETS = {
  sportsfest: [
    { key: 'basketball-indoor', title: 'Basketball Indoor', type: 'sports', category: 'basketball', bracketType: 'single' },
    { key: 'basketball-outdoor', title: 'Basketball Outdoor', type: 'sports', category: 'basketball', bracketType: 'single' },
    { key: 'volleyball', title: 'Volleyball', type: 'sports', category: 'volleyball', bracketType: 'single' },
    { key: 'badminton', title: 'Badminton', type: 'sports', category: 'badminton', bracketType: 'single' },
    { key: 'table-tennis', title: 'Table Tennis', type: 'sports', category: 'table-tennis', bracketType: 'round-robin' },
    { key: 'chess', title: 'Chess', type: 'academic', category: 'chess', bracketType: 'round-robin' },
    { key: 'larong-lahi', title: 'Larong Lahi', type: 'sports', category: 'larong-lahi', bracketType: 'round-robin' },
  ],
  cultural: [
    { key: 'pageant', title: 'Pageant', type: 'pageant', category: 'pageant' },
    { key: 'singing', title: 'Singing Contest', type: 'arts', category: 'singing' },
    { key: 'hip-hop', title: 'Hip-Hop Dance', type: 'arts', category: 'hiphop' },
    { key: 'cheer-dance', title: 'Cheer Dance', type: 'arts', category: 'dance' },
  ],
};

export function createDefaultApprovalWorkflow() {
  return [
    { level: 1, role: 'institute-coordinator', label: 'Institute Coordinator', status: 'pending' },
    { level: 2, role: 'sports-head', label: 'Head of Sporting Events', status: 'pending' },
    { level: 3, role: 'osds', label: 'OSDS Final Approval', status: 'pending' },
  ];
}

export function applyApprovalDecision(workflow = [], role, decision, actor = {}, notes = '') {
  const approvedAt = new Date().toISOString();
  return workflow.map((step) => {
    if (step.role !== role) return step;
    return {
      ...step,
      status: decision,
      actedBy: actor.id || actor.name || role,
      actedByName: actor.name || role,
      notes,
      actedAt: approvedAt,
    };
  });
}

export function isApprovalChainComplete(workflow = []) {
  return workflow.length > 0 && workflow.every((step) => step.status === 'approved');
}

export function createExternalJudgeInvite({
  eventId,
  subEventId,
  judgeName,
  judgeEmail,
  specialty = '',
}) {
  const tokenSeed = `${eventId}-${subEventId || 'general'}-${judgeEmail}-${Date.now()}`;
  const token = btoa(tokenSeed).replace(/=/g, '');

  return {
    id: `invite-${Date.now()}`,
    eventId,
    subEventId: subEventId || null,
    judgeName,
    judgeEmail,
    specialty,
    token,
    status: 'issued',
    issuedAt: new Date().toISOString(),
    accessLink: `/judge/score/${token}`,
  };
}

export function normalizeSubEvents(parentEvent) {
  const provided = Array.isArray(parentEvent.subEvents) ? parentEvent.subEvents : [];

  if (provided.length > 0) {
    return provided.map((subEvent, index) => {
      const name = subEvent.name || subEvent.title || `Sub-event ${index + 1}`;
      const bracketType = subEvent.bracketType || subEvent.tournamentFormat || parentEvent.tournamentFormat || 'single';

      return {
        ...subEvent,
        id: subEvent.id || `${parentEvent.id}-sub-${index + 1}`,
        name,
        title: subEvent.title || name,
        type: subEvent.type || parentEvent.type || 'contest',
        category: subEvent.category || subEvent.type || 'general',
        format: subEvent.format || 'individual',
        bracketType,
        tournamentFormat: subEvent.tournamentFormat || bracketType,
        maxParticipants: subEvent.maxParticipants || subEvent.max_participants || '',
        minParticipants: subEvent.minParticipants || subEvent.min_participants || '',
        maxTeamMembers: subEvent.maxTeamMembers || subEvent.max_team_members || '',
        sportType: subEvent.sportType || subEvent.sport_type || subEvent.category || '',
        esportGame: subEvent.esportGame || subEvent.esport_game || '',
        customSportName: subEvent.customSportName || subEvent.custom_sport_name || '',
        coachRequired: Boolean(subEvent.coachRequired ?? subEvent.coach_required),
        substitutesAllowed: subEvent.substitutesAllowed ?? subEvent.substitutes_allowed ?? true,
        venue: subEvent.venue || '',
        criteriaMode: subEvent.criteriaMode || 'ai-assisted',
        participants: Number(subEvent.participants || 0),
        status: subEvent.status || 'draft',
        schedule: subEvent.schedule || null,
      };
    });
  }

  const presetKey = String(parentEvent.eventType || parentEvent.type || '').toLowerCase();
  const presets = SPORTS_FEST_PRESETS[presetKey] || [];

  return presets.map((subEvent, index) => ({
    id: `${parentEvent.id}-sub-${index + 1}`,
    name: subEvent.title,
    title: subEvent.title,
    type: subEvent.type,
    category: subEvent.category,
    format: 'team',
    bracketType: subEvent.bracketType || 'single',
    tournamentFormat: subEvent.bracketType || 'single',
    maxParticipants: '',
    minParticipants: '',
    maxTeamMembers: '',
    sportType: subEvent.title,
    esportGame: '',
    customSportName: '',
    coachRequired: false,
    substitutesAllowed: true,
    venue: '',
    criteriaMode: 'ai-assisted',
    participants: 0,
    status: 'draft',
    schedule: null,
  }));
}

export function validateRegistrationConflict({ registrations = [], nextRegistration }) {
  if (!nextRegistration?.eventId) {
    return null;
  }

  const existingSameEvent = registrations.find((registration) => {
    const sameEvent = String(registration.eventId) === String(nextRegistration.eventId);
    const samePerson =
      registration.registrationType === 'individual' &&
      nextRegistration.registrationType === 'individual' &&
      registration.individualDetails?.name?.trim().toLowerCase() ===
        nextRegistration.individualDetails?.name?.trim().toLowerCase();
    const teamContainsPerson =
      registration.registrationType === 'team' &&
      nextRegistration.registrationType === 'individual' &&
      (registration.roster || []).some(
        (player) =>
          player.name?.trim().toLowerCase() === nextRegistration.individualDetails?.name?.trim().toLowerCase()
      );
    const individualInsideTeam =
      registration.registrationType === 'individual' &&
      nextRegistration.registrationType === 'team' &&
      (nextRegistration.roster || []).some(
        (player) =>
          player.name?.trim().toLowerCase() === registration.individualDetails?.name?.trim().toLowerCase()
      );
    const sameTeamName =
      registration.registrationType === 'team' &&
      nextRegistration.registrationType === 'team' &&
      registration.teamName?.trim().toLowerCase() === nextRegistration.teamName?.trim().toLowerCase();

    return sameEvent && (samePerson || teamContainsPerson || individualInsideTeam || sameTeamName);
  });

  if (existingSameEvent) {
    return 'Duplicate or conflicting registration detected for the same event.';
  }

  return null;
}

export function summarizeAudienceImpact(criteria = []) {
  return criteria.find((criterion) =>
    String(criterion.name || '').toLowerCase().includes('audience impact') ||
    String(criterion.name || '').toLowerCase().includes('audience engagement')
  ) || null;
}

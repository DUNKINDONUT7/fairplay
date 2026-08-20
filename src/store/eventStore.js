import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import { mockEvents } from '../data/events';
import { getBusinessActorId, matchesActorIdentity } from '../utils/identity';
import useNotificationStore from './notificationStore';
import {
  applyApprovalDecision,
  createDefaultApprovalWorkflow,
  createExternalJudgeInvite,
  isApprovalChainComplete,
  normalizeSubEvents,
} from '../services/eventWorkflowService';

function normalizeContestants(event) {
  if (!Array.isArray(event.contestants)) return [];
  return event.contestants
    .filter((c) => c.name && !String(c.id).match(/^.+-contestant-\d+$/))
    .map((contestant, index) => ({
      id: contestant.id || `${event.id}-c-${index + 1}`,
      name: contestant.name,
      type: contestant.type || 'participant',
      email: contestant.email || '',
      phone: contestant.phone || '',
      captain: contestant.captain || '',
      subEventId: contestant.subEventId || contestant.sub_event_id || '',
      subEventName: contestant.subEventName || contestant.sub_event_name || '',
    }));
}

function normalizeCriteria(criteria = []) {
  if (!Array.isArray(criteria)) return [];

  return criteria.map((criterion, index) => {
    if (typeof criterion === 'string') {
      return {
        id: `criterion-${index + 1}`,
        name: criterion,
        weight: Math.round(100 / Math.max(criteria.length, 1)),
        description: `${criterion} evaluation`,
        scoringRange: '1-10',
        judgeInstructions: 'Score based on observed performance.',
      };
    }

    return {
      id: criterion.id || `criterion-${index + 1}`,
      name: criterion.name || `Criterion ${index + 1}`,
      weight: Number(criterion.weight || 0),
      description: criterion.description || '',
      scoringRange: criterion.scoringRange || '1-10',
      judgeInstructions: criterion.judgeInstructions || 'Score based on observed performance.',
    };
  });
}

function buildEventMetadata(event) {
  return {
    ...(event.metadata || {}),
    organizerAuthProfileId: event.organizerAuthProfileId || event.metadata?.organizerAuthProfileId || '',
    organizerEmail: event.organizerEmail || event.metadata?.organizerEmail || '',
    description: event.description,
    format: event.format,
    scoringType: event.scoringType,
    registrationDeadline: event.registrationDeadline,
    startTime: event.startTime,
    endTime: event.endTime,
    enableQR: event.enableQR,
    audienceImpact: event.audienceImpact,
    audienceImpactEnabled: event.audienceImpactEnabled ?? event.audienceImpact,
    audienceImpactWeight: event.audienceImpactWeight,
    audienceVotingOpen: event.audienceVotingOpen,
    audienceQrToken: event.audienceQrToken,
    judgeProfile: event.judgeProfile,
    scoringMethod: event.scoringMethod,
    tieBreaker: event.tieBreaker,
    judgeInstructions: event.judgeInstructions,
    judgeSessions: event.judgeSessions,
    image: event.image || event.imageUrl,
    imageUrl: event.imageUrl || event.image,
    coverImage: event.coverImage,
    bannerUrl: event.bannerUrl,
    subEvents: event.subEvents,
    sportType: event.sportType,
    esportGame: event.esportGame,
    customSportName: event.customSportName,
    minParticipants: event.minParticipants,
    maxTeamMembers: event.maxTeamMembers,
    coachRequired: event.coachRequired,
    substitutesAllowed: event.substitutesAllowed,
    competitionMode: event.competitionMode,
    bracketType: event.bracketType,
    performanceScoringMode: event.performanceScoringMode,
    pointScale: event.pointScale,
    championRule: event.championRule,
    rounds: event.rounds,
    scorerAssignments: event.scorerAssignments,
    scoringActive: event.scoringActive,
  };
}

function normalizeEvent(event, index = 0) {
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const source = { ...metadata, ...event };
  const normalizedId = Number(source.id) || Date.now() + index;
  const title = source.title || source.name || `Event ${index + 1}`;
  const type = source.eventType || source.type || 'contest';
  const organizerId = getBusinessActorId(
    source.organizer_id ||
    source.organizerId ||
    source.organizer?.id ||
    metadata.organizerAuthProfileId ||
    metadata.organizerEmail
  );
  const normalizedCriteria = normalizeCriteria(source.criteria);

  return {
    ...source,
    id: normalizedId,
    title,
    name: title,
    type,
    eventType: type,
    organizer_id: organizerId,
    organizerAuthProfileId: source.organizerAuthProfileId || metadata.organizerAuthProfileId || '',
    organizerEmail: source.organizerEmail || metadata.organizerEmail || '',
    participants: Number(source.participants || 0),
    maxParticipants: Number(source.maxParticipants || source.max_participants || 0) || null,
    description: source.description || '',
    criteria: normalizedCriteria,
    contestants: normalizeContestants({ ...source, id: normalizedId }),
    judges: Array.isArray(source.judges) ? source.judges : [],
    image: source.image || source.imageUrl || source.coverImage || source.bannerUrl || '',
    imageUrl: source.imageUrl || source.image || source.coverImage || source.bannerUrl || '',
    coverImage: source.coverImage || source.imageUrl || source.image || '',
    bannerUrl: source.bannerUrl || source.imageUrl || source.image || '',
    subEvents: normalizeSubEvents({
      ...source,
      subEvents: source.subEvents || source.sub_events,
      id: normalizedId,
      type,
    }),
    sportType: source.sportType || source.sport_type || source.event_category || metadata.sportType || '',
    esportGame: source.esportGame || source.esport_game || metadata.esportGame || '',
    customSportName: source.customSportName || source.custom_sport_name || metadata.customSportName || '',
    minParticipants: Number(source.minParticipants || source.min_participants || metadata.minParticipants || 0),
    maxTeamMembers: Number(source.maxTeamMembers || source.max_team_members || metadata.maxTeamMembers || 0),
    coachRequired: Boolean(source.coachRequired ?? source.coach_required ?? metadata.coachRequired),
    substitutesAllowed: source.substitutesAllowed ?? source.substitutes_allowed ?? metadata.substitutesAllowed ?? true,
    approvalWorkflow: Array.isArray(source.approvalWorkflow) && source.approvalWorkflow.length > 0
      ? source.approvalWorkflow
      : Array.isArray(source.approval_workflow) && source.approval_workflow.length > 0
        ? source.approval_workflow
      : createDefaultApprovalWorkflow(),
    audienceAttendance: Number(source.audienceAttendance || source.audience_attendance || 0),
    attendanceTracking: Boolean(source.attendanceTracking ?? source.attendance_tracking),
    tournamentFormat: source.tournamentFormat || source.tournament_format || source.bracketType || 'single',
    scorerAssignments: Array.isArray(source.scorerAssignments)
      ? source.scorerAssignments
      : Array.isArray(source.scorer_assignments)
        ? source.scorer_assignments
      : [],
    externalJudgeInvites: Array.isArray(source.externalJudgeInvites)
      ? source.externalJudgeInvites
      : Array.isArray(source.external_judge_invites)
        ? source.external_judge_invites
        : [],
    startDate: source.startDate || source.start_date || null,
    endDate: source.endDate || source.end_date || null,
    startTime: source.startTime || source.start_time || metadata.startTime || '',
    endTime: source.endTime || source.end_time || metadata.endTime || '',
    scheduledDate: source.scheduledDate || source.scheduled_date || null,
    registrationDeadline: source.registrationDeadline || null,
    location: source.location || '',
    format: source.format || 'in-person',
    scoringType: source.scoringType || 'weighted',
    enableQR: Boolean(source.enableQR ?? true),
    enableCertificates: Boolean(source.enableCertificates ?? source.enable_certificates),
    audienceImpact: Boolean(source.audienceImpact ?? false),
    audienceImpactEnabled: Boolean(source.audienceImpactEnabled ?? source.audience_impact_enabled ?? metadata.audienceImpactEnabled ?? metadata.audienceImpact ?? source.audienceImpact ?? false),
    audienceImpactWeight: Number(source.audienceImpactWeight || source.audience_impact_weight || metadata.audienceImpactWeight || 10),
    audienceVotingOpen: Boolean(source.audienceVotingOpen ?? source.audience_voting_open ?? metadata.audienceVotingOpen ?? false),
    audienceQrToken: source.audienceQrToken || source.audience_qr_token || metadata.audienceQrToken || `audience-${normalizedId}`,
    judgeProfile: source.judgeProfile || '',
    scoringMethod: source.scoringMethod || '',
    tieBreaker: Array.isArray(source.tieBreaker) ? source.tieBreaker : [],
    judgeInstructions: source.judgeInstructions || '',
    judgeSessions: Array.isArray(source.judgeSessions) ? source.judgeSessions : [],
    scoringActive: source.scoringActive ?? source.scoring_active ?? null,
    competitionMode: source.competitionMode || null,
    bracketType: source.bracketType || source.tournamentFormat || 'single',
    performanceScoringMode: source.performanceScoringMode || source.performance_scoring_mode || null,
    pointScale: source.pointScale || source.point_scale || null,
    championRule: source.championRule || source.champion_rule || null,
    rounds: Array.isArray(source.rounds) ? source.rounds : null,
    createdAt: source.createdAt || source.created_at || new Date().toISOString(),
    status: source.status || 'draft',
    metadata,
  };
}

function getMissingColumnName(error) {
  const message = error?.message || '';
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /column "([^"]+)" does not exist/i,
    /'([^']+)' column/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function saveEventPayload(payload, { select = false, mode = 'upsert' } = {}) {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query = mode === 'insert'
      ? supabase.from('events').insert([currentPayload])
      : supabase.from('events').upsert([currentPayload]);
    const { data, error } = select ? await query.select() : await query;

    if (!error) return { data, error: null };

    const missingColumn = getMissingColumnName(error);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      return { data: null, error };
    }

    const { [missingColumn]: _removed, ...nextPayload } = currentPayload;
    currentPayload = nextPayload;
  }

  return {
    data: null,
    error: new Error('Unable to save event after checking database columns.'),
  };
}

const initialEvents = isSupabaseConfigured
  ? []
  : mockEvents.map((event, index) => normalizeEvent(event, index));

const useEventStore = create(
  persist(
    (set, get) => ({
      events: initialEvents,
      loading: false,
      error: null,

      fetchEvents: async (organizerId) => {
        set({ loading: true, error: null });
        const organizerBusinessId = getBusinessActorId(organizerId);

        if (!isSupabaseConfigured) {
          const localEvents = get().events;
          const filtered = organizerId
            ? localEvents.filter((event) =>
              String(event.organizer_id) === String(organizerBusinessId) ||
              matchesActorIdentity(event.organizerAuthProfileId, organizerId) ||
              matchesActorIdentity(event.organizerEmail, organizerId)
            )
            : localEvents;

          set({ loading: false, error: null });
          return filtered;
        }

        try {
          let query = supabase.from('events').select('*').order('created_at', { ascending: false });
          if (organizerBusinessId !== null) {
            query = query.eq('organizer_id', organizerBusinessId);
          }

          const { data, error } = await query;
          if (error) throw error;

          const normalized = (data || []).map((event, index) => normalizeEvent(event, index));
          const resolvedEvents = normalized;
          set({
            events: resolvedEvents,
            loading: false,
            error: null,
          });

          return organizerId
            ? resolvedEvents.filter((event) =>
              String(event.organizer_id) === String(organizerBusinessId) ||
              matchesActorIdentity(event.organizerAuthProfileId, organizerId) ||
              matchesActorIdentity(event.organizerEmail, organizerId)
            )
            : resolvedEvents;
        } catch (error) {
          console.error('Error fetching events:', error.message);
          set({ loading: false, error: error.message, events: [] });
          return [];
        }
      },

      createEvent: async (eventData) => {
        set({ loading: true, error: null });

        const normalizedEvent = normalizeEvent(
          {
            ...eventData,
            id: eventData.id || Date.now(),
            created_at: eventData.createdAt || new Date().toISOString(),
          },
          0
        );

        if (!isSupabaseConfigured) {
          set((state) => ({
            events: [normalizedEvent, ...state.events],
            loading: false,
            error: null,
          }));
          await useNotificationStore.getState().notifyEventCreated(normalizedEvent);
          return normalizedEvent;
        }

        try {
          const metadata = buildEventMetadata(normalizedEvent);
          const payload = {
            id: normalizedEvent.id,
            title: normalizedEvent.title,
            type: normalizedEvent.type,
            organizer_id: normalizedEvent.organizer_id,
            participants: normalizedEvent.participants,
            max_participants: normalizedEvent.maxParticipants,
            description: normalizedEvent.description,
            criteria: normalizedEvent.criteria,
            contestants: normalizedEvent.contestants,
            judges: normalizedEvent.judges,
            sub_events: normalizedEvent.subEvents,
            approval_workflow: normalizedEvent.approvalWorkflow,
            external_judge_invites: normalizedEvent.externalJudgeInvites,
            audience_attendance: normalizedEvent.audienceAttendance,
            attendance_tracking: normalizedEvent.attendanceTracking,
            tournament_format: normalizedEvent.tournamentFormat,
            status: normalizedEvent.status,
            start_date: normalizedEvent.startDate,
            end_date: normalizedEvent.endDate,
            scheduled_date: normalizedEvent.scheduledDate,
            location: normalizedEvent.location,
            enable_certificates: normalizedEvent.enableCertificates,
            metadata,
            created_at: normalizedEvent.created_at || normalizedEvent.createdAt,
          };
          const { data, error } = await saveEventPayload(payload, { select: true, mode: 'insert' });
          if (error) throw error;

          const createdEvent = normalizeEvent(data?.[0] || normalizedEvent, 0);
          set((state) => ({
            events: [createdEvent, ...state.events.filter((event) => event.id !== createdEvent.id)],
            loading: false,
            error: null,
          }));
          await useNotificationStore.getState().notifyEventCreated(createdEvent);
          return createdEvent;
        } catch (error) {
          console.error('Error creating event:', error.message);
          set({
            loading: false,
            error: error.message,
          });
          return null;
        }
      },

      updateEvent: async (eventId, updates) => {
        const current = get().getEventById(eventId);
        if (!current) return null;

        const updatedEvent = normalizeEvent({ ...current, ...updates, id: eventId }, 0);

        set((state) => ({
          events: state.events.map((event) => (String(event.id) === String(eventId) ? updatedEvent : event)),
        }));

        if (isSupabaseConfigured) {
          try {
          const metadata = buildEventMetadata(updatedEvent);
          const { error } = await saveEventPayload({
              id: updatedEvent.id,
              title: updatedEvent.title,
              type: updatedEvent.type,
              organizer_id: updatedEvent.organizer_id,
              participants: updatedEvent.participants,
              max_participants: updatedEvent.maxParticipants,
              description: updatedEvent.description,
              criteria: updatedEvent.criteria,
              contestants: updatedEvent.contestants,
              judges: updatedEvent.judges,
              sub_events: updatedEvent.subEvents,
              approval_workflow: updatedEvent.approvalWorkflow,
              external_judge_invites: updatedEvent.externalJudgeInvites,
              audience_attendance: updatedEvent.audienceAttendance,
              attendance_tracking: updatedEvent.attendanceTracking,
              tournament_format: updatedEvent.tournamentFormat,
              status: updatedEvent.status,
              created_at: updatedEvent.created_at || updatedEvent.createdAt,
              start_date: updatedEvent.startDate,
              end_date: updatedEvent.endDate,
              scheduled_date: updatedEvent.scheduledDate,
              location: updatedEvent.location,
              enable_certificates: updatedEvent.enableCertificates,
              metadata,
            });
            if (error) throw error;
          } catch (error) {
            console.error('Error updating event:', error.message);
            set({ error: error.message });
          }
        }

        return updatedEvent;
      },

      deleteEvent: async (eventId) => {
        set((state) => ({
          events: state.events.filter((event) => String(event.id) !== String(eventId)),
        }));

        if (isSupabaseConfigured) {
          try {
            const { error } = await supabase.from('events').delete().eq('id', eventId);
            if (error) throw error;
          } catch (error) {
            console.error('Error deleting event:', error.message);
            set({ error: error.message });
          }
        }
      },

      submitApprovalAction: async ({ eventId, role, decision, actor, notes = '' }) => {
        const event = get().getEventById(eventId);
        if (!event) return null;

        const approvalWorkflow = applyApprovalDecision(event.approvalWorkflow || [], role, decision, actor, notes);
        const updates = {
          approvalWorkflow,
          status: decision === 'rejected'
            ? 'rejected'
            : isApprovalChainComplete(approvalWorkflow)
              ? 'approved'
              : event.status,
        };

        return get().updateEvent(eventId, updates);
      },

      getPendingApprovals: (role) =>
        get().events.filter((event) =>
          (event.approvalWorkflow || []).some(
            (step) => step.role === role && step.status === 'pending'
          )
        ),

      issueExternalJudgeInvite: async ({ eventId, subEventId = null, judgeName, judgeEmail, specialty = '' }) => {
        const event = get().getEventById(eventId);
        if (!event) return null;

        const invite = createExternalJudgeInvite({
          eventId,
          subEventId,
          judgeName,
          judgeEmail,
          specialty,
        });

        const externalJudgeInvites = [invite, ...(event.externalJudgeInvites || [])];
        await get().updateEvent(eventId, { externalJudgeInvites });
        return invite;
      },

      resolveExternalJudgeInvite: async ({ eventId, inviteId, status = 'accepted' }) => {
        const event = get().getEventById(eventId);
        if (!event) return null;

        const externalJudgeInvites = (event.externalJudgeInvites || []).map((invite) =>
          String(invite.id) === String(inviteId)
            ? { ...invite, status, respondedAt: new Date().toISOString() }
            : invite
        );

        return get().updateEvent(eventId, { externalJudgeInvites });
      },

      getEventById: (eventId) =>
        get().events.find((event) => String(event.id) === String(eventId)) || null,
    }),
    {
      name: 'fairplay_events',
      partialize: (state) => ({ events: state.events }),
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            events: currentState.events,
          };
        }

        return {
          ...currentState,
          ...(persistedState || {}),
        };
      },
    }
  )
);

export default useEventStore;

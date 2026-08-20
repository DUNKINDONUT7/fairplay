import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import { validateRegistrationConflict } from '../services/eventWorkflowService';
import useEventStore from './eventStore';
import useTeamStore from './teamStore';
import { inferTeamLimitConfig, validateTeamMemberCount } from '../utils/teamEventRules';

const initialDetails = { name: '', email: '', phone: '', qrToken: '' };
const initialRepresentative = { fullName: '', age: '', schoolYear: '', phone: '', email: '' };
const initialLastSubmitted = null;

function createNumericId() {
  // Wide random range, not just +/-1000 — a school-wide event can have
  // hundreds of registrations landing in the same millisecond, and a
  // narrow range collides far too often under that kind of burst.
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function createRegistrationId() {
  return createNumericId();
}

function createQrToken(prefix = 'qr') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRegistration(registration) {
  const metadata = registration.metadata || {};

  return {
    id: String(registration.id || createRegistrationId()),
    eventId: registration.eventId || registration.event_id || null,
    registrationType: registration.registrationType || registration.registration_type || 'individual',
    teamName: registration.teamName || registration.team_name || '',
    roster: Array.isArray(registration.roster) ? registration.roster : [],
    individualDetails: {
      ...initialDetails,
      ...(registration.individualDetails || registration.individual_details || {}),
      qrToken:
        registration.individualDetails?.qrToken ||
        registration.individual_details?.qrToken ||
        metadata.qrToken ||
        '',
    },
    participantName:
      registration.participantName ||
      registration.participant_name ||
      registration.individualDetails?.name ||
      registration.individual_details?.name ||
      registration.teamName ||
      registration.team_name ||
      '',
    email:
      registration.email ||
      registration.individualDetails?.email ||
      registration.individual_details?.email ||
      '',
    schoolOrganization: registration.schoolOrganization || registration.school_or_organization || metadata.schoolOrganization || '',
    division: registration.division || registration.team_division || metadata.division || '',
    representativeType: registration.representativeType || registration.representative_type || metadata.representativeType || '',
    teamLeader: registration.teamLeader || registration.team_leader || metadata.teamLeader || null,
    coach: registration.coach || metadata.coach || null,
    sportType: registration.sportType || registration.sport_type || metadata.sportType || '',
    esportGame: registration.esportGame || registration.esport_game || metadata.esportGame || '',
    customSportName: registration.customSportName || registration.custom_sport_name || metadata.customSportName || '',
    minParticipants: Number(registration.minParticipants || registration.min_participants || metadata.minParticipants || 0),
    maxParticipants: Number(registration.maxParticipants || registration.max_participants || metadata.maxParticipants || 0),
    category: registration.category || metadata.category || '',
    status: registration.status || 'Pending',
    subEventId: registration.subEventId || metadata.subEventId || metadata.sub_event_id || '',
    subEventName: registration.subEventName || metadata.subEventName || metadata.sub_event_name || '',
    participantId:
      registration.participantId ||
      registration.participant_id ||
      metadata.participantId ||
      metadata.participant_id ||
      '',
    createdAt: registration.createdAt || registration.created_at || new Date().toISOString(),
    metadata,
  };
}

function buildRegistrationPayload(registration) {
  return {
    id: registration.id,
    event_id: registration.eventId,
    participant_name: registration.participantName || registration.teamName || registration.individualDetails?.name || 'Registrant',
    email: registration.email || registration.individualDetails?.email || '',
    category: registration.category || registration.subEventName || '',
    status: registration.status,
    registration_type: registration.registrationType,
    team_name: registration.teamName || null,
    roster: registration.roster,
    individual_details: registration.individualDetails,
    metadata: {
      ...(registration.metadata || {}),
      participantId: registration.participantId || '',
      subEventId: registration.subEventId || '',
      subEventName: registration.subEventName || '',
      qrToken: registration.individualDetails?.qrToken || '',
      schoolOrganization: registration.schoolOrganization || '',
      division: registration.division || '',
      representativeType: registration.representativeType || '',
      teamLeader: registration.teamLeader || null,
      coach: registration.coach || null,
      sportType: registration.sportType || '',
      esportGame: registration.esportGame || '',
      customSportName: registration.customSportName || '',
      minParticipants: registration.minParticipants || '',
      maxParticipants: registration.maxParticipants || '',
    },
    created_at: registration.createdAt,
  };
}

async function persistRegistration(registration) {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase.from('registrations').upsert([buildRegistrationPayload(registration)]);
  if (error) throw error;
}

const useRegistrationStore = create(
  persist(
    (set, get) => ({
      eventId: null,
      registrationType: 'individual',
      teamName: '',
      roster: [],
      schoolOrganization: '',
      division: '',
      representativeType: 'Team Leader',
      teamLeader: initialRepresentative,
      coach: initialRepresentative,
      individualDetails: initialDetails,
      registrations: [],
      status: 'idle',
      error: null,
      lastSubmitted: initialLastSubmitted,

      setEvent: (eventId, type) => set({ eventId, registrationType: type || 'individual' }),
      setTeamName: (name) => set({ teamName: name }),
      setTeamRegistrationDetails: (details) => set((state) => ({ ...state, ...details })),
      addPlayerToRoster: (player) =>
        set((state) => ({
          roster: [...state.roster, { id: crypto.randomUUID(), ...player }],
        })),
      removePlayerFromRoster: (playerId) =>
        set((state) => ({
          roster: state.roster.filter((player) => player.id !== playerId),
        })),
      updatePlayerInRoster: (playerId, updates) =>
        set((state) => ({
          roster: state.roster.map((player) =>
            player.id === playerId ? { ...player, ...updates } : player
          ),
        })),
      setIndividualDetails: (details) =>
        set((state) => ({
          individualDetails: { ...state.individualDetails, ...details },
        })),

      fetchRegistrations: async (eventId) => {
        if (!isSupabaseConfigured) {
          return eventId
            ? get().registrations.filter((registration) => String(registration.eventId) === String(eventId))
            : get().registrations;
        }

        try {
          let query = supabase.from('registrations').select('*').order('created_at', { ascending: false });
          if (eventId) {
            query = query.eq('event_id', eventId);
          }
          const { data, error } = await query;
          if (error) throw error;

          const registrations = (data || []).map(normalizeRegistration);
          set({
            registrations: eventId
              ? [...registrations, ...get().registrations.filter((registration) => String(registration.eventId) !== String(eventId))]
              : registrations,
          });
          return registrations;
        } catch (error) {
          console.error('Error fetching registrations:', error.message);
          set({ error: error.message, registrations: eventId ? get().registrations.filter((registration) => String(registration.eventId) !== String(eventId)) : [] });
          return [];
        }
      },

      submitBatchRegistration: async () => {
        set({ status: 'loading', error: null });

        try {
          const { eventId, teamName, roster } = get();
          if (!eventId || !teamName || roster.length === 0) {
            throw new Error('Team registration requires an event, team name, and roster.');
          }

          const conflict = validateRegistrationConflict({
            registrations: get().registrations,
            nextRegistration: {
              eventId,
              registrationType: 'team',
              roster,
            },
          });
          if (conflict) {
            throw new Error(conflict);
          }

          const team = await useTeamStore.getState().createTeam({
            name: teamName,
            eventId,
            members: roster,
            players: roster,
          });
          if (!team) {
            throw new Error('Unable to create the team in the database.');
          }

          const eventStore = useEventStore.getState();
          const event = eventStore.getEventById(eventId);
          const qrToken = createQrToken('team');
          if (event) {
            const contestants = [...(event.contestants || []), {
              id: team.id,
              name: team.name,
              type: 'team',
              teamName,
              qrToken,
            }];
            await eventStore.updateEvent(eventId, {
              contestants,
              participants: contestants.length,
            });
          }

          const registration = normalizeRegistration({
            eventId,
            registrationType: 'team',
            teamName,
            roster,
            participantId: String(team.id),
            participantName: teamName,
            category: event?.title || '',
            metadata: { qrToken },
          });

          set((state) => ({
            registrations: [registration, ...state.registrations],
            status: 'success',
            lastSubmitted: registration,
          }));

          await persistRegistration(registration);

          return registration;
        } catch (error) {
          set({ status: 'error', error: error.message });
          throw error;
        }
      },

      submitIndividualRegistration: async () => {
        set({ status: 'loading', error: null });

        try {
          const { eventId, individualDetails } = get();
          if (!eventId || !individualDetails.name) {
            throw new Error('Individual registration requires an event and participant name.');
          }

          // Refresh from the database first — checking only the local cache
          // missed registrations submitted moments earlier by someone else.
          await get().fetchRegistrations(eventId).catch(() => {});

          const conflict = validateRegistrationConflict({
            registrations: get().registrations,
            nextRegistration: {
              eventId,
              registrationType: 'individual',
              individualDetails,
            },
          });
          if (conflict) {
            throw new Error(conflict);
          }

          const eventStore = useEventStore.getState();
          const event = eventStore.getEventById(eventId);
          const participantId = `participant-${createNumericId()}`;
          const qrToken = individualDetails.qrToken || createQrToken('participant');
          if (event) {
            const contestants = [
              ...(event.contestants || []),
              {
                id: participantId,
                name: individualDetails.name,
                type: 'participant',
                email: individualDetails.email,
                phone: individualDetails.phone,
                qrToken,
              },
            ];
            await eventStore.updateEvent(eventId, {
              contestants,
              participants: contestants.length,
            });
          }

          const registration = normalizeRegistration({
            eventId,
            registrationType: 'individual',
            individualDetails: { ...individualDetails, qrToken },
            participantId,
            participantName: individualDetails.name,
            email: individualDetails.email,
            category: event?.title || '',
          });

          set((state) => ({
            registrations: [registration, ...state.registrations],
            status: 'success',
            lastSubmitted: registration,
          }));

          await persistRegistration(registration);

          return registration;
        } catch (error) {
          set({ status: 'error', error: error.message });
          throw error;
        }
      },

      submitPublicRegistration: async ({
        eventId,
        registrationType,
        teamName = '',
        roster = [],
        individualDetails = initialDetails,
        schoolOrganization = '',
        division = '',
        representativeType = '',
        teamLeader = null,
        coach = null,
        subEventId = '',
        subEventName = '',
        category = '',
        sportType = '',
        esportGame = '',
        customSportName = '',
        minParticipants = '',
        maxParticipants = '',
      }) => {
        set({ status: 'loading', error: null });

        try {
          const eventStore = useEventStore.getState();
          const event = eventStore.getEventById(eventId);
          if (!event) {
            throw new Error('Event not found.');
          }

          const registrations = await get().fetchRegistrations(eventId);
          const qrToken = createQrToken(registrationType === 'team' ? 'team' : 'participant');
          const subEvent = (event.subEvents || []).find((entry) => String(entry.id) === String(subEventId)) || null;
          const teamLimitConfig = inferTeamLimitConfig(event, subEvent);
          const resolvedMin = Number(minParticipants || teamLimitConfig.min || 0);
          const resolvedMax = Number(maxParticipants || teamLimitConfig.max || 0);

          if (registrationType === 'team') {
            if (!teamName.trim()) {
              throw new Error('Team name is required.');
            }
            if (!teamLeader?.fullName?.trim() && !coach?.fullName?.trim()) {
              throw new Error('Please provide at least one team representative: Team Leader or Coach.');
            }
            const countError = validateTeamMemberCount(roster.length, {
              ...teamLimitConfig,
              min: resolvedMin,
              max: resolvedMax,
            });
            if (countError) {
              throw new Error(countError);
            }
          }

          const conflict = validateRegistrationConflict({
            registrations,
            nextRegistration: {
              eventId,
              registrationType,
              teamName,
              roster,
              individualDetails,
            },
          });

          if (conflict) {
            throw new Error(conflict);
          }

          let participantId = `participant-${createNumericId()}`;
          let participantName = individualDetails.name;
          let contestantRecord = null;

          if (registrationType === 'team') {
            const team = await useTeamStore.getState().createTeam({
              name: teamName,
              eventId,
              members: roster,
              players: roster,
              status: 'Pending',
              schoolOrganization,
              division,
              representativeType,
              teamLeader,
              coach,
              sportType: sportType || teamLimitConfig.sportType,
              esportGame: esportGame || teamLimitConfig.esportGame,
              customSportName: customSportName || teamLimitConfig.customSportName,
              minParticipants: resolvedMin,
              maxParticipants: resolvedMax,
            });

            if (!team) {
              throw new Error('Unable to create the team in the database.');
            }

            participantId = String(team.id);
            participantName = teamName;
            contestantRecord = {
              id: team.id,
              name: teamName,
              type: 'team',
              teamName,
              captain: teamLeader?.fullName || individualDetails.name,
              email: teamLeader?.email || coach?.email || individualDetails.email,
              phone: teamLeader?.phone || coach?.phone || individualDetails.phone,
              schoolOrganization,
              division,
              representativeType,
              teamLeader,
              coach,
              teamMembers: roster,
              totalMembers: roster.length,
              registrationStatus: 'Pending',
              sportType: sportType || teamLimitConfig.sportType,
              esportGame: esportGame || teamLimitConfig.esportGame,
              customSportName: customSportName || teamLimitConfig.customSportName,
              minParticipants: resolvedMin,
              maxParticipants: resolvedMax,
              subEventId,
              subEventName,
              qrToken,
            };
          } else {
            contestantRecord = {
              id: participantId,
              name: individualDetails.name,
              type: 'participant',
              email: individualDetails.email,
              phone: individualDetails.phone,
              subEventId,
              subEventName,
              qrToken,
            };
          }

          const contestants = [...(event.contestants || []), contestantRecord];
          await eventStore.updateEvent(eventId, {
            contestants,
            participants: contestants.length,
          });

          const registration = normalizeRegistration({
            id: createRegistrationId(registrationType),
            eventId,
            registrationType,
            teamName,
            roster,
            individualDetails: { ...initialDetails, ...individualDetails, qrToken },
            schoolOrganization,
            division,
            representativeType,
            teamLeader,
            coach,
            sportType: sportType || teamLimitConfig.sportType,
            esportGame: esportGame || teamLimitConfig.esportGame,
            customSportName: customSportName || teamLimitConfig.customSportName,
            minParticipants: resolvedMin,
            maxParticipants: resolvedMax,
            participantId,
            participantName,
            email: individualDetails.email || '',
            category,
            subEventId,
            subEventName,
            metadata: {
              qrToken,
              subEventId,
              subEventName,
              captain: individualDetails.name || '',
              phone: individualDetails.phone || '',
              schoolOrganization,
              division,
              representativeType,
              teamLeader,
              coach,
              totalMembers: roster.length,
              sportType: sportType || teamLimitConfig.sportType,
              esportGame: esportGame || teamLimitConfig.esportGame,
              customSportName: customSportName || teamLimitConfig.customSportName,
              minParticipants: resolvedMin,
              maxParticipants: resolvedMax,
            },
            status: registrationType === 'team' ? 'Pending' : 'submitted',
          });

          set((state) => ({
            registrations: [registration, ...state.registrations.filter((entry) => String(entry.id) !== String(registration.id))],
            status: 'success',
            lastSubmitted: registration,
          }));

          await persistRegistration(registration);
          return registration;
        } catch (error) {
          set({ status: 'error', error: error.message });
          throw error;
        }
      },

      reset: () =>
        set({
          eventId: null,
          registrationType: 'individual',
          teamName: '',
          roster: [],
          schoolOrganization: '',
          division: '',
          representativeType: 'Team Leader',
          teamLeader: initialRepresentative,
          coach: initialRepresentative,
          individualDetails: initialDetails,
          status: 'idle',
          error: null,
          lastSubmitted: initialLastSubmitted,
        }),
    }),
    {
      name: 'fairplay_registrations',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            registrations: currentState.registrations,
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

export default useRegistrationStore;

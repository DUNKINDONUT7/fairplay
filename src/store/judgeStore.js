import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import { getBusinessActorId, getActorIdentityKeys, matchesActorIdentity } from '../utils/identity';

function normalizeJudge(judge) {
  return {
    id: getBusinessActorId(judge.id || judge.authProfileId || judge.auth_profile_id || judge.email) || Date.now(),
    name: judge.name || 'Judge',
    email: judge.email || '',
    authProfileId: judge.authProfileId || judge.auth_profile_id || '',
    specialty: judge.specialty || '',
    status: judge.status || 'active',
    scoreCount: Number(judge.scoreCount || judge.score_count || 0),
    createdAt: judge.createdAt || judge.created_at || new Date().toISOString(),
  };
}

function normalizeAssignment(assignment) {
  return {
    id: assignment.id || Date.now(),
    eventId: assignment.eventId || assignment.event_id,
    judgeId: getBusinessActorId(assignment.judgeId || assignment.judge_id) || assignment.judgeId || assignment.judge_id,
    status: assignment.status || 'active',
    assignedAt: assignment.assignedAt || assignment.assigned_at || new Date().toISOString(),
  };
}

const useJudgeStore = create(
  persist(
    (set, get) => ({
      judges: [],
      assignments: [],
      invites: [],
      loading: false,
      error: null,

      fetchJudges: async () => {
        set({ loading: true, error: null });

        if (!isSupabaseConfigured) {
          set({ loading: false });
          return get().judges;
        }

        try {
          const [judgesResponse, assignmentsResponse] = await Promise.all([
            supabase.from('judges').select('*').order('created_at', { ascending: false }),
            supabase.from('judge_assignments').select('*').order('assigned_at', { ascending: false }),
          ]);

          if (judgesResponse.error) throw judgesResponse.error;
          if (assignmentsResponse.error) throw assignmentsResponse.error;

          const judges = (judgesResponse.data || []).map(normalizeJudge);
          const assignments = (assignmentsResponse.data || []).map(normalizeAssignment);
          set({ judges, assignments, loading: false, error: null });
          return judges;
        } catch (error) {
          console.error('Error fetching judges:', error.message);
          set({ loading: false, error: error.message, judges: [], assignments: [] });
          return [];
        }
      },

      addJudge: async (data) => {
        const judge = normalizeJudge(data);

        set((state) => ({ judges: [judge, ...state.judges] }));

        if (!isSupabaseConfigured) {
          return judge;
        }

        try {
          const payload = {
              id: judge.id,
              name: judge.name,
              email: judge.email,
            specialty: judge.specialty,
            status: judge.status,
            score_count: judge.scoreCount,
            created_at: judge.createdAt,
          };
          const { data: inserted, error } = await supabase.from('judges').upsert([payload]).select().single();
          if (error) throw error;

          const normalized = normalizeJudge(inserted || judge);
          set((state) => ({
            judges: state.judges.map((entry) => (String(entry.id) === String(judge.id) ? normalized : entry)),
          }));
          return normalized;
        } catch (error) {
          console.error('Error adding judge:', error.message);
          set({ error: error.message });
          return judge;
        }
      },

      ensureJudgeProfileForUser: async (user) => {
        if (!user) return null;

        const existing = get().getJudgeForActor(user);
        if (existing) {
          return existing;
        }

        const created = await get().addJudge({
          id: getBusinessActorId(user),
          authProfileId: user.id,
          name: user.name || user.email || 'Judge',
          email: user.email || '',
          specialty: 'General',
          status: 'active',
        });

        return created;
      },

      updateJudge: async (judgeId, updates) => {
        const current = get().getJudgeById(judgeId);
        if (!current) return null;

        const updatedJudge = normalizeJudge({ ...current, ...updates, id: judgeId });
        set((state) => ({
          judges: state.judges.map((entry) =>
            String(entry.id) === String(judgeId) ? updatedJudge : entry
          ),
        }));

        if (!isSupabaseConfigured) {
          return updatedJudge;
        }

        try {
          const { error } = await supabase
            .from('judges')
            .upsert([{
              id: updatedJudge.id,
              name: updatedJudge.name,
              email: updatedJudge.email,
              specialty: updatedJudge.specialty,
              status: updatedJudge.status,
              score_count: updatedJudge.scoreCount,
              created_at: updatedJudge.createdAt,
            }]);
          if (error) throw error;
        } catch (error) {
          console.error('Error updating judge:', error.message);
          set({ error: error.message });
        }

        return updatedJudge;
      },

      assignJudge: async (eventId, judgeId) => {
        const existing = get().assignments.find(
          (assignment) =>
            String(assignment.eventId) === String(eventId) &&
            String(assignment.judgeId) === String(judgeId)
        );

        if (existing) {
          return existing;
        }

        const assignment = normalizeAssignment({ eventId, judgeId });
        set((state) => ({ assignments: [assignment, ...state.assignments] }));

        if (!isSupabaseConfigured) {
          return assignment;
        }

        try {
          const { data, error } = await supabase
            .from('judge_assignments')
            .upsert([{
              id: `${assignment.judgeId}_${assignment.eventId}`,
              judge_id: assignment.judgeId,
              event_id: assignment.eventId,
              status: assignment.status,
              assigned_at: assignment.assignedAt,
            }], { onConflict: 'id' })
            .select()
            .single();
          if (error) throw error;

          const normalized = normalizeAssignment(data || assignment);
          set((state) => ({
            assignments: state.assignments.map((entry) =>
              String(entry.id) === String(assignment.id) ? normalized : entry
            ),
          }));
          return normalized;
        } catch (error) {
          console.error('Error assigning judge:', error.message);
          set({ error: error.message });
          return assignment;
        }
      },

      removeAssignment: async (assignmentId) => {
        set((state) => ({
          assignments: state.assignments.filter((assignment) => String(assignment.id) !== String(assignmentId)),
        }));

        if (!isSupabaseConfigured) {
          return true;
        }

        try {
          const { error } = await supabase.from('judge_assignments').delete().eq('id', assignmentId);
          if (error) throw error;
        } catch (error) {
          console.error('Error removing assignment:', error.message);
          set({ error: error.message });
        }

        return true;
      },

      fetchInvites: async (eventId) => {
        if (!isSupabaseConfigured || !eventId) return get().invites;

        try {
          const { data, error } = await supabase
            .from('judge_invites')
            .select('id, event_id, judge_name, judge_email, status, created_at, claimed_at')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false });
          if (error) throw error;

          const others = get().invites.filter((invite) => String(invite.eventId) !== String(eventId));
          const fetched = (data || []).map((row) => ({
            id: row.id,
            eventId: row.event_id,
            judgeName: row.judge_name,
            judgeEmail: row.judge_email,
            status: row.status,
            createdAt: row.created_at,
            claimedAt: row.claimed_at,
          }));
          set({ invites: [...others, ...fetched] });
          return fetched;
        } catch (error) {
          console.error('Error fetching judge invites:', error.message);
          set({ error: error.message });
          return [];
        }
      },

      inviteJudge: async (eventId, eventTitle, { name, email }) => {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error('Judge invites require FairPlay to be connected to Supabase.');
        }

        const { data, error } = await supabase.functions.invoke('notify-judge-invite', {
          body: { eventId, eventTitle, judgeName: name, judgeEmail: email },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        await get().fetchInvites(eventId);
        return data;
      },

      getInvitesForEvent: (eventId) => {
        return get().invites.filter((invite) => String(invite.eventId) === String(eventId));
      },

      getJudgesByEvent: (eventId) => {
        const { assignments, judges } = get();
        return assignments
          .filter((assignment) => String(assignment.eventId) === String(eventId))
          .map((assignment) => ({
            ...assignment,
            judge: judges.find((judge) => String(judge.id) === String(assignment.judgeId)) || null,
          }));
      },

      getJudgeForActor: (actor) => {
        const actorKeys = getActorIdentityKeys(actor);
        if (actorKeys.length === 0) return null;

        return get().judges.find((judge) => (
          actorKeys.some((key) =>
            matchesActorIdentity(judge.id, key) ||
            matchesActorIdentity(judge.authProfileId, key) ||
            matchesActorIdentity(judge.email, key)
          )
        )) || null;
      },

      getJudgeAssignments: (actor) => {
        const matchedJudge = get().getJudgeForActor(actor);
        const businessJudgeId = matchedJudge?.id ?? getBusinessActorId(actor);

        if (businessJudgeId === null) {
          return [];
        }

        return get().assignments.filter((assignment) => String(assignment.judgeId) === String(businessJudgeId));
      },

      getJudgeById: (id) => get().judges.find((judge) => String(judge.id) === String(id)) || null,

      incrementScoreCount: async (judgeId) => {
        const judge = get().getJudgeById(judgeId);
        if (!judge) return null;
        return get().updateJudge(judgeId, { scoreCount: Number(judge.scoreCount || 0) + 1 });
      },

      acceptExternalInvite: async ({ invite, fallbackJudgeData = {} }) => {
        if (!invite?.judgeEmail) return null;

        let judge = get().judges.find((entry) => entry.email === invite.judgeEmail) || null;
        if (!judge) {
          judge = await get().addJudge({
            name: invite.judgeName || fallbackJudgeData.name || 'External Judge',
            email: invite.judgeEmail,
            specialty: invite.specialty || fallbackJudgeData.specialty || '',
            status: 'external',
          });
        }

        const assignment = await get().assignJudge(invite.eventId, judge.id);
        return { judge, assignment };
      },
    }),
    {
      name: 'fairplay_judges',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            judges: currentState.judges,
            assignments: currentState.assignments,
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

export default useJudgeStore;

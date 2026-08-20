import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

const DEMO_MODE_ENABLED = import.meta.env.VITE_DEMO_MODE === 'true';
const SUPABASE_AUTH_ENABLED = isSupabaseConfigured;
const HYBRID_MODE = isSupabaseConfigured && DEMO_MODE_ENABLED;
const APP_URL =
  import.meta.env.VITE_SITE_URL ||
  import.meta.env.VITE_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

const SEED_USERS = [
  { id: 1, email: 'admin@fairplay.com', password: 'Admin123!', name: 'Admin User', role: 'admin', avatar: 'A', status: 'active', joined: '2025-01-15' },
  { id: 2, email: 'organizer@fairplay.com', password: 'Organizer123!', name: 'Organizer User', role: 'organizer', avatar: 'O', status: 'active', joined: '2025-02-20' },
  { id: 3, email: 'judge@fairplay.com', password: 'Judge123!', name: 'Judge User', role: 'judge', avatar: 'J', status: 'active', joined: '2025-03-10' },
  { id: 4, email: 'participant@fairplay.com', password: 'Participant123!', name: 'Participant User', role: 'participant', avatar: 'P', status: 'active', joined: '2025-04-05' },
  { id: 5, email: 'coordinator@fairplay.com', password: 'Coordinator123!', name: 'Institute Coordinator', role: 'institute-coordinator', avatar: 'C', status: 'active', joined: '2025-04-06' },
  { id: 6, email: 'sportshead@fairplay.com', password: 'SportsHead123!', name: 'Sports Head', role: 'sports-head', avatar: 'S', status: 'active', joined: '2025-04-07' },
  { id: 7, email: 'osds@fairplay.com', password: 'OSDS123!', name: 'OSDS Officer', role: 'osds', avatar: 'O', status: 'active', joined: '2025-04-08' },
];

const ALLOWED_ROLES = new Set([
  'admin',
  'organizer',
  'judge',
  'participant',
  'institute-coordinator',
  'sports-head',
  'osds',
]);

let authListenerBound = false;

function normalizeRole(role) {
  return ALLOWED_ROLES.has(role) ? role : 'participant';
}

function buildAvatar(name, email) {
  return String(name || email || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function getSeedUser(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const userData = SEED_USERS.find((candidate) => candidate.email.toLowerCase() === normalizedEmail) || null;
  if (!userData || !password || password !== userData.password) {
    return null;
  }

  const { password: _, ...safeUser } = userData;
  return safeUser;
}

function buildOrganizerApplication(userData = {}) {
  const email = String(userData.email || '').trim().toLowerCase();
  const name = String(userData.name || userData.full_name || email || 'Organizer Applicant').trim();
  return {
    id: userData.id || `application-${Date.now()}`,
    email,
    name,
    role: 'organizer',
    status: 'pending',
    avatar: buildAvatar(name, email),
    joined: userData.joined || new Date().toISOString().slice(0, 10),
    password: userData.password,
    source: userData.source || 'signup',
  };
}

function buildOrganizerApplicationsFromUsers(users = []) {
  return users
    .filter((user) => user?.role === 'organizer' && user?.status === 'pending')
    .map((user) => buildOrganizerApplication(user));
}

function getAuthRedirectUrl() {
  const origin = String(APP_URL || '').replace(/\/$/, '');
  return origin || undefined;
}

async function notifyOrganizerApproval(organizer) {
  if (!SUPABASE_AUTH_ENABLED || !supabase || !organizer?.email) {
    return { sent: false, skipped: true };
  }

  try {
    const { data, error } = await supabase.functions.invoke('notify-organizer-approval', {
      body: {
        email: organizer.email,
        name: organizer.name || organizer.email,
        loginUrl: getAuthRedirectUrl(),
      },
    });

    if (error) {
      throw error;
    }

    return data || { sent: true };
  } catch (error) {
    console.warn('Approval email was not sent:', error?.message || error);
    return { sent: false, error: error?.message || 'Approval email was not sent.' };
  }
}

function mapProfileRow(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email || '',
    name: profile.full_name || profile.email || 'FairPlay User',
    role: normalizeRole(profile.role),
    avatar: buildAvatar(profile.full_name, profile.email),
    avatarUrl: profile.avatar_url || '',
    status: profile.status || 'active',
    joined: profile.created_at ? String(profile.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    metadata: profile.metadata || {},
  };
}

async function fetchProfileById(userId) {
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertProfileFromAuth(authUser, overrides = {}) {
  if (!supabase || !authUser?.id) return null;

  const metadata = authUser.user_metadata || {};
  const payload = {
    id: authUser.id,
    email: authUser.email || overrides.email || '',
    full_name: overrides.full_name || metadata.full_name || metadata.name || authUser.email || 'FairPlay User',
    role: normalizeRole(overrides.role || metadata.role),
    avatar_url: overrides.avatar_url || metadata.avatar_url || '',
    status: overrides.status || metadata.status || 'active',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function buildSessionUser(authUser) {
  if (!authUser) return null;

  let profile = null;

  try {
    profile = await fetchProfileById(authUser.id);
    if (!profile) {
      profile = await upsertProfileFromAuth(authUser);
    }
  } catch (error) {
    profile = {
      id: authUser.id,
      email: authUser.email || '',
      full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email || 'FairPlay User',
      role: normalizeRole(authUser.user_metadata?.role),
      avatar_url: authUser.user_metadata?.avatar_url || '',
      status: 'active',
      created_at: authUser.created_at || new Date().toISOString(),
    };
  }

  return mapProfileRow(profile);
}

async function fetchProfilesList() {
  if (!supabase) {
    return SEED_USERS.map((entry) => ({ ...entry, password: undefined }));
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data.map(mapProfileRow);
}


const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      users: SEED_USERS.map(({ password, ...entry }) => entry),
      organizerApplications: [],
      loading: true,
      initialized: false,
      authMode: HYBRID_MODE ? 'hybrid' : SUPABASE_AUTH_ENABLED ? 'supabase' : 'demo',
      sessionSource: HYBRID_MODE ? 'hybrid' : SUPABASE_AUTH_ENABLED ? 'supabase' : 'demo',

      initAuth: async () => {
        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          set({ loading: false, initialized: true, authMode: 'demo', sessionSource: 'demo' });
          return;
        }

        set({
          loading: true,
          authMode: HYBRID_MODE ? 'hybrid' : 'supabase',
          sessionSource: HYBRID_MODE ? 'hybrid' : 'supabase',
        });

        try {
          const [{ data: sessionData }, profiles] = await Promise.all([
            supabase.auth.getSession(),
            fetchProfilesList().catch(() => []),
          ]);

          const session = sessionData?.session || null;
          const sessionUser = session?.user ? await buildSessionUser(session.user) : null;

          set({
            user: sessionUser,
            token: session?.access_token || null,
            users: profiles.length > 0 ? profiles : get().users,
            organizerApplications: buildOrganizerApplicationsFromUsers(profiles.length > 0 ? profiles : get().users),
            loading: false,
            initialized: true,
          });
        } catch (error) {
          set({
            user: null,
            token: null,
            loading: false,
            initialized: true,
          });
        }

        if (!authListenerBound) {
          authListenerBound = true;
          supabase.auth.onAuthStateChange(async (_event, session) => {
            const nextUser = session?.user ? await buildSessionUser(session.user) : null;
            const users = session?.user ? await fetchProfilesList().catch(() => get().users) : get().users;

            set({
              user: nextUser,
              token: session?.access_token || null,
              users,
              organizerApplications: buildOrganizerApplicationsFromUsers(users),
              loading: false,
              initialized: true,
            });
          });
        }
      },

      login: async (email, password) => {
        set({ loading: true });
        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          const safeUser = getSeedUser(normalizedEmail, password) || get().users.find((entry) =>
            String(entry.email || '').toLowerCase() === normalizedEmail &&
            entry.password === password
          );
          if (!safeUser) {
            set({ loading: false });
            return { success: false, error: 'Invalid email or password.' };
          }

          const token = `token_${safeUser.id}_${Date.now()}`;
          set({ user: safeUser, token, loading: false, initialized: true, authMode: 'demo', sessionSource: 'demo' });
          return { success: true, user: safeUser };
        }

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

          if (error) {
            throw error;
          }

          const sessionUser = await buildSessionUser(data.user);
          const users = await fetchProfilesList().catch(() => get().users);

          set({
            user: sessionUser,
            token: data.session?.access_token || null,
            users,
            organizerApplications: buildOrganizerApplicationsFromUsers(users),
            loading: false,
            initialized: true,
            authMode: HYBRID_MODE ? 'hybrid' : 'supabase',
            sessionSource: 'supabase',
          });

          return { success: true, user: sessionUser };
        } catch (error) {
          const safeUser = DEMO_MODE_ENABLED && (
            getSeedUser(normalizedEmail, password) || get().users.find((entry) =>
              String(entry.email || '').toLowerCase() === normalizedEmail &&
              entry.password === password
            )
          );
          if (safeUser) {
            const token = `token_${safeUser.id}_${Date.now()}`;
            set({
              user: safeUser,
              token,
              loading: false,
              initialized: true,
              authMode: HYBRID_MODE ? 'hybrid' : 'demo',
              sessionSource: 'demo',
            });
            return {
              success: true,
              user: safeUser,
              message: 'Signed in using FairPlay demo access.',
            };
          }

          set({ loading: false, initialized: true });
          return { success: false, error: error?.message || 'Unable to sign in right now.' };
        }
      },

      register: async (userData) => {
        set({ loading: true });

        const email = String(userData?.email || '').trim().toLowerCase();
        const password = String(userData?.password || '');
        const role = 'organizer';
        const name = String(userData?.name || '').trim() || email || 'FairPlay User';
        const status = 'active';

        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          const newUser = {
            id: Date.now(),
            email,
            name,
            role,
            password,
            avatar: buildAvatar(name, email),
            status,
            joined: new Date().toISOString().slice(0, 10),
          };
          const safeUser = { ...newUser, password: undefined };
          const token = `token_${newUser.id}_${Date.now()}`;
          set((state) => ({
            user: safeUser,
            token,
            users: [newUser, ...state.users.filter((entry) => entry.email !== newUser.email)],
            organizerApplications: state.organizerApplications.filter((entry) => entry.email !== newUser.email),
            loading: false,
            initialized: true,
            authMode: 'demo',
            sessionSource: 'demo',
          }));
          return {
            success: true,
            user: safeUser,
            requiresApproval: false,
            message: 'Organizer account created.',
          };
        }

        try {
          // Real Supabase Auth signup — the password is hashed and stored by
          // Supabase itself, never touched by app code. The on_auth_user_created
          // trigger (supabase/schema.sql) creates the matching profiles row.
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: name, role },
              emailRedirectTo: APP_URL || undefined,
            },
          });

          if (error) throw error;
          if (!data.user) throw new Error('Registration did not return a user.');

          if (!data.session) {
            // Email confirmation is required by this project's Supabase Auth
            // settings — there's no active session yet, so we can't build a
            // logged-in state. The user must confirm their email, then log in.
            set({ loading: false, initialized: true });
            return {
              success: true,
              requiresApproval: false,
              requiresEmailConfirmation: true,
              message: 'Check your email to confirm your account, then sign in.',
            };
          }

          const sessionUser = await buildSessionUser(data.user);
          const users = await fetchProfilesList().catch(() => get().users);

          set({
            user: sessionUser,
            token: data.session?.access_token || null,
            users,
            organizerApplications: buildOrganizerApplicationsFromUsers(users),
            loading: false,
            initialized: true,
            authMode: HYBRID_MODE ? 'hybrid' : 'supabase',
            sessionSource: 'supabase',
          });

          return {
            success: true,
            user: sessionUser,
            requiresApproval: false,
            requiresEmailConfirmation: false,
            message: 'Organizer account created.',
          };
        } catch (error) {
          set({ loading: false, initialized: true });
          return {
            success: false,
            error: error?.message || 'Unable to create your organizer account right now.',
          };
        }
      },

      createUser: async (userData) => {
        const newUser = {
          id: Date.now(),
          status: 'active',
          joined: new Date().toISOString().slice(0, 10),
          avatar: buildAvatar(userData?.name, userData?.email),
          ...userData,
        };
        set((state) => ({ users: [newUser, ...state.users] }));
        return newUser;
      },

      approveOrganizerApplication: async (applicationId) => {
        const application = get().organizerApplications.find((entry) => String(entry.id) === String(applicationId)) ||
          get().users.find((entry) => String(entry.id) === String(applicationId));
        if (!application) return null;

        let approvedUser = null;
        if (SUPABASE_AUTH_ENABLED && supabase && !String(application.id).startsWith('application-')) {
          const { data, error } = await supabase
            .from('profiles')
            .update({ status: 'active', role: 'organizer', updated_at: new Date().toISOString() })
            .eq('id', application.id)
            .select()
            .single();

          if (error) throw error;
          approvedUser = mapProfileRow(data);
        }

        approvedUser = approvedUser || {
          ...application,
          status: 'active',
          role: 'organizer',
          avatar: buildAvatar(application.name, application.email),
        };

        set((state) => ({
          users: [
            approvedUser,
            ...state.users.filter((entry) => String(entry.id) !== String(application.id) && entry.email !== application.email),
          ],
          organizerApplications: state.organizerApplications.filter((entry) => String(entry.id) !== String(application.id) && entry.email !== application.email),
        }));

        await notifyOrganizerApproval(approvedUser);

        return approvedUser;
      },

      declineOrganizerApplication: async (applicationId) => {
        const application = get().organizerApplications.find((entry) => String(entry.id) === String(applicationId)) ||
          get().users.find((entry) => String(entry.id) === String(applicationId));

        if (SUPABASE_AUTH_ENABLED && supabase && application && !String(application.id).startsWith('application-')) {
          await supabase.from('profiles').delete().eq('id', application.id);
        }

        set((state) => ({
          users: state.users.filter((entry) =>
            String(entry.id) !== String(applicationId) &&
            (!application?.email || String(entry.email || '').toLowerCase() !== String(application.email || '').toLowerCase())
          ),
          organizerApplications: state.organizerApplications.filter((entry) =>
            String(entry.id) !== String(applicationId) &&
            (!application?.email || String(entry.email || '').toLowerCase() !== String(application.email || '').toLowerCase())
          ),
        }));
      },

      updateUser: async (userId, updates) => {
        let updatedUser = null;

        if (SUPABASE_AUTH_ENABLED && supabase) {
          const payload = {
            ...(updates?.email ? { email: updates.email } : {}),
            ...(updates?.name ? { full_name: updates.name } : {}),
            ...(updates?.role ? { role: normalizeRole(updates.role) } : {}),
            ...(updates?.avatarUrl ? { avatar_url: updates.avatarUrl } : {}),
            ...(updates?.status ? { status: updates.status } : {}),
            updated_at: new Date().toISOString(),
          };

          const { data, error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', userId)
            .select()
            .single();

          if (error) {
            throw error;
          }

          updatedUser = mapProfileRow(data);
        }

        set((state) => {
          const users = state.users.map((entry) => {
            if (String(entry.id) !== String(userId)) return entry;
            return updatedUser || { ...entry, ...updates };
          });

          return {
            users,
            user: state.user && String(state.user.id) === String(userId)
              ? updatedUser || { ...state.user, ...updates }
              : state.user,
          };
        });

        return updatedUser;
      },

      deleteUser: async (userId) => {
        if (SUPABASE_AUTH_ENABLED && supabase) {
          // Calls the delete-user Edge Function so the Supabase Auth
          // account is actually removed, not just the profiles row — a
          // profile-only delete left the account still able to log in.
          const { data, error } = await supabase.functions.invoke('delete-user', {
            body: { userId },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
        }

        set((state) => ({
          users: state.users.filter((entry) => String(entry.id) !== String(userId)),
          user: state.user && String(state.user.id) === String(userId) ? null : state.user,
          token: state.user && String(state.user.id) === String(userId) ? null : state.token,
        }));
      },

      refreshProfiles: async () => {
        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          set((state) => {
            const seedUsers = SEED_USERS.map(({ password, ...entry }) => entry);
            const seedEmails = new Set(seedUsers.map((entry) => entry.email.toLowerCase()));
            const customUsers = state.users.filter((entry) => !seedEmails.has(String(entry.email || '').toLowerCase()));
            const users = [
              ...customUsers,
              ...seedUsers,
            ];

            return {
              users,
              organizerApplications: buildOrganizerApplicationsFromUsers(users),
            };
          });
          return;
        }

        try {
          const users = await fetchProfilesList();
          set({
            users,
            organizerApplications: buildOrganizerApplicationsFromUsers(users),
          });
        } catch (error) {
          set({ error: error?.message || 'Unable to refresh profiles.' });
        }
      },

      logout: async () => {
        if (SUPABASE_AUTH_ENABLED && supabase && get().sessionSource === 'supabase') {
          await supabase.auth.signOut();
        }

        set({
          user: null,
          token: null,
          loading: false,
          initialized: true,
          users: SUPABASE_AUTH_ENABLED ? get().users : SEED_USERS.map(({ password, ...entry }) => entry),
        });
      },

      setLoading: (loading) => set({ loading }),

      get isAuthenticated() {
        return !!get().user && !!get().token;
      },

      get userRole() {
        return get().user?.role || null;
      },
    }),
    {
      name: 'fairplay_auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        authMode: state.authMode,
        sessionSource: state.sessionSource,
        organizerApplications: state.organizerApplications,
        users: state.users,
      }),
    }
  )
);

export default useAuthStore;
export const useAuth = () => useAuthStore();

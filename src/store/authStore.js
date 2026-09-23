import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getAppBaseUrl } from '../utils/appUrl';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

const SUPABASE_AUTH_ENABLED = isSupabaseConfigured;
const APP_URL = getAppBaseUrl();

// Every account lives in Supabase Auth. There are no built-in local logins:
// a login Supabase rejects is simply a failed login, and nothing client-side
// can shadow or stand in for a real registered account.
const NOT_CONNECTED_MESSAGE = 'FairPlay is not connected to Supabase. Check the Supabase URL and anon key, then reload.';

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

function getBlockedAuthMessage(status) {
  if (status === 'pending') return 'Your organizer account is awaiting admin approval. You will be notified once approved.';
  if (status === 'suspended') return 'Your account has been suspended. Contact an administrator.';
  return null;
}

// Translates whatever Supabase/the browser throws into one plain, actionable
// sentence — never the raw error.message. Server/network errors can surface
// in all sorts of technical shapes (a Supabase error code, a bare HTTP
// status, a browser-level fetch failure with no code at all), and none of
// that is something someone signing up should ever have to read. Every
// branch below is a *recognized* case; anything that doesn't match falls
// through to one safe, generic sentence — so even a completely unanticipated
// error still reads as human, not as a leaked stack trace or API response.
function describeAuthError(error, { action = 'signing in' } = {}) {
  const status = Number(error?.status) || null;
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const includesAny = (...needles) => needles.some((needle) => message.includes(needle));

  if (status === 429 || code.includes('rate_limit') || includesAny('rate limit', 'too many requests')) {
    return "You've tried a few times in a row — please wait a few minutes before trying again.";
  }

  if (code === 'user_already_exists' || code === 'email_exists' || includesAny('already registered', 'already exists', 'already been registered')) {
    return 'An account with this email already exists. Try signing in instead, or use a different email address.';
  }

  if (code === 'invalid_credentials' || includesAny('invalid login credentials', 'invalid email or password')) {
    return 'That email and password don’t match. Please check and try again.';
  }

  if (code === 'email_not_confirmed' || includesAny('email not confirmed', 'confirm your email')) {
    return 'Please confirm your email first — check your inbox (and spam folder) for the confirmation link.';
  }

  if (code.includes('weak_password') || includesAny('password should be', 'password is too weak')) {
    return 'Please choose a stronger password — at least 8 characters with a mix of letters and numbers.';
  }

  if (includesAny('failed to fetch', 'load failed', 'network', 'securityerror', 'no api key')) {
    return 'Unable to reach the server right now. Check your internet connection and try again.';
  }

  return `Something went wrong while ${action}. Please try again in a moment.`;
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
    return [];
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
      users: [],
      organizerApplications: [],
      loading: true,
      initialized: false,
      // Kept as fields because the admin screens display them, but there is
      // only one possible source now — Supabase — or none at all.
      authMode: SUPABASE_AUTH_ENABLED ? 'supabase' : 'disconnected',
      sessionSource: SUPABASE_AUTH_ENABLED ? 'supabase' : 'disconnected',

      initAuth: async () => {
        // zustand's persist middleware rehydrates from localStorage
        // asynchronously. Waiting for it here stops a late rehydrate from
        // overwriting the session this function is about to resolve.
        if (!useAuthStore.persist.hasHydrated()) {
          // onFinishHydration only fires on a successful rehydrate — if it
          // ever errors (corrupted localStorage, etc.) the callback never
          // runs at all, so this must not wait unconditionally or a bad
          // hydration would permanently stall the login flow.
          await Promise.race([
            new Promise((resolve) => {
              const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
                unsubscribe();
                resolve();
              });
            }),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        }

        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          set({
            user: null,
            token: null,
            users: [],
            organizerApplications: [],
            loading: false,
            initialized: true,
            authMode: 'disconnected',
            sessionSource: 'disconnected',
          });
          return;
        }

        set({ loading: true, authMode: 'supabase', sessionSource: 'supabase' });

        try {
          // getSession() serializes through the browser's Web Locks API. A
          // stale lock left behind by a tab that was hard-reloaded mid-
          // request (e.g. a fresh deploy reloading an open tab) can make it
          // hang forever — it never resolves *or* rejects, so the try/catch
          // below can't save us. Bound it so a stuck lock can't leave the
          // whole app (and the login modal, gated on this same loading
          // flag) permanently stuck loading.
          const [{ data: sessionData }, profiles] = await Promise.all([
            Promise.race([
              supabase.auth.getSession(),
              new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 8000)),
            ]),
            fetchProfilesList().catch(() => []),
          ]);

          const session = sessionData?.session || null;
          const sessionUser = session?.user ? await buildSessionUser(session.user) : null;

          // Supabase's own session is the only source of truth now: whatever
          // getSession() says, that is the signed-in state. The profiles
          // fallback below only guards against a transient fetch failure
          // blanking a list that was loaded fine a moment ago.
          const nextUsers = profiles.length > 0 ? profiles : get().users;

          set({
            user: sessionUser,
            token: session?.access_token || null,
            users: nextUsers,
            organizerApplications: buildOrganizerApplicationsFromUsers(nextUsers),
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
          set({ loading: false, initialized: true });
          return { success: false, error: NOT_CONNECTED_MESSAGE };
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

          const blockedMessage = getBlockedAuthMessage(sessionUser?.status);
          if (blockedMessage) {
            await supabase.auth.signOut();
            set({ loading: false, initialized: true });
            return { success: false, error: blockedMessage };
          }

          const users = await fetchProfilesList().catch(() => get().users);

          set({
            user: sessionUser,
            token: data.session?.access_token || null,
            users,
            organizerApplications: buildOrganizerApplicationsFromUsers(users),
            loading: false,
            initialized: true,
            authMode: 'supabase',
            sessionSource: 'supabase',
          });

          return { success: true, user: sessionUser };
        } catch (error) {
          set({ loading: false, initialized: true });
          return { success: false, error: describeAuthError(error, { action: 'signing in' }) };
        }
      },

      register: async (userData) => {
        set({ loading: true });

        const email = String(userData?.email || '').trim().toLowerCase();
        const password = String(userData?.password || '');
        const role = 'organizer';
        const name = String(userData?.name || '').trim() || email || 'FairPlay User';

        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          set({ loading: false, initialized: true });
          return { success: false, error: NOT_CONNECTED_MESSAGE };
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
            // logged-in state. The trigger already created the profile as
            // 'pending', so after confirming their email they'll still need
            // an admin to approve them before they can sign in.
            set({ loading: false, initialized: true });
            return {
              success: true,
              requiresApproval: true,
              requiresEmailConfirmation: true,
              message: 'Check your email to confirm your account. An admin will also need to approve it before you can sign in.',
            };
          }

          const sessionUser = await buildSessionUser(data.user);

          if (sessionUser?.status === 'pending') {
            // Email confirmation is off for this project, so signUp() above
            // already opened a real session — sign it back out immediately
            // rather than let a not-yet-approved organizer into the dashboard.
            await supabase.auth.signOut();
            const users = await fetchProfilesList().catch(() => get().users);
            set({
              users,
              organizerApplications: buildOrganizerApplicationsFromUsers(users),
              loading: false,
              initialized: true,
            });
            return {
              success: true,
              requiresApproval: true,
              requiresEmailConfirmation: false,
              message: 'Your organizer account has been submitted for admin approval. You will be notified once approved.',
            };
          }

          const users = await fetchProfilesList().catch(() => get().users);

          set({
            user: sessionUser,
            token: data.session?.access_token || null,
            users,
            organizerApplications: buildOrganizerApplicationsFromUsers(users),
            loading: false,
            initialized: true,
            authMode: 'supabase',
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
            error: describeAuthError(error, { action: 'creating your organizer account' }),
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
          // Goes through the delete-user Edge Function (service role) so the
          // Supabase Auth account is actually removed, not just the profiles
          // row — a profile-only delete left the account able to sign in and
          // silently get re-created as an active organizer on next login.
          const { data, error } = await supabase.functions.invoke('delete-user', {
            body: { userId: application.id },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
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
            ...(updates?.avatarUrl !== undefined ? { avatar_url: updates.avatarUrl } : {}),
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
          set({ users: [], organizerApplications: [] });
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
        if (SUPABASE_AUTH_ENABLED && supabase) {
          await supabase.auth.signOut();
        }

        set({
          user: null,
          token: null,
          users: [],
          organizerApplications: [],
          loading: false,
          initialized: true,
        });
      },

      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'fairplay_auth',
      // Bumped when local logins were removed. An older payload can still
      // hold a client-side session and user list that no longer correspond
      // to anything in Supabase, so it is dropped rather than migrated —
      // initAuth re-reads the real session and profiles on the next load.
      version: 2,
      migrate: () => ({}),
      // The profile directory is re-fetched by initAuth on every load and by
      // refreshProfiles on every screen that shows it, so it is deliberately
      // not persisted: a signed-out browser should not keep a copy of it.
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        authMode: state.authMode,
        sessionSource: state.sessionSource,
      }),
    }
  )
);

export default useAuthStore;
export const useAuth = () => useAuthStore();

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
// Bumped on every onAuthStateChange invocation and at the start of logout().
// Supabase can fire this callback for overlapping events (a periodic token
// refresh, then moments later a sign-out) and each invocation does its own
// async round-trip (buildSessionUser/fetchProfilesList) before calling
// set() — nothing guarantees they resolve in the order they fired. Without
// this guard, an earlier, slow-resolving invocation can finish *after* the
// sign-out's own invocation and silently overwrite the just-cleared session
// with stale (but locally valid-looking) user data — the "Sign Out doesn't
// work until I reload and click it again" bug: Supabase had already ended
// the real session, but the store's local state got revived by the stale
// callback, so the UI kept showing a signed-in user until a reload called
// getSession() fresh and got the real (signed-out) answer.
let authCallbackVersion = 0;

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

  // Every recognized case above returns before this point. Anything that
  // reaches here is unanticipated, so — unlike the branches above, which
  // intentionally hide Supabase's wording — the raw message is appended
  // rather than swallowed, since a silent generic message left this class
  // of failure (e.g. a database trigger error) completely undiagnosable
  // from the UI alone.
  const rawDetail = String(error?.message || '').trim();
  const suffix = rawDetail ? ` (${rawDetail.slice(0, 200)})` : '';
  return `Something went wrong while ${action}. Please try again in a moment.${suffix}`;
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
    bio: profile.bio || '',
    phone: profile.phone || '',
    joined: profile.created_at ? String(profile.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    createdAt: profile.created_at || null,
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
              new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 4000)),
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
          supabase.auth.onAuthStateChange((_event, session) => {
            const version = ++authCallbackVersion;
            // Supabase runs this callback while holding its auth lock; awaiting
            // another Supabase call here deadlocks every later request (data
            // loads and sign-out hang until a reload). Defer the work so the
            // lock is released first.
            setTimeout(async () => {
              const nextUser = session?.user ? await buildSessionUser(session.user) : null;
              const users = session?.user ? await fetchProfilesList().catch(() => get().users) : get().users;

              // A newer auth event (e.g. this one was a stale token-refresh
              // that started before a sign-out, and only resolved after it)
              // has since started and already set the authoritative state —
              // applying this result now would revive a session that's
              // actually already gone.
              if (version !== authCallbackVersion) return;

              set({
                user: nextUser,
                token: session?.access_token || null,
                users,
                organizerApplications: buildOrganizerApplicationsFromUsers(users),
                loading: false,
                initialized: true,
              });
            }, 0);
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
          console.error('Login failed:', error);
          set({ loading: false, initialized: true });
          return { success: false, error: describeAuthError(error, { action: 'signing in' }) };
        }
      },

      // Public self-registration only ever creates participant accounts now.
      // Organizer accounts are admin-only (see createOrganizerAccount below)
      // — this is a deliberate security boundary, not an oversight: letting
      // anyone self-serve an organizer account (even pending-approval) meant
      // anyone could create events, invite judges, and manage contestants
      // the moment an admin got careless with an approval click.
      register: async (userData) => {
        set({ loading: true });

        const email = String(userData?.email || '').trim().toLowerCase();
        const password = String(userData?.password || '');
        const role = 'participant';
        const name = String(userData?.name || '').trim() || email || 'FairPlay User';

        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          set({ loading: false, initialized: true });
          return { success: false, error: NOT_CONNECTED_MESSAGE };
        }

        try {
          // Real Supabase Auth signup — the password is hashed and stored by
          // Supabase itself, never touched by app code. The on_auth_user_created
          // trigger (supabase/schema.sql) creates the matching profiles row,
          // active immediately since only 'organizer' defaults to 'pending'.
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: name, role },
              // Lands on a proper in-app "email confirmed" page instead of
              // Supabase's default behavior of redirecting to whatever the
              // project's Site URL happens to be configured as (which has
              // sent people to a dead localhost page) — this route must
              // also be added to Supabase Dashboard > Authentication >
              // URL Configuration > Redirect URLs, or Supabase will refuse
              // it and fall back to the Site URL anyway.
              emailRedirectTo: APP_URL ? `${APP_URL}/auth/confirmed` : undefined,
            },
          });

          if (error) throw error;

          // Supabase's anti-enumeration behavior for signUp(): if the email
          // already belongs to an account, it returns success with no error
          // rather than an "already exists" error, so a caller can't probe
          // which emails are registered — either data.user comes back empty,
          // or a real-looking user with an empty identities array. Both mean
          // the same thing here: this email is already taken.
          if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
            set({ loading: false, initialized: true });
            return {
              success: false,
              error: 'An account with this email already exists. Try signing in instead, or use a different email address.',
            };
          }

          if (!data.session) {
            // Email confirmation is required by this project's Supabase Auth
            // settings — there's no active session yet, so we can't build a
            // logged-in state. They can sign in as soon as they confirm.
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
            authMode: 'supabase',
            sessionSource: 'supabase',
          });

          return {
            success: true,
            user: sessionUser,
            requiresApproval: false,
            requiresEmailConfirmation: false,
            message: 'Participant account created.',
          };
        } catch (error) {
          console.error('Registration failed:', error);
          set({ loading: false, initialized: true });
          return {
            success: false,
            error: describeAuthError(error, { action: 'creating your account' }),
          };
        }
      },

      // Admin-only: creates an already-active organizer account with a
      // specific email/password the admin sets, via the create-organizer
      // Edge Function (service role — a plain client-side signUp() here
      // would replace the admin's own session with the new organizer's).
      createOrganizerAccount: async ({ name, email, password }) => {
        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          return { success: false, error: NOT_CONNECTED_MESSAGE };
        }

        try {
          const { data, error } = await supabase.functions.invoke('create-organizer', {
            body: { name, email, password },
          });

          if (error) {
            const bodyFromResponse = await error.context?.json?.().catch(() => null);
            throw new Error(bodyFromResponse?.error || data?.error || error.message || 'Unable to create this organizer account.');
          }
          if (data?.error) throw new Error(data.error);

          const users = await fetchProfilesList().catch(() => get().users);
          set({
            users,
            organizerApplications: buildOrganizerApplicationsFromUsers(users),
          });

          return { success: true, userId: data?.userId };
        } catch (error) {
          console.error('Create organizer failed:', error);
          return { success: false, error: error.message || 'Unable to create this organizer account.' };
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
            ...(updates?.bio !== undefined ? { bio: updates.bio } : {}),
            ...(updates?.phone !== undefined ? { phone: updates.phone } : {}),
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

      // Sends a password-recovery email. Supabase always responds with
      // success here regardless of whether the address has an account
      // (prevents leaking which emails are registered), so the UI can only
      // ever show one generic "check your inbox" message — never confirm or
      // deny that an account exists for what was typed.
      requestPasswordReset: async (email) => {
        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          throw new Error(NOT_CONNECTED_MESSAGE);
        }

        const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
          redirectTo: APP_URL ? `${APP_URL}/auth/reset-password` : undefined,
        });
        if (error) {
          throw new Error(describeAuthError(error, { action: 'sending your password reset email' }));
        }
      },

      // Real Supabase Auth login credentials — distinct from updateUser
      // above, which only ever writes to the profiles table's own `email`
      // column (a display copy). Changing the actual sign-in email/password
      // has to go through auth.updateUser; Supabase emails a confirmation
      // link to the new address and the change only takes effect once the
      // user clicks it, so the profiles row is intentionally left alone here
      // — updating it immediately would show an email the user can't yet
      // sign in with.
      updateCredentials: async ({ email, password } = {}) => {
        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          throw new Error(NOT_CONNECTED_MESSAGE);
        }

        const payload = {};
        if (email) payload.email = email;
        if (password) payload.password = password;
        if (Object.keys(payload).length === 0) return null;

        const { data, error } = await supabase.auth.updateUser(payload);
        if (error) {
          throw new Error(describeAuthError(error, { action: 'updating your email or password' }));
        }
        return data;
      },

      // Stores at avatars/<userId>/... so the storage RLS policy (schema.sql)
      // can scope each signed-in user to writing only their own folder.
      uploadAvatar: async (userId, file) => {
        if (!SUPABASE_AUTH_ENABLED || !supabase) {
          throw new Error(NOT_CONNECTED_MESSAGE);
        }
        if (!userId || !file) {
          throw new Error('Missing user or file to upload.');
        }

        const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${userId}/avatar-${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, file, { upsert: true, cacheControl: '3600' });
        if (uploadError) {
          throw new Error(uploadError.message || 'Unable to upload the image.');
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) {
          throw new Error('Unable to generate a public URL for the uploaded image.');
        }

        await get().updateUser(userId, { avatarUrl: publicUrl });
        return publicUrl;
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
        // Invalidate any onAuthStateChange invocation already in flight
        // (e.g. a periodic token refresh) before signOut() even starts, so
        // it can never resolve later and revive the session we're about
        // to clear — see the comment on authCallbackVersion above.
        authCallbackVersion += 1;

        if (SUPABASE_AUTH_ENABLED && supabase) {
          // Never let a slow or stuck signOut keep the user on screen as
          // signed in; the local session is cleared below either way.
          await Promise.race([
            supabase.auth.signOut().catch(() => supabase.auth.signOut({ scope: 'local' }).catch(() => {})),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
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

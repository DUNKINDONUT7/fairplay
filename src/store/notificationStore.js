import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [String(value)];
}

function normalizeNotification(notification = {}) {
  const metadata = notification.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : {};
  const id = String(notification.id || `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const title = notification.title || metadata.title || 'FairPlay notification';
  const message = notification.message || metadata.message || title;

  return {
    id,
    title,
    message,
    type: notification.type || metadata.type || 'info',
    category: notification.category || metadata.category || 'system',
    read: Boolean(notification.read || notification.is_read),
    time: notification.time || notification.created_at || new Date().toISOString(),
    targetRoles: normalizeList(notification.targetRoles || notification.target_roles || metadata.targetRoles),
    targetUserIds: normalizeList(notification.targetUserIds || notification.target_user_ids || metadata.targetUserIds),
    targetEmails: normalizeList(notification.targetEmails || notification.target_emails || metadata.targetEmails).map((email) => email.toLowerCase()),
    sourceKey: notification.sourceKey || notification.source_key || metadata.sourceKey || id,
    entityType: notification.entityType || notification.entity_type || metadata.entityType || '',
    entityId: notification.entityId || notification.entity_id || metadata.entityId || '',
    actionUrl: notification.actionUrl || notification.action_url || metadata.actionUrl || '',
    metadata,
  };
}

function isNotificationForUser(notification, user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  const userId = String(user.id || '');
  const email = String(user.email || '').toLowerCase();
  const roles = notification.targetRoles || [];
  const userIds = notification.targetUserIds || [];
  const emails = notification.targetEmails || [];

  if (roles.includes('all')) return true;
  if (role && roles.includes(role)) return true;
  if (userId && userIds.map(String).includes(userId)) return true;
  if (email && emails.map(String).map((value) => value.toLowerCase()).includes(email)) return true;

  return false;
}

function upsertNotificationList(list, notification) {
  const normalized = normalizeNotification(notification);
  const filtered = list.filter((entry) =>
    String(entry.id) !== String(normalized.id) &&
    (!normalized.sourceKey || String(entry.sourceKey) !== String(normalized.sourceKey))
  );
  return [normalized, ...filtered].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 120);
}

async function insertNotification(notification) {
  const normalized = normalizeNotification(notification);

  if (!isSupabaseConfigured || !supabase) {
    return normalized;
  }

  const payload = {
    id: normalized.id,
    title: normalized.title,
    message: normalized.message,
    type: normalized.type,
    category: normalized.category,
    target_roles: normalized.targetRoles,
    target_user_ids: normalized.targetUserIds,
    target_emails: normalized.targetEmails,
    source_key: normalized.sourceKey,
    entity_type: normalized.entityType,
    entity_id: String(normalized.entityId || ''),
    action_url: normalized.actionUrl,
    is_read: false,
    metadata: {
      ...normalized.metadata,
      title: normalized.title,
      message: normalized.message,
      type: normalized.type,
      category: normalized.category,
      targetRoles: normalized.targetRoles,
      targetUserIds: normalized.targetUserIds,
      targetEmails: normalized.targetEmails,
      sourceKey: normalized.sourceKey,
      entityType: normalized.entityType,
      entityId: normalized.entityId,
      actionUrl: normalized.actionUrl,
    },
    created_at: normalized.time,
  };

  const { data, error } = await supabase
    .from('notifications')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeNotification(data || normalized);
}

const useNotificationStore = create(
  persist(
    (set, get) => ({
      notifications: [],
      toasts: [],
      realtimeChannel: null,

      addToast: (message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random();
        set((state) => ({
          toasts: [...state.toasts, { id, message, type, duration }],
        }));
        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }));
          }, duration);
        }
        return id;
      },

      success: (message) => get().addToast(message, 'success'),
      error: (message) => get().addToast(message, 'error', 5000),
      info: (message) => get().addToast(message, 'info'),
      warning: (message) => get().addToast(message, 'warning', 4000),

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      addNotification: (notification) => {
        const normalized = normalizeNotification(notification);
        set((state) => ({
          notifications: upsertNotificationList(state.notifications, normalized),
        }));
        return normalized;
      },

      createSystemNotification: async (notification) => {
        const optimistic = get().addNotification(notification);

        try {
          const saved = await insertNotification(optimistic);
          set((state) => ({
            notifications: upsertNotificationList(state.notifications, saved),
          }));
          return saved;
        } catch (error) {
          console.warn('Notification saved locally only:', error?.message || error);
          return optimistic;
        }
      },

      notifyEventCreated: async (event) => {
        if (!event?.id) return null;
        const title = event.title || event.name || 'New event';
        return get().createSystemNotification({
          title: 'New event created',
          message: `${title} was created by ${event.organizerEmail || 'an organizer'}.`,
          type: 'success',
          category: 'event-created',
          targetRoles: ['admin'],
          targetUserIds: [event.organizerAuthProfileId].filter(Boolean),
          targetEmails: [event.organizerEmail].filter(Boolean),
          sourceKey: `event-created:${event.id}`,
          entityType: 'event',
          entityId: event.id,
          actionUrl: '/admin',
          metadata: {
            eventTitle: title,
            organizerEmail: event.organizerEmail || '',
          },
        });
      },

      notifyNewEventAvailable: async (event) => {
        if (!event?.id) return null;
        const title = event.title || event.name || 'A new event';
        return get().createSystemNotification({
          title: 'New event published',
          message: `${title} is now open. Check it out and register if you're interested.`,
          type: 'info',
          category: 'event-published',
          targetRoles: ['participant'],
          sourceKey: `event-published:${event.id}`,
          entityType: 'event',
          entityId: event.id,
          actionUrl: '/participant/events',
          metadata: {
            eventTitle: title,
          },
        });
      },

      notifyScoreSubmitted: async (score, event = null, action = 'submitted') => {
        const eventId = score?.eventId || score?.event_id || event?.id;
        const contestantName = score?.contestantName || score?.contestant_name || 'a contestant';
        const judgeName = score?.judgeName || score?.judge_name || 'A judge';
        const eventTitle = score?.eventTitle || score?.event_title || event?.title || 'an event';
        const sourceKey = `score-${action}:${eventId}:${score?.judgeId || score?.judge_id || judgeName}:${score?.contestantId || score?.contestant_id || contestantName}`;

        return get().createSystemNotification({
          title: action === 'updated' ? 'Judge updated a score' : 'Judge submitted scores',
          message: `${judgeName} ${action === 'updated' ? 'updated' : 'submitted'} scores for ${contestantName} in ${eventTitle}.`,
          type: 'info',
          category: 'score-submission',
          targetUserIds: [event?.organizerAuthProfileId].filter(Boolean),
          targetEmails: [event?.organizerEmail].filter(Boolean),
          sourceKey,
          entityType: 'score',
          entityId: score?.id || sourceKey,
          actionUrl: eventId ? `/organizer/scoring?eventId=${eventId}` : '/organizer/scoring',
          metadata: {
            eventId,
            eventTitle,
            contestantName,
            judgeName,
            action,
          },
        });
      },

      notifyRegistrationSubmitted: async (registration, event = null) => {
        if (!registration?.id) return null;
        const participantName = registration.participantName || registration.teamName || 'A participant';
        const eventTitle = event?.title || registration.category || 'an event';
        return get().createSystemNotification({
          title: registration.registrationType === 'team' ? 'New team registration' : 'New registration',
          message: `${participantName} registered for ${eventTitle}.`,
          type: 'info',
          category: 'registration',
          targetRoles: ['admin', 'organizer'],
          targetUserIds: [event?.organizerAuthProfileId].filter(Boolean),
          targetEmails: [event?.organizerEmail].filter(Boolean),
          sourceKey: `registration-submitted:${registration.id}`,
          entityType: 'registration',
          entityId: registration.id,
          actionUrl: event?.id ? `/organizer/events/${event.id}` : '/organizer/events',
          metadata: {
            eventId: registration.eventId,
            eventTitle,
            participantName,
            registrationType: registration.registrationType,
          },
        });
      },

      notifyRegistrationConfirmed: async (registration, event = null) => {
        if (!registration?.id || !registration?.email) return null;
        const eventTitle = event?.title || registration.category || 'the event';
        return get().createSystemNotification({
          title: 'Registration confirmed',
          message: `You're registered for ${eventTitle}. The organizer will reach out with further details.`,
          type: 'success',
          category: 'registration-confirmed',
          targetEmails: [registration.email],
          sourceKey: `registration-confirmed:${registration.id}`,
          entityType: 'registration',
          entityId: registration.id,
          actionUrl: '/participant/schedule',
          metadata: {
            eventId: registration.eventId,
            eventTitle,
            registrationType: registration.registrationType,
          },
        });
      },

      notifyJudgeInvited: async (invite, event = null) => {
        if (!invite?.id && !invite?.token) return null;
        const eventTitle = event?.title || invite.eventTitle || 'an event';
        return get().createSystemNotification({
          title: 'Judge invite sent',
          message: `An invite was sent to ${invite.judgeEmail || invite.judgeName || 'a judge'} for ${eventTitle}.`,
          type: 'info',
          category: 'judges',
          targetRoles: ['admin', 'organizer'],
          targetUserIds: [event?.organizerAuthProfileId].filter(Boolean),
          targetEmails: [event?.organizerEmail].filter(Boolean),
          sourceKey: `judge-invite-sent:${invite.id || invite.token}`,
          entityType: 'judge-invite',
          entityId: invite.id || invite.token,
          actionUrl: event?.id ? `/organizer/events/${event.id}` : '/organizer/events',
          metadata: {
            eventId: event?.id,
            eventTitle,
            judgeEmail: invite.judgeEmail,
            judgeName: invite.judgeName,
          },
        });
      },

      notifyBracketPublished: async (tournament, event = null) => {
        if (!tournament?.id) return null;
        const title = tournament.title || tournament.name || event?.title || 'Tournament';
        return get().createSystemNotification({
          title: 'Bracket published',
          message: `${title} bracket is now visible to participants and the public.`,
          type: 'success',
          category: 'tournament',
          targetRoles: ['admin', 'organizer'],
          targetUserIds: [event?.organizerAuthProfileId].filter(Boolean),
          targetEmails: [event?.organizerEmail].filter(Boolean),
          sourceKey: `bracket-published:${tournament.id}:${tournament.publishedAt || ''}`,
          entityType: 'tournament',
          entityId: tournament.id,
          actionUrl: tournament.eventId ? `/events/${tournament.eventId}/brackets` : '/organizer/brackets',
          metadata: {
            eventId: tournament.eventId,
            tournamentTitle: title,
          },
        });
      },

      notifyCertificateReady: async (certificate) => {
        if (!certificate?.id) return null;
        const eventId = certificate.eventId;
        return get().createSystemNotification({
          title: 'Your certificate is ready',
          message: `Your certificate for ${certificate.eventTitle || 'your event'} is ready to view and download.`,
          type: 'success',
          category: 'certificate-ready',
          targetEmails: [certificate.recipientEmail].filter(Boolean),
          sourceKey: `certificate-ready:${certificate.id}`,
          entityType: 'certificate',
          entityId: certificate.id,
          actionUrl: `/certificates/${certificate.verificationCode}`,
          metadata: {
            eventId,
            eventTitle: certificate.eventTitle,
            recipientName: certificate.recipientName,
            verificationCode: certificate.verificationCode,
          },
        });
      },

      loadNotifications: async (user) => {
        if (!isSupabaseConfigured || !supabase) {
          return get().getNotificationsForUser(user);
        }

        try {
          const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(120);

          if (error) throw error;

          const normalized = (data || []).map(normalizeNotification);
          set((state) => {
            const merged = normalized.reduce((list, notification) => upsertNotificationList(list, notification), state.notifications);
            return { notifications: merged };
          });

          return get().getNotificationsForUser(user);
        } catch (error) {
          console.warn('Unable to load notifications:', error?.message || error);
          return get().getNotificationsForUser(user);
        }
      },

      subscribeToNotifications: (user) => {
        const currentChannel = get().realtimeChannel;
        if (currentChannel && supabase) {
          supabase.removeChannel(currentChannel);
        }

        if (!isSupabaseConfigured || !supabase || !user) {
          set({ realtimeChannel: null });
          return () => {};
        }

        const channel = supabase
          .channel(`fairplay-notifications-${user.id || user.email || Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'notifications' },
            (payload) => {
              if (payload.eventType === 'DELETE') {
                const deletedId = payload.old?.id;
                if (deletedId) get().removeNotification(deletedId);
                return;
              }

              const notification = normalizeNotification(payload.new);
              if (isNotificationForUser(notification, user)) {
                get().addNotification(notification);
                if (!notification.read) {
                  get().info(notification.title || notification.message);
                }
              }
            }
          )
          .subscribe();

        set({ realtimeChannel: channel });
        return () => {
          supabase.removeChannel(channel);
          if (get().realtimeChannel === channel) {
            set({ realtimeChannel: null });
          }
        };
      },

      getNotificationsForUser: (user) => get().notifications.filter((notification) => isNotificationForUser(notification, user)),

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => String(n.id) !== String(id)),
        }));
      },

      markAsRead: async (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            String(n.id) === String(id) ? { ...n, read: true } : n
          ),
        }));

        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.from('notifications').update({ is_read: true }).eq('id', id);
          } catch {
            // best-effort — local state above already reflects the read status
          }
        }
      },

      markAllAsRead: async (user) => {
        const userNotifications = get().getNotificationsForUser(user);
        const ids = userNotifications.map((notification) => notification.id);

        set((state) => ({
          notifications: state.notifications.map((notification) =>
            ids.includes(notification.id) ? { ...notification, read: true } : notification
          ),
        }));

        if (isSupabaseConfigured && supabase && ids.length > 0) {
          try {
            await supabase.from('notifications').update({ is_read: true }).in('id', ids);
          } catch {
            // best-effort — local state above already reflects the read status
          }
        }
      },

      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      name: 'fairplay_notifications',
      partialize: (state) => ({ notifications: state.notifications }),
    }
  )
);

export default useNotificationStore;

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

function createAttendanceId() {
  // Wide random range — QR check-in is bursty by nature (a whole class
  // scanning in within the same second), and a bare timestamp collides.
  return `attendance-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeAttendance(record) {
  return {
    id: record.id || createAttendanceId(),
    eventId: record.eventId || record.event_id || null,
    subEventId: record.subEventId || record.sub_event_id || null,
    attendeeId: record.attendeeId || record.attendee_id || null,
    attendeeName: record.attendeeName || record.attendee_name || 'Unknown',
    attendeeType: record.attendeeType || record.attendee_type || 'participant',
    role: record.role || 'participant',
    qrToken: record.qrToken || record.qr_token || record.metadata?.qrToken || null,
    scannerId: record.scannerId || record.scanner_id || null,
    source: record.source || record.metadata?.source || 'manual',
    notes: record.notes || '',
    checkInStatus: record.checkInStatus || record.check_in_status || 'checked-in',
    checkedInAt: record.checkedInAt || record.checked_in_at || new Date().toISOString(),
    metadata: record.metadata || {},
  };
}

const useAttendanceStore = create(
  persist(
    (set, get) => ({
      attendance: [],
      loading: false,
      error: null,

      fetchAttendance: async (eventId) => {
        set({ loading: true, error: null });

        if (!isSupabaseConfigured) {
          const rows = eventId
            ? get().attendance.filter((row) => String(row.eventId) === String(eventId))
            : get().attendance;
          set({ loading: false });
          return rows;
        }

        try {
          let query = supabase.from('attendance').select('*').order('checked_in_at', { ascending: false });
          if (eventId) {
            query = query.eq('event_id', eventId);
          }
          const { data, error } = await query;
          if (error) throw error;

          const attendance = (data || []).map(normalizeAttendance);
          set({
            attendance,
            loading: false,
            error: null,
          });
          return attendance;
        } catch (error) {
          console.error('Error fetching attendance:', error.message);
          set({ loading: false, error: error.message, attendance: [] });
          return [];
        }
      },

      checkInAttendee: async (payload) => {
        const record = normalizeAttendance(payload);
        const duplicate = get().attendance.find(
          (entry) =>
            String(entry.eventId) === String(record.eventId) &&
            String(entry.attendeeId) === String(record.attendeeId) &&
            entry.checkInStatus === 'checked-in'
        );

        if (duplicate) {
          return {
            ...duplicate,
            duplicate: true,
            message: `${duplicate.attendeeName} is already checked in.`,
          };
        }

        set((state) => ({
          attendance: [record, ...state.attendance.filter((entry) => String(entry.id) !== String(record.id))],
          error: null,
        }));

        if (isSupabaseConfigured) {
          try {
            const { error } = await supabase.from('attendance').upsert([{
              id: record.id,
              event_id: record.eventId,
              sub_event_id: record.subEventId,
              attendee_id: record.attendeeId,
              attendee_name: record.attendeeName,
              attendee_type: record.attendeeType,
              role: record.role,
              qr_token: record.qrToken,
              scanner_id: record.scannerId,
              source: record.source,
              notes: record.notes,
              check_in_status: record.checkInStatus,
              checked_in_at: record.checkedInAt,
              metadata: record.metadata,
            }]);
            if (error) throw error;
          } catch (error) {
            console.error('Error syncing attendance:', error.message);
            set((state) => ({
              attendance: state.attendance.filter((entry) => String(entry.id) !== String(record.id)),
              error: error.message,
            }));
            throw error;
          }
        }

        return record;
      },

      bulkAudienceCheckIn: async ({ eventId, subEventId = null, count = 0, source = 'manual' }) => {
        const created = [];
        for (let index = 0; index < count; index += 1) {
          const record = await get().checkInAttendee({
            id: `audience-${eventId}-${subEventId || 'general'}-${Date.now()}-${index}`,
            eventId,
            subEventId,
            attendeeId: `audience-${Date.now()}-${index}`,
            attendeeName: `Audience ${index + 1}`,
            attendeeType: 'audience',
            role: 'audience',
            source,
            metadata: { source },
          });
          created.push(record);
        }
        return created;
      },

      getAttendanceByEvent: (eventId) =>
        get().attendance.filter((row) => String(row.eventId) === String(eventId)),

      getAttendanceSummary: (eventId, subEventId = null) => {
        const rows = get().attendance.filter((row) => {
          const matchesEvent = String(row.eventId) === String(eventId);
          const matchesSubEvent = subEventId ? String(row.subEventId) === String(subEventId) : true;
          return matchesEvent && matchesSubEvent;
        });

        return {
          total: rows.length,
          participants: rows.filter((row) => row.attendeeType === 'participant').length,
          audience: rows.filter((row) => row.attendeeType === 'audience').length,
          judges: rows.filter((row) => row.attendeeType === 'judge').length,
          latestCheckIn: rows[0]?.checkedInAt || null,
        };
      },
    }),
    {
      name: 'fairplay_attendance',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            attendance: currentState.attendance,
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

export default useAttendanceStore;

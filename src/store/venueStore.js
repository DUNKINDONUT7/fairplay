import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import { getBusinessActorId, matchesActorIdentity } from '../utils/identity';

function createVenueId() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function normalizeVenue(record) {
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};

  return {
    id: record.id || createVenueId(),
    name: record.name || metadata.name || 'Untitled Venue',
    location: record.venue || metadata.location || '',
    address: record.address || metadata.address || '',
    capacity: Number(metadata.capacity || record.capacity || 0),
    status: record.status || metadata.status || 'available',
    equipment: Array.isArray(metadata.equipment) ? metadata.equipment : [],
    subVenues: Array.isArray(metadata.subVenues) ? metadata.subVenues : [],
    organizerId: metadata.organizerId ?? null,
    organizerAuthProfileId: metadata.organizerAuthProfileId || '',
    organizerEmail: metadata.organizerEmail || '',
    createdAt: record.created_at || metadata.createdAt || new Date().toISOString(),
    updatedAt: record.updated_at || metadata.updatedAt || new Date().toISOString(),
    metadata,
  };
}

function buildVenuePayload(venue) {
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address || venue.location || '',
    venue: venue.location || '',
    status: venue.status,
    metadata: {
      ...(venue.metadata || {}),
      name: venue.name,
      location: venue.location || '',
      address: venue.address || '',
      capacity: Number(venue.capacity || 0),
      equipment: Array.isArray(venue.equipment) ? venue.equipment : [],
      subVenues: Array.isArray(venue.subVenues) ? venue.subVenues : [],
      organizerId: venue.organizerId ?? null,
      organizerAuthProfileId: venue.organizerAuthProfileId || '',
      organizerEmail: venue.organizerEmail || '',
      createdAt: venue.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

const demoVenues = [
  normalizeVenue({
    id: 1,
    name: 'Main Arena',
    venue: 'Sports Complex',
    status: 'available',
    metadata: {
      capacity: 500,
      equipment: ['Sound System', 'LED Screens', 'Stage'],
      subVenues: [
        { name: 'Warm-Up Area', location: 'North Wing, Sports Complex' },
        { name: 'Locker Rooms', location: 'Ground Floor, Main Arena' },
      ],
    },
  }),
];

const useVenueStore = create(
  persist(
    (set, get) => ({
      venues: isSupabaseConfigured ? [] : demoVenues,
      loading: false,
      error: null,

      fetchVenues: async (actor) => {
        set({ loading: true, error: null });

        const organizerBusinessId = getBusinessActorId(actor);
        if (!isSupabaseConfigured) {
          const filtered = get().venues.filter((venue) =>
            organizerBusinessId === null ||
            String(venue.organizerId) === String(organizerBusinessId) ||
            matchesActorIdentity(venue.organizerAuthProfileId, actor) ||
            matchesActorIdentity(venue.organizerEmail, actor)
          );
          set({ loading: false, error: null });
          return filtered;
        }

        try {
          const { data, error } = await supabase.from('event_locations').select('*').order('name');
          if (error) throw error;

          const normalized = (data || []).map(normalizeVenue);
          const filtered = normalized.filter((venue) =>
            organizerBusinessId === null ||
            String(venue.organizerId) === String(organizerBusinessId) ||
            matchesActorIdentity(venue.organizerAuthProfileId, actor) ||
            matchesActorIdentity(venue.organizerEmail, actor)
          );

          set({ venues: filtered, loading: false, error: null });
          return filtered;
        } catch (fetchError) {
          console.error('Error fetching venues:', fetchError.message);
          set({ loading: false, error: fetchError.message, venues: [] });
          return [];
        }
      },

      createVenue: async (data) => {
        const venue = normalizeVenue({
          ...data,
          id: data.id || createVenueId(),
          metadata: data.metadata || {},
        });

        set((state) => ({ venues: [venue, ...state.venues], error: null }));

        if (!isSupabaseConfigured) {
          return venue;
        }

        try {
          const payload = buildVenuePayload(venue);
          const { data: inserted, error } = await supabase.from('event_locations').upsert([payload]).select().single();
          if (error) throw error;

          const normalized = normalizeVenue(inserted || payload);
          set((state) => ({
            venues: state.venues.map((entry) => (String(entry.id) === String(venue.id) ? normalized : entry)),
          }));
          return normalized;
        } catch (createError) {
          console.error('Error creating venue:', createError.message);
          set((state) => ({
            venues: state.venues.filter((entry) => String(entry.id) !== String(venue.id)),
            error: createError.message,
          }));
          return null;
        }
      },

      updateVenue: async (venueId, updates) => {
        const current = get().venues.find((venue) => String(venue.id) === String(venueId));
        if (!current) return null;

        const updatedVenue = normalizeVenue({
          ...current,
          ...updates,
          id: venueId,
          metadata: {
            ...(current.metadata || {}),
            ...(updates.metadata || {}),
          },
        });

        set((state) => ({
          venues: state.venues.map((venue) => (String(venue.id) === String(venueId) ? updatedVenue : venue)),
          error: null,
        }));

        if (!isSupabaseConfigured) {
          return updatedVenue;
        }

        try {
          const { error } = await supabase.from('event_locations').upsert([buildVenuePayload(updatedVenue)]);
          if (error) throw error;
        } catch (updateError) {
          console.error('Error updating venue:', updateError.message);
          set({ error: updateError.message });
        }

        return updatedVenue;
      },

      deleteVenue: async (venueId) => {
        const previous = get().venues;
        set((state) => ({
          venues: state.venues.filter((venue) => String(venue.id) !== String(venueId)),
          error: null,
        }));

        if (!isSupabaseConfigured) {
          return true;
        }

        try {
          const { error } = await supabase.from('event_locations').delete().eq('id', venueId);
          if (error) throw error;
        } catch (deleteError) {
          console.error('Error deleting venue:', deleteError.message);
          set({ venues: previous, error: deleteError.message });
          return false;
        }

        return true;
      },
    }),
    {
      name: 'fairplay_venues',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            venues: currentState.venues,
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

export default useVenueStore;

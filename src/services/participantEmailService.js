import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import useAuthStore from '../store/authStore';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Emails a participant (or a team's contact person) to let them know the
// organizer added them to an event. Throws with a readable message when the
// email can't go out.
export async function sendParticipantAddedEmail({ event, contestant, email }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Emails need FairPlay to be connected to Supabase.');
  }

  // Same reasoning as judge invites: use the access token already in memory
  // instead of asking Supabase Auth for the session again.
  const accessToken = useAuthStore.getState().token;
  if (!accessToken) {
    throw new Error('Your sign-in session has expired. Please sign out and sign back in, then try again.');
  }

  let data;
  let error;
  try {
    ({ data, error } = await supabase.functions.invoke('notify-participant-added', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        eventId: event.id,
        contestantName: contestant.name,
        contestantType: contestant.type === 'team' ? 'team' : 'individual',
        email,
      },
    }));
  } catch (invokeError) {
    const body = await invokeError?.context?.json?.().catch(() => null);
    throw new Error(body?.error || invokeError?.message || 'Unable to reach the email service.');
  }

  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || data?.error || error.message || 'Unable to send the email.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

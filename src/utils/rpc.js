import { isSupabaseConfigured, supabase } from './supabaseClient';

// Error codes the revision functions raise (see supabase/revisions/*.sql).
export const RPC_CODES = {
  NOT_ALLOWED: '42501',
  INVALID: '22023',
  DUPLICATE: '23505',
  RULE: '23514',
  STALE: 'PT409',
};

function isNetworkFailure(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return text.includes('failed to fetch') || text.includes('networkerror') || text.includes('network request failed') || text.includes('load failed');
}

// Calls a database function and throws when it refuses or cannot be reached,
// so callers never show a success that didn't happen. The thrown error keeps
// the database's message (written for people) and its code.
export async function rpcOrThrow(name, params = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('The database is not configured, so nothing was saved.');
  }

  let response;
  try {
    response = await supabase.rpc(name, params);
  } catch (error) {
    const failure = new Error('Could not reach the server, so nothing was saved. Check the connection and try again.');
    failure.code = 'NETWORK';
    failure.cause = error;
    throw failure;
  }

  const { data, error } = response;
  if (error) {
    const failure = new Error(
      isNetworkFailure(error)
        ? 'Could not reach the server, so nothing was saved. Check the connection and try again.'
        : error.code === 'PGRST202'
          ? `The database is missing the "${name}" function. Apply the files in supabase/revisions first.`
          : error.message || 'The server refused this change.'
    );
    failure.code = isNetworkFailure(error) ? 'NETWORK' : error.code;
    failure.details = error.details;
    throw failure;
  }
  return data;
}

export function isStaleError(error) {
  return error?.code === RPC_CODES.STALE;
}

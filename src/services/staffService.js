// Judge and scorer accounts assigned to events (W01 / W10). Every call goes
// through a database function that checks who is asking — see
// supabase/revisions/01_event_staff_and_score_permissions.sql and
// 02_corrections_and_audit.sql.
import { supabase } from '../utils/supabaseClient';
import { buildAppUrl } from '../utils/appUrl';
import { rpcOrThrow } from '../utils/rpc';
import { STAFF_ROLES } from '../utils/staffCsv';

export { STAFF_CSV_TEMPLATE, parseCsvText, validateStaffCsv } from '../utils/staffCsv';

export { STAFF_ROLES };

export const STAFF_STATUS_LABELS = {
  invited: 'Invited — not activated',
  active: 'Active',
  revoked: 'Access revoked',
  replaced: 'Replaced',
};

export const DELIVERY_LABELS = {
  not_sent: 'Invitation not sent yet',
  sent: 'Invitation email sent',
  failed: 'Invitation email failed',
  link_copied: 'Activation link copied',
};

export function normalizeStaff(row = {}) {
  return {
    id: row.id,
    eventId: row.event_id,
    seatId: row.seat_id || row.id,
    subEventId: row.sub_event_id || null,
    subEventName: row.sub_event_name || '',
    role: row.role,
    userId: row.user_id || null,
    email: row.email || '',
    fullName: row.full_name || '',
    status: row.status || 'invited',
    statusReason: row.status_reason || '',
    createdAt: row.created_at || null,
    activatedAt: row.activated_at || null,
    revokedAt: row.revoked_at || null,
    replacesId: row.replaces_id || null,
    replacedById: row.replaced_by_id || null,
    deliveryStatus: row.delivery_status || 'not_sent',
    deliveryError: row.delivery_error || '',
    deliveredAt: row.delivered_at || null,
    importBatch: row.import_batch || null,
  };
}

// Organizer view: everyone ever assigned to the event, newest first.
export async function listEventStaff(eventId) {
  const { data, error } = await supabase
    .from('event_staff')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeStaff);
}

// The signed-in account's own assignments (judge/scorer dashboards).
export async function listMyAssignments() {
  const data = await rpcOrThrow('my_staff_assignments');
  return Array.isArray(data) ? data : [];
}

export async function addStaff(eventId, { role, email, fullName, subEventId = null, subEventName = null }, importBatch = null) {
  return rpcOrThrow('staff_add', {
    p_event_id: Number(eventId),
    p_role: role,
    p_email: email,
    p_full_name: fullName,
    p_sub_event_id: subEventId,
    p_sub_event_name: subEventName,
    p_import_batch: importBatch,
  });
}

export async function getActivationLink(staffId) {
  const token = await rpcOrThrow('staff_invite_token', { p_staff_id: staffId });
  return buildAppUrl(`/staff/activate/${token}`);
}

export async function markDelivery(staffId, status, errorMessage = null) {
  return rpcOrThrow('staff_mark_delivery', { p_staff_id: staffId, p_status: status, p_error: errorMessage });
}

export async function revokeStaff(staffId, reason) {
  return rpcOrThrow('staff_revoke', { p_staff_id: staffId, p_reason: reason });
}

export async function replaceStaff(staffId, { email, fullName }, reason) {
  return rpcOrThrow('staff_replace', { p_staff_id: staffId, p_email: email, p_full_name: fullName, p_reason: reason });
}

export async function previewInvite(token) {
  return rpcOrThrow('staff_invite_preview', { p_token: token });
}

export async function activateInvite(token) {
  return rpcOrThrow('staff_activate', { p_token: token });
}

// Sends the invitation email through the notify-judge-invite Edge Function
// when it is deployed. Whatever happens, the outcome is recorded separately
// from the assignment, so "imported" never reads as "delivered".
export async function sendInvitationEmail(staff, event) {
  const link = await getActivationLink(staff.id);
  try {
    const { data, error } = await supabase.functions.invoke('notify-judge-invite', {
      body: {
        mode: 'staff-activation',
        judgeEmail: staff.email,
        judgeName: staff.fullName,
        role: staff.role,
        eventId: event?.id,
        eventTitle: event?.title || 'FairPlay event',
        startDate: event?.startDate || '',
        startTime: event?.startTime || '',
        endTime: event?.endTime || '',
        location: event?.location || '',
        activationUrl: link,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    await markDelivery(staff.id, 'sent');
    return { sent: true, link };
  } catch (sendError) {
    await markDelivery(staff.id, 'failed', sendError?.message || 'Email could not be sent').catch(() => {});
    return { sent: false, link, error: sendError?.message || 'Email could not be sent' };
  }
}

// Adds each valid row; one failure never stops the rest. Returns a per-row
// report so the organizer sees exactly what was saved.
export async function importStaffRows(eventId, rows) {
  const batch = `csv-${new Date().toISOString()}`;
  const results = [];
  for (const row of rows) {
    try {
      const saved = await addStaff(eventId, row, batch);
      results.push({ ...row, status: 'added', id: saved?.id });
    } catch (error) {
      results.push({ ...row, status: error.code === '23505' ? 'duplicate' : 'failed', error: error.message });
    }
  }
  return results;
}

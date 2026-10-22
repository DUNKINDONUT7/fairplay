// Pure CSV helpers for judge/scorer import (no browser or database imports,
// so they can be tested directly with node --test).

export const STAFF_ROLES = ['judge', 'scorer'];

// ---------------------------------------------------------------------------
// CSV import (W10)
//
// Format (first row is the header; column order does not matter):
//   full_name,email,role,sub_event
//   Maria Santos,maria.santos@school.edu.ph,judge,
//   Juan Dela Cruz,juan.dc@school.edu.ph,scorer,Basketball
// role is "judge" or "scorer"; sub_event is optional (blank = whole event).
// ---------------------------------------------------------------------------

export const STAFF_CSV_TEMPLATE = 'full_name,email,role,sub_event\nMaria Santos,maria.santos@school.edu.ph,judge,\nJuan Dela Cruz,juan.dc@school.edu.ph,scorer,Basketball\n';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// RFC 4180-style parsing: quoted fields may contain commas, quotes ("") and
// line breaks.
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

const HEADER_ALIASES = {
  full_name: ['full_name', 'fullname', 'name', 'full name'],
  email: ['email', 'email address', 'e-mail'],
  role: ['role', 'type'],
  sub_event: ['sub_event', 'subevent', 'sub event', 'category', 'game'],
};

// Checks every row before anything is saved. `existing` is the event's
// current staff, so a person already assigned is reported, not re-added.
export function validateStaffCsv(text, { existing = [], subEvents = [] } = {}) {
  const rows = parseCsvText(text);
  if (rows.length === 0) return { valid: [], invalid: [], error: 'The file is empty.' };

  const header = rows[0].map((cell) => String(cell).trim().toLowerCase());
  const column = {};
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    column[key] = header.findIndex((cell) => aliases.includes(cell));
  });
  const missingColumns = ['full_name', 'email', 'role'].filter((key) => column[key] < 0);
  if (missingColumns.length > 0) {
    return { valid: [], invalid: [], error: `Missing column(s): ${missingColumns.join(', ')}. Use the template: full_name,email,role,sub_event` };
  }

  const live = new Set(
    existing.filter((staff) => ['invited', 'active'].includes(staff.status)).map((staff) => `${staff.role}:${staff.email.toLowerCase()}`)
  );
  const seen = new Map();
  const valid = [];
  const invalid = [];

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (key) => (column[key] >= 0 ? String(cells[column[key]] ?? '').trim() : '');
    const fullName = get('full_name');
    const email = get('email').toLowerCase();
    const role = get('role').toLowerCase();
    const subEventText = get('sub_event');
    const problems = [];

    if (!fullName) problems.push('missing full name');
    if (!email) problems.push('missing email');
    else if (!EMAIL_PATTERN.test(email)) problems.push(`"${email}" is not a valid email`);
    if (!role) problems.push('missing role');
    else if (!STAFF_ROLES.includes(role)) problems.push(`role must be judge or scorer (got "${role}")`);

    let subEvent = null;
    if (subEventText) {
      subEvent = subEvents.find((entry) =>
        String(entry.id) === subEventText || String(entry.name || '').trim().toLowerCase() === subEventText.toLowerCase()
      ) || null;
      if (!subEvent) problems.push(`sub-event "${subEventText}" is not part of this event`);
    }

    const key = `${role}:${email}`;
    if (problems.length === 0 && seen.has(key)) problems.push(`duplicate of row ${seen.get(key)}`);
    if (problems.length === 0 && live.has(key)) problems.push(`already assigned as ${role}`);

    if (problems.length > 0) {
      invalid.push({ line, fullName, email, role, error: problems.join('; ') });
      return;
    }
    seen.set(key, line);
    valid.push({ line, fullName, email, role, subEventId: subEvent ? String(subEvent.id) : null, subEventName: subEvent?.name || null });
  });

  return { valid, invalid, error: '' };
}

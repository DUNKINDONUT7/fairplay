// Creates two ready-to-use demo events in the TEST project, for clicking
// through the web app (or the mobile app) by hand:
//   * "Demo Intramurals Basketball" — 6 teams, single elimination, drawn,
//     scoring open, scorer1@fairplay.test active as scorer
//   * "Demo Search for Ms. Campus" — 4 contestants, rubric, scoring open,
//     judge1 and judge2 active as judges
// Owned by organizer@fairplay.test. Passwords: FAIRPLAY_TEST_PASSWORD in the
// git-ignored .env.test-secrets.local.
//
//   node tests/e2e/setup-demo.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testPassword } from './testSecrets.mjs';
import { generateBracketFor } from '../../src/utils/bracketEngine.js';
import { getBusinessActorId } from '../../src/utils/identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.test.local'), 'utf8').split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
if (env.VITE_SUPABASE_URL.includes('lflwjlgexsghiyiwwzys')) throw new Error('Refusing to run against the live project.');

async function login(email) {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: testPassword() });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}
async function call(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

const organizer = await login('organizer@fairplay.test');
const admin = await login('admin@fairplay.test');
const { data: { user: organizerUser } } = await organizer.auth.getUser();

async function createEvent(id, fields) {
  const { error } = await organizer.from('events').insert({
    id, status: 'draft', start_date: new Date().toISOString(), end_date: new Date(Date.now() + 86400000).toISOString(),
    location: 'University Gym', organizer_id: getBusinessActorId(organizerUser.id),
    metadata: { organizerAuthProfileId: organizerUser.id, organizerEmail: 'organizer@fairplay.test' },
    ...fields,
  });
  if (error) throw new Error(error.message);
  const { error: approveError } = await admin.from('events').update({ status: 'upcoming' }).eq('id', id);
  if (approveError) throw new Error(approveError.message);
}
async function assign(eventId, role, email, name) {
  const added = await call(organizer, 'staff_add', { p_event_id: eventId, p_role: role, p_email: email, p_full_name: name });
  const token = await call(organizer, 'staff_invite_token', { p_staff_id: added.id });
  await call(await login(email), 'staff_activate', { p_token: token });
}
async function openScoring(id) {
  const { data } = await organizer.from('events').select('metadata').eq('id', id).single();
  const { error } = await organizer.from('events').update({ status: 'active', metadata: { ...data.metadata, scoringActive: true } }).eq('id', id);
  if (error) throw new Error(error.message);
}

const base = Date.now();

// Sports
const sportsId = base;
const teams = ['BSIT Titans', 'BSCS Coders', 'BSEd Mentors', 'BSBA Tycoons', 'BSN Healers', 'BSCrim Guardians'].map((name, index) => ({ id: `team-${index + 1}`, name, seed: index + 1, type: 'team', source: 'event' }));
await createEvent(sportsId, {
  title: 'Demo Intramurals Basketball', type: 'sports',
  contestants: teams.map((team) => ({ id: team.id, name: team.name, type: 'team' })), participants: teams.length,
});
await assign(sportsId, 'scorer', 'scorer1@fairplay.test', 'Sam Scorer');
const tournament = await call(organizer, 'tournament_create', {
  p_event_id: sportsId, p_payload: { id: base + 10, name: 'Demo Intramurals Basketball', title: 'Demo Intramurals Basketball', bracket_type: 'single', teams, status: 'active' },
});
const draw = generateBracketFor('single', teams);
await call(organizer, 'tournament_save_draw', {
  p_tournament_id: tournament.id,
  p_payload: { bracket_type: 'single', teams: draw.teams, entrant_snapshot: draw.teams, matches: draw.matches, rounds: draw.rounds, total_rounds: draw.totalRounds, total_slots: draw.totalSlots, byes: draw.byes, current_round: 1, live_status: 'live', status: 'active', champion: {} },
  p_expected_revision: tournament.revision,
});
await openScoring(sportsId);

// Pageant
const pageantId = base + 1;
await createEvent(pageantId, {
  title: 'Demo Search for Ms. Campus', type: 'pageant',
  criteria: [
    { id: 'talent', name: 'Talent', weight: 40, scoringRange: '1-10', description: 'Skill and stage presence' },
    { id: 'poise', name: 'Poise', weight: 30, scoringRange: '1-10', description: 'Confidence and bearing' },
    { id: 'qa', name: 'Q&A', weight: 30, scoringRange: '1-10', description: 'Clarity and substance' },
  ],
  contestants: ['Ana Reyes', 'Bea Santos', 'Carla Diaz', 'Dana Lim'].map((name, index) => ({ id: `c${index + 1}`, name, type: 'individual' })),
  participants: 4,
});
await assign(pageantId, 'judge', 'judge1@fairplay.test', 'Jenny Judge');
await assign(pageantId, 'judge', 'judge2@fairplay.test', 'Jake Judge');
await openScoring(pageantId);

console.log(`Basketball event: /organizer/events/${sportsId}  (scorer: /scorer/events/${sportsId})`);
console.log(`Pageant event:    /organizer/events/${pageantId}  (judge: /judge/events/${pageantId})`);

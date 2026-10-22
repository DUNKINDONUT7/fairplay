# Database revisions (panel items W01–W12)

These files move every sensitive rule into the database, so it holds for the
web app, the mobile app and any direct API call alike. Apply them **in order**,
after `supabase/schema.sql` and `supabase/finalized-results-lock.sql`. Every
file is safe to run again.

| File | Panel items | What it adds |
|---|---|---|
| `01_event_staff_and_score_permissions.sql` | W01, W02, W10, W12 | Judge/scorer accounts per event (`event_staff`), single-use activation links, `submit_judge_score` (only an ACTIVE judge of the event, only while scoring is open, every criterion inside its range, total computed by the database), rubric versions frozen once scoring starts. Direct writes to `scores` are revoked. |
| `02_corrections_and_audit.sql` | W03, W04, W10 | `result_changes` log (old value, new value, reason, actor, time; PHT view `result_changes_ph`), judge-sheet correction and void (organizer, with reason), staff revoke and replace (logged; a replacement keeps the judging seat). |
| `03_tournament_controls.sql` | W01, W03, W05, W06 | All bracket writes go through functions: draw (organizer; a redraw after the official pairing or after results needs a reason and is logged), record result (ACTIVE scorer only; saved results cannot be changed by a scorer; retries never duplicate), correct/undo (organizer, reason, logged), finalize. A trigger refuses any champion while a match is unfinished. Direct writes to `tournaments` are revoked. |

## Applying

```powershell
# Session pooler connection string from Supabase Dashboard → Connect
$env:SUPABASE_DB_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
node scripts/apply-revisions.mjs --fresh   # brand-new project: schema.sql first
node scripts/apply-revisions.mjs           # existing project: revisions only
```

Test the rules offline first (no Supabase needed): `npm test`. The files in
`tests/db/` run these exact SQL files on an in-memory Postgres and act as each
role (organizer, judge, scorer, student, anonymous).

## For the mobile app

Read tables as before, but **write through these functions** (`supabase.rpc(name, params)`); direct inserts/updates on `scores` and `tournaments` are refused.

| Action | Function | Who |
|---|---|---|
| My judge/scorer assignments | `my_staff_assignments()` | signed-in account |
| Activate an invitation | `staff_activate(p_token)` | the invited email, signed in |
| Submit / update a judge sheet | `submit_judge_score(p_event_id, p_contestant_id, p_criteria_scores, p_comments, p_remarks, p_round_name)` | active judge |
| Mark my sheets final | `lock_my_judge_scores(p_event_id, p_contestant_id)` | active judge |
| Record a match result | `tournament_record_result(p_tournament_id, p_match_id, p_payload, p_expected_revision)` | active scorer |
| Correct / undo a result | `tournament_correct_result(..., p_reason, p_kind)`, `correct_judge_score`, `void_judge_score` | event organizer |

Errors come back with a readable message and a code: `42501` not allowed,
`22023` invalid input, `23505` duplicate, `23514` rule not met (e.g. champion
before every match is played), `PT409` (HTTP 409) someone else saved first — reload and retry.

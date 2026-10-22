# Acceptance test record — web, phases 1–2

- **Application version:** 027c5b1 + uncommitted revision changes
- **Run at:** 10/22/2026, 6:59:18 PM PHT
- **Environment:** Supabase test project (aaeqjhkozczzvbavzgfq), real API requests from Node v24.13.0
- **Initial state:** fresh approved events "Acceptance Pageant 1792666748502" (3 contestants, rubric Talent 40 / Poise 30 / Q&A 30) and "Acceptance Basketball 1792666748502" (5 teams, single elimination); seeded accounts
- **Result:** 41 of 41 passed

| # | Item | Account | Action / input | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| 1 | W10 | judge2@fairplay.test | Open judge1's activation link while signed in as judge2 | Refused — link belongs to another email | Refused: "This invitation was sent to judge1@fairplay.test. Sign in with that email address." | PASS |
| 2 | W10 | judge1@fairplay.test | Activate own invitation | Assignment becomes active | Active (judge) | PASS |
| 3 | W10 | judge1@fairplay.test | Re-use the same activation link | No second activation (single-use) | Refused: "This activation link is invalid." | PASS |
| 4 | W01 | organizer2@fairplay.test | Assign a judge to an event owned by another organizer | Refused | Refused: "Only the event organizer can assign judges or scorers." | PASS |
| 5 | W01 | judge1@fairplay.test | Submit a score before the organizer opens scoring | Refused — scoring not open | Refused: "Scoring is not open for this event." | PASS |
| 6 | W01/W02 | judge1@fairplay.test | Submit Talent 8, Poise 7, Q&A 9 for Ana | Saved; total = (8×40+7×30+9×30)/100 = 8.00 | Saved, total 8 | PASS |
| 7 | W01 | organizer@fairplay.test | Organizer submits a judge score | Refused — not an assigned judge | Refused: "You are not an active judge for this event, so you cannot submit scores here." | PASS |
| 8 | W01 | judge2@fairplay.test | Unassigned judge submits a score | Refused — not assigned to this event | Refused: "You are not an active judge for this event, so you cannot submit scores here." | PASS |
| 9 | W01 | student1@fairplay.test | Student inserts a score row directly into the table | Refused — no direct table writes | Refused: "permission denied for table scores" | PASS |
| 10 | W01 | anonymous (not signed in) | Update a score row directly | Refused | Refused: "permission denied for table scores" | PASS |
| 11 | W02 | judge1@fairplay.test | Submit Talent 11 (range is 1–10) | Refused — out of range | Refused: "The score for "Talent" must be between 1 and 10." | PASS |
| 12 | W02 | judge1@fairplay.test | Submit without a Q&A score | Refused — missing criterion | Refused: "Missing a score for "Q&A"." | PASS |
| 13 | W03 | judge1@fairplay.test | Change a sheet already submitted as final | Refused — needs organizer correction | Refused: "This score was already submitted as final. Ask the organizer for a correction." | PASS |
| 14 | W03 | organizer@fairplay.test | Correct the sheet without a reason | Refused — reason required | Refused: "A reason (at least 5 characters) is required for this change." | PASS |
| 15 | W03 | organizer@fairplay.test | Correct Talent 8 → 9 with reason "Judge misread row" | Saved; new total 8.40, judge keeps credit | Total 8.4, judge Jenny Judge | PASS |
| 16 | W04 | organizer@fairplay.test | Find the correction in the change log | Entry with old/new totals, reason, actor and PHT time within a minute of the change | 2026-10-22 18:59:11 PHT · organizer@fairplay.test · 8 → 8.4 · "Judge misread row" | PASS |
| 17 | W04 | organizer2@fairplay.test | Read another organizer's change log | Nothing visible | 0 rows visible | PASS |
| 18 | W10 | judge2@fairplay.test | Replaced judge tries to score again | Refused — access removed | Refused: "You are not an active judge for this event, so you cannot submit scores here." | PASS |
| 19 | W10 | judge3@fairplay.test | Replacement judge scores Cy | Saved under judge3, same seat as judge2 | judge Joy Replacement-Judge, seat kept | PASS |
| 20 | W10 | organizer@fairplay.test | Judge2's earlier sheet after replacement | Still on record, attributed to judge2 | Jake Judge | PASS |
| 21 | W12 | admin@fairplay.test | Change rubric weights after scoring started | Refused — rubric frozen | Refused: "Judging has started for this event, so its rubric can no longer change." | PASS |
| 22 | W06 | organizer@fairplay.test | First draw of the approved event (the official pairing) | Saved; no reason needed for the first draw | 7 matches, draw #1 | PASS |
| 23 | W06 | organizer@fairplay.test | Reshuffle (redraw) after the official pairing, no reason | Refused — redraw needs a reason | Refused: "A reason (at least 5 characters) is required for this change." | PASS |
| 24 | W06 | organizer@fairplay.test | Redraw with reason "Seeding error corrected" | Saved; old pairings kept in the change log | draw #2, 1 log entry with old pairings | PASS |
| 25 | Test 9 | organizer@fairplay.test | Save the draw from an out-of-date screen | Refused quickly (HTTP 409); nothing overwritten | Refused: "This bracket was changed by someone else a moment ago. Reload it and try again. (108 ms)" | PASS |
| 26 | W05 | organizer@fairplay.test | Odd entrant count (5) after the draw | 3 byes, no champion | 3 byes, champion {} | PASS |
| 27 | W01 | scorer1@fairplay.test | Record a result before scoring opens | Refused | Refused: "Scoring is not open for this event." | PASS |
| 28 | W01 | organizer@fairplay.test | Organizer records a match result | Refused — only assigned scorers | Refused: "You are not an active scorer for this event, so you cannot record its results." | PASS |
| 29 | W01 | scorer2@fairplay.test | Scorer not assigned to this event records a result | Refused | Refused: "You are not an active scorer for this event, so you cannot record its results." | PASS |
| 30 | W01 | scorer1@fairplay.test | Record Hawks 3 – 1 Eagles | Saved | Saved (revision 3) | PASS |
| 31 | Test 9 | scorer1@fairplay.test | Retry the same save (reply was lost) | No duplicate; reported as already saved | alreadySaved=true, 1 entry | PASS |
| 32 | Test 9 | scorer1@fairplay.test | Save while the server is unreachable | Error shown; nothing saved | Error "TypeError: fetch failed", revision unchanged (3) | PASS |
| 33 | W03 | scorer1@fairplay.test | Change the saved result to 0 – 5 | Refused — only the organizer can correct | Refused: "This match already has a saved result. Only the organizer can correct it." | PASS |
| 34 | W05 | scorer1@fairplay.test | Play every remaining match | No champion until the last match; champion after it | No early champion; champion Falcons | PASS |
| 35 | W05 | organizer@fairplay.test | Forge a champion directly in the table | Refused | Refused: "permission denied for table tournaments" | PASS |
| 36 | W03 | organizer@fairplay.test | Correct the final to 2 – 4 with reason | Champion switches; logged with old and new | Champion now Ravens | PASS |
| 37 | W03 | organizer@fairplay.test | Undo the final with reason | Final reopened, champion removed | Champion {} | PASS |
| 38 | W05 | organizer@fairplay.test | Finalize with the final unplayed | Refused | Refused: "Every match must have a saved result before the results can be finalized." | PASS |
| 39 | W05 | organizer@fairplay.test | Finalize after every match is played | Finalized | Finalized, champion Falcons | PASS |
| 40 | W05 | organizer@fairplay.test | Correct a result after finalization | Refused — results are permanent | Refused: "This bracket has been finalized. Its results can no longer be changed." | PASS |
| 41 | W04 | admin@fairplay.test | Admin filters the log for this bracket | Redraw, correction, undo and finalize entries present | redraw, match_correction, match_undo, finalize | PASS |

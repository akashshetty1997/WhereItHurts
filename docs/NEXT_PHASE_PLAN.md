# WhereItHurts: Next Phase Plan (Tasks A, 0, 1, 4, 5)

Hand-off plan for the coding agent. Put this file at `docs/NEXT_PHASE_PLAN.md`. Read `CLAUDE.md`, `README.md` and `docs/PLAN.md` first.

## Ground rules (apply to every task)

- **No paid services.** No new API keys, hosted APIs, or paid SDKs. The LLM stays on `LLM_PROVIDER=claude_code` (or `off`). Speech stays local (Parakeet + TitaNet).
- **Never diagnose.** No condition names, no causes, no "normal" ranges. Targets and exercises come only from the PT. The app records and shows; it never interprets.
- **Additive only.** Everything that works today keeps working. New features sit beside existing ones.
- **Follow `CLAUDE.md` conventions:** one branch and one pull request per task below, never commit to `main`, load the `apple-design` skill for any UI work, keep the Tailwind tokens and shadcn components, respect Reduce Motion.
- **Privacy:** no real patient data. Audio and transcripts are never logged, as today.
- **Left and right always mean the patient's side.**
- **Ask before** changing the visit data shape in a breaking way, adding a dependency, or touching the backend beyond what a task below describes (Tasks A3 and 1 include backend changes).

## Parked (do not build now)

- **Multilingual visits and summaries.**
- **Measured range of motion with the webcam** and the **home exercise program** (the earlier Tasks 2 and 3). Task numbers below keep their original numbers so they match earlier discussions.
- **Future scope, final phase:** full-body symmetric regions; server-stored visit history; patient–PT data sharing through accounts; full deployment with a hosted backend and the Claude API.

- **Both sides for every body area** is part of the full-body work above. Task A only stops the app from guessing a side.
- **Clinic-facing deployment test:** once deployed, test the exact URL from a fresh device: sign in, complete intake, record or type a visit, correct an observation, and print both reports.

Design new code so these slot in later. In particular, keep all storage behind one module so server storage can replace it, and never hard-code the 7 region ids in new logic; read them from `src/regions.js`.

## Build order

| # | Task | Why this order |
| --- | --- | --- |
| A | Record accuracy: corrections, coverage review, no guessed sides | The record must be trustworthy before anything builds on it |
| 0 | Visit history (in the browser), with real visit ids and dates | Task 4 needs past visits |
| 1 | Auto-follow: the body follows the PT | Quickest win, no dependencies |
| 4 | Pre-visit brief for the PT | Reads past visits from Task 0 |
| 5 | UX and design pass | Runs across the app; start the audit early, finish last |

---

## Task A: Record accuracy (do this first)

**Why first:** the app asks the patient to verify the record, so the record must never show something the patient disputed as fact, must not mark a concern as covered just because a word was said, and must not guess a side.

### A1. Patient corrections

**Today:** in `src/panels/VisitWrapUp.jsx` (`ConfirmChecks`), the patient can press Not Quite, which only sets `confirmed: false`. The PT Report shows "No, disagrees", but the Take-Home Summary in `src/panels/Report.jsx` still prints every before/after pair as fact ("your shoulder went from 5 to 2").

**Build:**

- **Data:** add an optional `correction` to each observation: `{ status: 'requested' | 'resolved', patientVersion: { before?, after?, region?, text? }, note?, requestedAt, resolvedAt?, resolution?: 'accepted' | 'kept_original' }`. Never delete or overwrite the original values; both versions stay in the record.
- **Patient side:** Not Quite opens a short form: what's wrong? The numbers (before and after, 0–10), the body part (region picker, plus "Not on the list"), or the wording (free text). Saving sets `status: 'requested'`.
- **PT side:** the observation shows "Patient requested a correction" with both versions side by side. The PT can **Accept patient's version** (values update, `resolution: 'accepted'`) or **Keep original** with a required note (`resolution: 'kept_original'`).
- **Everywhere the observation appears** (Confirm cards, PT Summary, Movement Check card, PT Report, Take-Home Summary, and the Task 4 brief): while `requested`, show the badge "Patient requested a correction" and both versions. The Take-Home Summary never states a disputed value as fact: "You said this doesn't match. You remember 5 → 4. Your PT will review it."
- **Unconfirmed checks** (never asked) appear in the Take-Home Summary labelled "Not confirmed yet."

**Acceptance:**
- Patient presses Not Quite and enters 5 → 4: every screen and both reports show the badge and both versions; the take-home copy uses the wording above.
- PT accepts: the values become 5 → 4 everywhere, and the PT Report notes "corrected by patient, accepted by PT."
- PT keeps the original: both versions and the PT's note stay visible in the PT Report.
- Tests for the correction state changes and for how each report renders each state.

### A2. Coverage review for marked pain and the goal

**Today:** `unmentioned()` in `src/visitStore.js` treats a marked region as covered if it appears in any line, so "Does your knee hurt?" from the PT clears the knee even if the patient never answered. `goalDiscussed()` relies on word overlap.

**Build:**

- New `coverage(visit)` in `src/lib/coverage.js` returning, for each marked region, a suggested status and evidence:
  - `not_discussed`: no line names it.
  - `pt_asked`: only PT lines name it, and no patient answer followed.
  - `patient_responded`: a patient line names it, or the next patient line after a PT line naming it answers (contains a rating, a pain type, yes/no, or a description).
  - `reviewed`: the PT confirmed it by hand.
  - `evidence`: the segment ids that support the suggestion.
- Store the PT's manual choices in `coverageReview: { [region]: { status, note?, at } }`. A manual choice always wins over the suggestion.
- **The amber catch** now flags regions whose final status is `not_discussed` or `pt_asked`, with different labels ("Never came up" vs "Asked, but the patient didn't answer"). Amber stays reserved for missed pain.
- **PT review list** on the Summary step: one row per marked region and one for the goal, each with the suggested status, the supporting sentence(s) quoted beside it, and buttons to mark Reviewed or change the status.
- **Goal:** `goalDiscussed()` also returns the matching lines as evidence; the PT can confirm or correct it the same way (`goal.review`).
- Keep `unmentioned()` exported and working (other code uses it), implemented on top of `coverage()`.

**Acceptance:**
- PT asks "Does your knee hurt?" and the patient talks about something else: the knee shows "Asked, but the patient didn't answer", with the PT's sentence quoted.
- Patient answers "Yes, about a four": the knee shows `patient_responded` with both sentences.
- PT marks a region Reviewed: the amber flag clears and the reports say "reviewed by PT."
- Tests for each status with sample segment sequences.

### A3. Never guess a side

**Today:** `src/lib/spokenMovement.js` plays the right shoulder for "raise your arm", and the extraction prompt (`backend/app/services/llm/prompt.py`) maps "shoulder" to `right_shoulder` and "knee" to `left_knee`. The full both-sides body is parked; this task only stops the guessing.

**Build:**

- **Extraction:** when a body part is named without a side, return it in a new field `unsided: list[str]` (the region id it would map to) instead of in `regions`. Update the prompt, `keywords.py`, the `Extraction` schema and the backend tests together so the keyword path and Claude agree.
- **Transcript:** an unsided mention shows a chip on that line: "Which side? Right / Left." Picking the side we have a region for adds that region to the line (it glows as usual). Picking a side we don't have yet records a text-only note, `{ part: 'shoulder', side: 'left' }`, shown in the reports as "Left shoulder (mentioned; not shown on the body yet)."
- **Until a side is picked,** the record keeps `side: 'unspecified'`, the reports say "Shoulder (side not said)", and the mention does not count toward coverage of a marked side.
- **Movements:** a PT instruction with no side ("raise your arm") no longer auto-plays. It shows a one-tap chip, "Play Reach Up (right arm)?" Instructions with the matching side keep auto-playing as today.
- The spoken phrase, the avatar and both reports must always agree on the side.

**Acceptance:**
- "My shoulder hurts" adds no region until a side is picked; picking Right lights the right shoulder.
- "Raise your arm" shows the chip; "Raise your right arm" plays immediately.
- Picking Left for the shoulder shows "Left shoulder (mentioned; not shown on the body yet)" in both reports.
- Frontend and backend tests for unsided phrases.

---

## Task 0: Visit history in the browser

**Goal:** finished visits are kept instead of wiped, so later features can compare visits. This is a stand-in for server storage (parked), so keep it behind a small interface.

**Today:** `src/visitStore.js` keeps one visit in localStorage (`whereithurts.visit`); New Visit calls `reset()` and the visit is gone.

**Build:**

- New module `src/lib/history.js`, the only place that touches history storage:
  - `archiveVisit(visit)`: called when a visit is ended and the user starts a New Visit (and on Log Out). Saves a copy with `{ id, endedAt, ownerId, patientKey, visit }`.
  - `listVisits(ownerId)`: newest first.
  - `getLastVisit(ownerId)`.
  - `deleteVisit(id)`.
- Storage key `whereithurts.history`, versioned like `SAVE_VERSION`. Strip anything large before saving (no body-map images). Cap at 50 visits per owner, dropping the oldest. If localStorage fills up, fail quietly as `save()` already does.
- `ownerId` is the logged-in user's id from `useUser()`, or `guest` in Try the Demo.
- Add a small **Past Visits** list (PT and Testing mode) showing date, marked regions and missed pains; clicking one opens it read-only. Read-only means no listening, no editing.
- **Every visit gets its own identity.** Today `emptyVisit()` copies the sample's `visitId: 'live-01'`, so every visit shares one ID. Generate a unique id (`crypto.randomUUID()`) in `emptyVisit()`, and add `startedAt`, `endedAt`, and `status: 'in_progress' | 'ended'`.
- **Patient association:** add a short "Patient" field (initials or a nickname only, no real patient data) at the start of a visit in PT and Testing mode, saved as `patientKey`. Past Visits can be filtered by patient, and switching patients opens that patient's records only.
- **Reports use the visit's own date.** Today `formatDate()` in `Report.jsx` prints the date at print time. Use the visit's `startedAt` (or `endedAt`) instead, so reprinting an old visit keeps its original date.

**Acceptance:**
- End a visit, press New Visit: the finished visit appears in Past Visits and opens read-only with its body marks.
- A refresh mid-visit still restores the current visit, as today.
- Two visits in a row have different ids. Reprinting a visit from an earlier day shows that day's date, not today's.
- With two patients' visits saved, choosing one patient shows only their visits.
- Tests (`node --test`): archive, list order, cap at 50, version mismatch ignored.

---

## Task 1: Auto-follow, the body follows the PT

**Goal:** while the PT explains, the camera moves to the body part being discussed, and naming an anatomy structure opens it, without anyone touching the screen.

**Already in the code:**
- Each spoken line arrives with `speaker` (`pt` or `patient`) and `regions` (`visitStore.onSegment`), and the smart pass adds more later (`onSegmentUpdate`).
- `viewRef.current.focusRegion(region)` in `BodyScene.jsx` flies the camera to a region.
- `showAnatomy(region)` in `src/scene/bodyApi.js` opens Show Anatomy.
- `App.jsx` already auto-plays movements the PT asks for (`spokenMovement`). Leave that logic as is.
- Structure names live in `tools/anatomy/structures.json` (`label`, `anatomical`, `sentence`, `fma`) and in the GLB's `userData`.

**Build:**

1. **Expose two body functions** in `bodyApi.js` and implement them in `BodyScene.jsx`:
   - `focus(region)`: calls the existing `focusRegion`.
   - `showStructure(region, fma)`: opens anatomy for the region if closed, then picks that structure exactly as if the PT clicked it, so the existing structure card appears.
   - `resetView()` already exists on `viewRef`; expose it as `home()`.
2. **Anatomy word list:** extend `tools/anatomy/build.mjs` to also write `src/scene/anatomyTerms.json`: for each structure, `{ fma, region, terms: [label, anatomical, ...synonyms] }`. Add a hand-written `synonyms` field in `structures.json` for common phrases ("rotator cuff" → the four cuff muscles' region, "kneecap", "C1", "collarbone"). Match whole words, case-insensitive, longest phrase first.
3. **Smart pass:** add an optional `structures: list[str]` (FMA ids) to `Extraction` in `backend/app/schemas/extract.py` and to the prompt in `backend/app/services/llm/prompt.py`, so Claude catches paraphrases ("the bone at the top of your arm"). Give the prompt the allowed FMA ids and labels for the regions. Keywords never fill this field. Add a backend test.
4. **The director**, new file `src/scene/autoFollow.js`, started from `App.jsx`:
   - Listens to `onSegment` and `onSegmentUpdate`.
   - Acts only when `mode === 'visit'`, the line's speaker is `pt`, and Auto-follow is on.
   - If the line names a structure (word list or smart pass) and the user can see anatomy (PT or Testing mode): `showStructure(region, fma)`.
   - Otherwise, if the line has regions: `focus(firstRegion)`.
   - **Hold** each view at least 4 seconds; queue at most one pending move and drop older ones.
   - **Manual wins:** any pointer, wheel or keyboard input on the body pauses auto-follow for 10 seconds.
   - **Return home:** after 15 seconds with no new region from the PT, call `home()`, but not while anatomy or a movement simulation is open.
   - Never interrupts a movement simulation that is playing.
5. **UI:** an Auto-follow toggle in the view controls (default on during a visit), and a small status chip on the body, such as "Following: Neck", that says why the camera moved. Respect Reduce Motion (instant cuts instead of flights).

**Acceptance:**
- PT says "Let's look at your neck": the camera moves to the neck within about 1 second of the line appearing.
- PT says "This is your collarbone" in PT mode: anatomy opens and the collarbone card shows. In patient mode, only the camera moves.
- Patient lines never move the camera.
- Three regions in one sentence move the camera once, not three times.
- Dragging the body stops auto-follow from moving for 10 seconds.
- Unit tests for the director with a fake clock: hold time, manual pause, return home, PT-only rule. Test term matching ("rotator cuff" beats "cuff").

---

## Task 4: Pre-visit brief for the PT

**Goal:** one screen the PT reads in about 30 seconds before the patient walks in.

**Build:** a **Brief** view for PT and Testing mode, opened from the start of a visit (Mark Pain step) when a previous visit exists. Every item is clickable and focuses that region on the body (with Task 1 in place, this uses the same `focus(region)` function). Sections, each shown only if it has data:

- **Since last visit:** date of the last visit and how many days ago.
- **Missed last time:** marked pain whose final status in the last visit was "Never came up" or "Asked, but the patient didn't answer" (`coverage(lastVisit)` from Task A).
- **Corrections:** any correction the patient requested that is still unresolved, and side mentions never resolved ("Shoulder, side not said").
- **Goal:** the goal and whether it was discussed last time (`goalDiscussed`).
- **Not confirmed:** movement checks the patient marked "Not quite."
- **Movement checks last time:** each movement the PT tested, with the before and after ratings ("Turn head left: shoulder 5 → 2").
- **Pain arcs last time:** where moving hurt, from `painArcs` (`describePainArc`).
- **Anatomy discussed last time:** structures the PT added to the report (`anatomyNotes`).
- **Follow-ups:** follow-ups proposed last visit (`followUps`).
- **Today vs last time:** regions newly marked, no longer marked, and intensity changes from today's prep.

**Rules:** describe, never interpret. "Shoulder marked 6 last time, 4 today" is fine; "the shoulder is improving" is not. Keep it to one screen without scrolling at projector size; collapse long lists to the top 3 with "show all."

**Acceptance:**
- With a previous visit that had a missed knee and a movement check of 5 → 2, the brief shows both, and clicking the knee focuses it.
- With no previous visit, the Brief button doesn't appear.
- Unit tests for the brief's data builder (`src/lib/brief.js`) from sample visits.

---

## Task 5: UX and design pass

**Goal:** make the app clearer, calmer and easier for both PTs and patients. Start with an audit; change things only after agreeing on the list.

**Step 1, audit (no code changes):** run the app, take screenshots of every step (Mark Pain, Record Your Prep, Record the Visit, Summary, Show Anatomy, movement simulations, reports, login) in light and dark mode at laptop and phone sizes. Review them with the `apple-design` skill and write a short prioritized list of problems with screenshots. Share it before changing anything.

**Known areas to check:**
- **Phone and tablet layout:** `App.jsx` uses a fixed three-column grid (`320px | body | 360px`), which can't work on a phone. Patients will often mark pain and record their prep on a phone. On small screens: body full width, side panels as a bottom sheet or tabs.
- **Typed input fallback (build this, not just check it):** today there is no way to type a line during Record Your Prep or Record the Visit, so if the mic or backend fails, the visit stops. Add a text box with a PT / Patient choice that sends a typed line through the same path as a spoken one (`/api/extract`, then the smart pass), marked as typed in the transcript. If the backend is unreachable, still add the line with no regions and let the user tag body parts by tapping. Typed input must work for the whole visit, including corrections and the review list.
- **Where am I:** a clear step indicator for Mark Pain → Visit → Summary.
- **First-run guidance:** short, dismissible hints for first-time patients and PTs (how to mark pain, how to talk to the app).
- **Empty, loading and error states:** anatomy file loading (3.9 MB), mic permission denied, backend offline, LLM off.
- **Patient vs PT language:** plain words for patients, PT terms beside them for PTs (the pattern `regionLabel` already uses).
- **Accessibility:** contrast, focus order, keyboard paths for every new feature, screen-reader labels on new controls (Auto-follow toggle, Past Visits, Brief), Reduce Motion.
- **Use My Photo:** currently switched off as unreliable. Decide with the team: finish or remove.

**Acceptance:** the agreed audit list is done; a full visit can be completed with typed input only; every new screen from Tasks A, 0, 1 and 4 works at phone size, in both themes, by keyboard, and with Reduce Motion on.

---

## Small refactors allowed along the way

Only when a task touches the code anyway:

- Move movement-check state out of module-level variables in `src/panels/movementLog.js` (`lastRegion`, `lastRating`, `counter`) into the store, since history makes multiple visits normal.
- When adding auto-follow, put the camera logic from `BodyScene.jsx` (1,442 lines) into its own module rather than growing the file further.
- New logic reads region ids from `src/regions.js`; don't add new hard-coded region lists.

## Definition of done for each task

- Its pull request is open against `main`, merged cleanly with the latest `main`.
- `npm run lint`, `npm test` and backend tests pass; new logic has tests.
- `README.md` and `CLAUDE.md` "Where to look" tables list the new files.
- Works in Try the Demo where it can (no backend), and degrades with a clear message where it can't.
- A full local run still works end to end: sign in, intake, a spoken or typed visit, a correction, the review list, and both printed reports.
- No paid service, no new API key, nothing sent off the device beyond what the app already sends.

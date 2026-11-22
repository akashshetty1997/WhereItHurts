# Plan: "Show Anatomy" (3D reference anatomy for PTs) + PT report and take-home summary

## Context

A patient says "my right shoulder hurts", but to a PT the shoulder is several structures: the AC
joint (where the collarbone meets the shoulder blade), the ball-and-socket joint, the front / side /
back deltoid, the four rotator cuff muscles, the biceps tendon. In PT mode, selecting a body part
opens **3D reference anatomy** for that area: the skin turns see-through and labelled bones,
muscles and joints appear in place. The PT can pinpoint a structure, explain it to the patient on
the same screen, and record it, with a purpose and their own words, in the report.

Three things stay separate end to end: **where the patient feels it** (their mark and words), **what
the PT examined**, and **what the PT discussed or noted**. Example: shoulder complaint, PT examines
the neck; both are recorded against the same shoulder complaint.

Decisions (user): real anatomy models; all 7 body parts, **shoulder first end to end**, then the
others; PT and Testing mode, shared on the same screen. Scope rule: the PT picks; the app only
labels anatomy, never suggests a cause or names a condition. It is reference anatomy, not a scan of
this patient, and says so.

Scope: (1) Show Anatomy; (2) PT Report + Take-Home Summary with body maps rendered from the 3D
scene. Focus: use three.js properly and build something PTs and patients would really use.

**Ground rule: additive only.** Everything that works today stays as it is. New features sit beside
existing ones (new buttons, panels, store fields), never replacing them.

## Anatomy source: BodyParts3D 4.0 (verified)

- `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip` (136 MB,
  one OBJ per structure, 99% polygon-reduced) + `isa_parts_list_e.txt` (tab-separated: FMA concept
  id, BP representation id, English name; 2,906 rows).
- **CC BY 4.0.** Credit: "BodyParts3D, © The Database Center for Life Science licensed under CC
  Attribution 4.0 International". No share-alike on our code.
- One adult male. Left/right are separate entries. Muscles split the way PTs think (clavicular /
  acromial / spinal part of deltoid; supraspinatus, infraspinatus, teres minor, subscapularis;
  trapezius in three parts).
- **IDs:** the list maps FMA id → BP representation id. The build resolves every structure through
  the list and checks the actual OBJ filenames in the zip (FMA or BP naming); missing ones are
  reported, never guessed.
- Units/axes undocumented: detected at build time (skull top = up, face = front, mm → m).

## Structures per region (resolved against the parts list in the build)

| Region | Bones | Joints (clickable points) | Muscles / soft tissue |
|---|---|---|---|
| right_shoulder | R humerus, R scapula, R clavicle | **AC joint**, **glenohumeral (ball-and-socket) joint** | R deltoid (front/side/back parts), supraspinatus, infraspinatus, teres minor, subscapularis, biceps (if present) |
| neck | C1–C7, cervical discs | | sternocleidomastoid, descending trapezius, levator scapulae, splenius |
| upper_back | T1–T12, thoracic discs, scapulae | | trapezius (middle/lower), rhomboids, iliocostalis/longissimus thoracis |
| lower_back | L1–L5, lumbar discs, sacrum | | iliocostalis lumborum, longissimus, quadratus lumborum/multifidus (if present) |
| left_leg | L femur, tibia, fibula | hip, ankle (if time) | quadriceps parts, hamstrings, gastrocnemius, tibialis anterior |
| left_knee | L femur, tibia, fibula, patella | **knee joint line** | menisci, cruciate/collateral ligaments, patellar ligament (if present) |
| head | skull, mandible | jaw joint (if time) | temporalis, suboccipitals (if present) |

**Joint points:** where no joint mesh exists, the build computes the point from the bone geometry
(AC joint = closest points between the clavicle's lateral end and the scapula's acromion;
glenohumeral = humeral head center facing the glenoid; knee = gap between femoral condyles and
tibial plateau) and stores it as a named marker. Shown as a labelled, clickable ring.

## Implementation

### 1. Asset pipeline (run once; output committed, raw zip not)
- `tools/anatomy/structures.json`: region → [{fma, label, plain, kind: bone|muscle|ligament|disc|joint}],
  plus joint-point recipes and a per-region alignment anchor.
- `tools/anatomy/build.mjs`: download the zip to a gitignored cache, resolve IDs via the parts list,
  extract only the listed OBJs, parse, convert units/axes, compute joint points, write one GLB with
  **one named node per structure** and `extras` {fma, region, kind, label}, then optimize with
  meshopt **without joining or instancing** (`--join false --instance false`) so every structure
  stays its own clickable mesh. The script then reloads the GLB and **asserts every structure is
  still a separate named node**, and prints found/missing per region.
- Output `public/models/anatomy.glb` (target ≤ 4 MB) + `public/models/LICENSE-bodyparts3d.txt`.

### 2. Fit to the patient, alignment first (`src/scene/anatomy.js`)
- Lazy-load on first use (GLTFLoader + MeshoptDecoder as in `BodyScene.jsx`), parent under
  `patientRoot`.
- Global scale from height, then per-region fit from **several landmarks** (not one point): e.g.
  shoulder = humeral head + acromion + clavicle medial end; a translation + uniform scale (and small
  rotation if needed) that best matches those landmarks to the patient (`PATIENTS[...].shapes`,
  `src/scene/patientRegions.js`).
- **Check alignment before any shader polish:** screenshots front / side / back on both avatars;
  bones must sit inside the body without poking through.
- Per region `overlay: true|false`. Where the overlay fits poorly, that region shows the anatomy as
  a **standalone rotatable close-up** (skin hidden, anatomy centered on the region, same controls)
  instead of a misplaced overlay.

### 3. Rendering (`src/shaders/patientMaterial.js` + anatomy materials)
- Skin: shared uniforms `uXrayLevel` (0–1, animated) and `uXrayRegion` (index into the existing
  capsule arrays); reuse `painMask[i]` so the see-through area follows the region; alpha ≈ 0.12 +
  Fresnel rim there, 1 elsewhere. Skin materials go `transparent` on enter/exit (`needsUpdate`
  once); cache key `patient-material-v4`.
- **The patient's own mark stays visible** on the see-through skin (pain glow), with a "Hide Mark"
  toggle.
- GTAO `blendIntensity` → 0 while open (it would darken the ghosted skin), back after.
- Bones ivory with a cool Fresnel rim; muscles muscle-red, slightly translucent; ligaments/discs
  pale blue-grey; joint points as rings. Legend with text labels (not color alone).
- Entry: camera `focusRegion` (existing) + one scan band through the region. Hover brightens +
  tooltip; click selects.
- Layers: Skin / Muscles / Bones.

### 4. UI and data
- PT or Testing mode: App.jsx already has `user?.role === 'pt' || testMode`; pass to `BodyScene`
  as `canShowAnatomy`. When a body part is selected: **"Show Anatomy"** button (key **X**) next to
  "Close Up". Viewer title: **"3D Reference Anatomy"** + small line "Illustration, not this
  patient's scan" + BodyParts3D credit. "Back to Skin" / Esc exits. All three steps.
- `bodyApi`: `showAnatomy(region|null)`, `onStructureClick(cb)`; anatomy meshes and joint points in
  their own raycast list (taps pick structures while open).
- **Structure card** (stage bottom-left; the pain card moves there too and hides while anatomy is
  open, which also fixes today's overlap with View Controls bottom-right): plain name + anatomical
  name + one plain sentence ("AC joint: where your collarbone meets your shoulder blade").
  - **Explain to Patient**: view only, large plain-language text for the shared screen.
  - **Add to Report**: purpose **Discussed with patient** or **Examined**, plus the PT's
    observation in their own words.
- Store (`src/visitStore.js`): `anatomyNotes: []` in `emptyVisit`; `addAnatomyNote` / `removeAnatomyNote`
  with `{ id, complaintRegion, structure: { fma, label, region, kind }, purpose:
  'discussed'|'examined', note, time }`. `complaintRegion` (where the patient feels it, defaults to
  the selected/marked region) is stored separately from the structure's own region.
- PT Summary (`src/panels/VisitWrapUp.jsx`): new row "Anatomy notes", grouped by complaint:
  "Right shoulder (patient: "It aches when I reach up") → Discussed AC joint with patient: …;
  Examined cervical spine: …".

### 5. PT Report + Take-Home Summary (R8 + R9)
- **Body maps from three.js:** `bodyApi.snapshot(view)` places the camera at the front / back preset,
  renders once through the composer, reads `renderer.domElement.toDataURL()` in the same tick,
  restores the camera.
- **PT Report** (Summary step, PT/Testing): print view `src/panels/Report.jsx` + print stylesheet,
  `window.print()` → Save as PDF, no new dependency. Patient + date, goal (+ discussed), front/back
  body maps, marked pain with the patient's words, movement checks (+ confirmation), anatomy notes
  by complaint (purpose + PT's words), not discussed, follow-ups, footer "Communication record, not
  a diagnosis. Anatomy: BodyParts3D, CC BY 4.0".
- **Take-Home Summary** (everyone): plain words, large type: what you told us, what we talked about,
  your goal, next steps, the parts your PT showed you (plain sentences).
- Reuses `PtSummary` data paths, `goalDiscussed`, `unmentioned`, `REGIONS` / `regionLabel`.

### 6. Small fixes
- `toTen(1)` → 10 in `src/scene/intensity.js` (integers are 0–10; only fractions are 0–1).
- README Credits: female model (Sports_Female_02) + BodyParts3D.
- UI per the `apple-design` skill (CLAUDE.md): title-style buttons, ≥14 px text, labels + shapes.

## Order of work
1. Build pipeline; shoulder only. Verify IDs/filenames, separate clickable nodes, joint points.
2. **Shoulder alignment check** on both avatars (front/side/back). Decide overlay vs close-up.
3. Shoulder end to end (render, click, card, Explain, Add to Report with purpose + words, summary).
   **Acceptance test (below) passes → checkpoint.**
4. Extend to the other 6 regions, each with the same alignment check.
5. Reports (snapshots, PT Report, Take-Home Summary).
6. Small fixes; PRs (anatomy; reports), each carrying the notes for Akash.

## Acceptance test (shoulder)
A patient marks the top of the right shoulder ("It aches when I reach up"). The PT taps Show
Anatomy, selects the **AC joint**, uses Explain to Patient to show where the collarbone meets the
shoulder blade, then Add to Report → Discussed with patient, "Explained AC joint anatomy". The PT
also examines the neck and records Examined → cervical spine, "Turning left eases the shoulder",
against the same shoulder complaint. The report shows the patient's words, the discussed AC joint
note and the examined neck note, separately.

## Verification
- Build prints per region: resolved IDs, OBJ found/missing, node count after optimize = structures.
- Headless Chrome flow scripts: PT/Testing account → each region → Show Anatomy → screenshots
  front/side/back on male and female; no poke-through; patient mark visible; Hide Mark works.
- Acceptance test above, then End Visit → PT Summary row → PT Report print preview (both body maps,
  all sections) → Take-Home Summary from a patient account.
- Patient account: no Show Anatomy button.
- Regression: marking, hands-free/hold-to-talk, pulse, amber flag, movement check, camera controls,
  light/dark unchanged. `npm run lint`, `npm run build`, backend tests pass; 60 fps on the M1 with
  anatomy open.

## Later (production roadmap, not in this plan)
R1 save visits + history · R2 progress across sessions · R3 patient ↔ PT link · R4 standard intake
questions · R5 more body parts (both sides, hips, elbows, wrists, ankles, chest/abdomen) · R6 safety
screen · R7 movement test library · R10 consent/privacy · R11 phone/tablet prep · R12 languages ·
R13 graphics step-down · R14 frontend tests.

## Notes for Akash (his items; in the PR description for review)
- Demo-critical: public deploy (frontend + a backend host for speech models and Claude); speech
  models on the demo laptop (~520 MB); `/api/extract` always answers `source: keywords` although
  health says `llm: claude_code`; backup video; rehearsal + final v2 demo script.
- Product gaps: two prep voice paths (always-on mic + Hold to Speak buttons) → pick one; light-mode
  check of Dinesh's screens; "New Visit" reset; visits lost on refresh.
- Docs/pitch: `docs/PLAN.md`, README, CLAUDE.md behind; slides + narration.

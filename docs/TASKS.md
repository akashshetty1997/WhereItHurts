# WhereItHurts: Task Split

Sundai Hack 150 · Akash Shetty and Dinesh Bachchani · Nov 22, 2026

Akash owns the brain: live voice to text, speaker diarization, understanding, visit state and side panels. Dinesh owns the body: 3D model, painting and shaders. You meet at one shared visit state and never edit the same files.

**English only.** Speech-to-text runs on Parakeet (English, fast on CPU). No second language for the demo.

## Shared tasks

| Time | Task | Done when |
|---|---|---|
| 10:50–11:10 | Pitch at team formation, agree on the contract and region ids | Both of you can recite the function names |
| 11:10–11:30 | Create repo, add `mockVisit.js` and `contract.js`, deploy empty app to Vercel | App loads at a public URL |
| 13:30–14:00 | Integration: `onSegment` connects to `glow`, painting connects to the store | Paint a region, say a line, both show on the body |
| 17:30 | Feature freeze run | Full demo runs once with no code changes |
| 19:00–20:00 | Rehearse three times, once in the demo room | Demo fits in 2:30 |

## Akash: the brain

| # | Time | Task | Done when | Depends on |
|---|---|---|---|---|
| A1 | 11:30–12:00 | Mic capture and voice activity detection | Each pause produces one utterance file | Nothing |
| A2 | 12:00–12:30 | Speech-to-text plus enrollment and speaker matching | Terminal prints speaker and text for each sentence | A1 |
| A3 | 12:30–13:00 | WebSocket to browser and visit store | Spoken lines appear in the browser console | A2 |
| A4 | 13:00–13:30 | LLM prompt and keyword fallback | Line 4 returns `lower_back` and `left_leg` in regions and path | A3 |
| A5 | 15:00–15:45 | WAV recording and `playSegment` | Clicking a segment plays the right audio | A3 |
| A6 | 15:45–16:30 | Transcript panel and mention list | Clicking a region lists its lines, clicking a line plays it | A5, D4 |
| A7 | 16:30–17:15 | `endVisit` and catch cards, Enroll, Start and End buttons | Knee card appears after End visit | D5 |
| A8 | 17:15–17:30 | Test prompt on all 14 lines (9 script + 5 unscripted, English) | All 14 return correct regions | A4 |
| A9 | 17:30–18:15 | Push-to-talk mode for the public URL | Public URL works without the local server | A3 |
| A10 | 18:15–19:00 | Research slide and narration script | Narration fits in 2:30 | Nothing |

## Dinesh: the body

| # | Time | Task | Done when | Depends on |
|---|---|---|---|---|
| D1 | 11:30–12:30 | Body model split into 6 named regions, or capsule fallback | GLB loads with 6 named meshes | Nothing |
| D2 | 12:30–13:00 | Scene, lights, camera, rotate on right-drag, region click | Clicking each region logs its id | D1 |
| D3 | 13:00–13:30 | `glow(region, color)` driven by `mockVisit.js` | Mock segments light the right regions | D2 |
| D4 | 13:00–13:30 | `onRegionClick` callback | Akash's panel receives the clicked region | D2 |
| D5 | 15:00–15:45 | Click-to-paint with pain type picker, calls `setPainted` | Painting the knee adds it to painted | D2 |
| D6 | 15:45–16:30 | Pain-type shader: burning, sharp, aching | All three looks run at 60fps | D5 |
| D7 | 16:30–17:30 | `pulse(path)`, the hero shot | Light runs from lower back into left leg | D3 |
| D8 | 17:30–18:00 | `flag(region)`, the amber glow | Unmentioned knee glows amber | D3 |
| D9 | 18:00–18:30 | Hover labels with 0 to 10 intensity, bloom pass | "Left knee · aching · 6/10" shows on hover | D5 |
| D10 | 18:30–19:00 | Final Vercel deploy and backup video | Video of one full run saved | Freeze run |

## The contract

Agree on it in the first 30 minutes. Both of you build against `mockVisit.js` until 13:30.

- **Dinesh exposes:** `glow(region, color)`, `pulse(path)`, `paintLook(region, type)`, `flag(region)`, `onRegionClick(callback)`.
- **Akash exposes:** `setPainted(list)`, `addSegment(segment)`, `onSegment(callback)`, `endVisit()` returning unmentioned regions, `playSegment(id)`.
- **Region ids:** `head`, `neck`, `lower_back`, `left_leg`, `left_knee`, `right_shoulder`. Left and right always mean the patient's side.

## File ownership

- **Akash owns** `backend/` (the split's "server/"), `src/store/` and `src/panels/`. The store currently lives at `src/visitStore.js`; it moves to `src/store/` after telling Dinesh.
- **Dinesh owns** `src/scene/`, `src/shaders/` and `public/body.glb`.
- **Shared and frozen after 11:30:** `src/contract.js` and `src/mockVisit.js`. Change them only after telling each other.
- **Work on separate branches** and open a pull request into `main`; Dinesh merges. Merge at 13:30 and 17:30.

## Handoff points

1. Until 13:30, neither of you waits on the other. Dinesh tests glow with `mockVisit.js`. Akash tests with console output.
2. At 15:45, Dinesh's `onRegionClick` unblocks Akash's mention list.
3. At 16:30, Dinesh's painting unblocks Akash's catch cards. Until then, test `endVisit` with mock painted data.

## If someone falls behind

1. If the diarization check fails in the room, Akash switches to push-to-talk. That frees about an hour. Akash takes D8, the amber flag.
2. If the body model runs past 12:30, Dinesh switches to capsules immediately. No exceptions.
3. If the pulse is not done by 17:30, it still gets polish time before anything else. It is the hero shot.

## Check-ins

Two-minute sync at 12:30, 15:00 and 16:30. Each of you says what is done, what is next and what is blocking.

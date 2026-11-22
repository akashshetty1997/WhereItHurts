# WhereItHurts: slides and narration

Five slides around the live demo (`docs/DEMO_SCRIPT.md`). Narration in quotes; about 2:30 including the demo.

## 1. The problem (0:00–0:15)
**Slide:** one line, large: *"You left the visit, and the pain you came in with never came up."*

"Patients forget to mention things, and they leave not sure why the PT tested somewhere else. Where it hurts isn't always where it starts, and that's hard to explain in a 30-minute visit."

## 2. Live demo (0:15–2:05)
Switch to the app. Follow `docs/DEMO_SCRIPT.md`. Narrator speaks only at the three hero moments:
- **The pulse (line 4):** "The patient said it runs from the neck into the shoulder, so that's exactly what lights up."
- **The change (lines 7–8):** "The PT tested the neck, and the shoulder went from five to two. The app records the test and the change. It never says why; the PT decides."
- **The catch (End Visit):** "The knee she marked never came up. Before, she'd have left without mentioning it."

## 3. How it works (2:05–2:15)
**Slide:** three boxes, left to right:
1. **Mark it.** Tap the body or just say it: type, 0–10, the patient's own words.
2. **Say it.** Hands-free listening: the app learns the PT's and the patient's voices in one sentence each, then labels every line and lights the body about a second after it's said.
3. **Check it.** Unmentioned pain is flagged; the patient confirms what changed; the PT gets a one-screen summary.

*Under the hood:* speech-to-text and speaker recognition run locally (Parakeet + TitaNet); Claude reads each line for movements, ratings and misheard words; three.js renders the body with custom shaders.

## 4. Not a diagnosis (one line, on slide 3)
"It records what the patient said and what the PT chose to test. It never names a condition or a cause."

## 5. What's next (2:15–2:30)
**Slide:** "PT intake today; progress across sessions next."
- Built: 3D reference anatomy, so the PT can show *why* the neck (Show Anatomy), plus a PT Report and a Take-Home Summary
- Pre-visit intake a PT practice sends before the first appointment
- Progress across visits: watch pain move back toward the spine as therapy works

**Close:** "Show where it hurts, say what it feels like, and never leave a visit with pain nobody talked about."

## Judge Q&A (from docs/PLAN.md)
| Question | Answer |
|---|---|
| Does it diagnose? | No. It records what was said and what was tested; no condition or cause is ever named. |
| Only your script? | Try it: New Visit, mark a spot, say any sentence. |
| Privacy? | Role-play only. Speech runs on the laptop; nothing is stored on a server. A real version needs consent and on-device storage. |
| Why 3D? | Pain wraps around the body and travels; PTs test areas other than where it hurts. A flat chart can't show both. |
| How is this different from AI scribes? | Scribes write notes for the clinician. This is for the patient and the PT together, and the patient confirms the record. |

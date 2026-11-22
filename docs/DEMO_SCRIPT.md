# WhereItHurts: demo script (2:30)

Three people: **Narrator**, **PT**, **Patient**. The patient drives the laptop. Run it on the demo laptop with the backend running (live listening and Claude need it); the public link can only show the UI ("Try the Demo").

## Before you go on stage

- [ ] Backend running: `cd backend && uv run uvicorn app.main:app --reload --reload-dir app --port 8000 --no-access-log`. `curl localhost:8000/api/health` should show `"transcription":"ok","llm":"claude_code"`.
- [ ] Speech models present (`backend/scripts/get_models.sh` once per laptop), and Claude Code logged in (`claude` works in a terminal).
- [ ] Frontend: `npm run dev`, Chrome at http://localhost:5173, **dark mode** (glows read best on a projector), View Controls hidden if it covers the body.
- [ ] Logged in as the **patient**, Testing mode **off**. The mic allowed once already (click Record Your Prep, then Stop).
- [ ] **New Visit** (Summary step) so the screen starts empty.
- [ ] Use the real demo mic. Speak a little slower than normal, and pause briefly between lines.
- [ ] Backup video open in another tab.

## Run of show

| Time | Who | Do / say | On screen |
|---|---|---|---|
| 0:00 | Narrator | "You leave a physical therapy visit, and the pain you came in with never came up. Or the PT tested your neck and you're not sure why." | Empty body, "Before Your Visit" |
| 0:15 | Patient | Clicks **Record Your Prep**: *"My right shoulder aches, about a five, when I reach up."* | Shoulder: aching 5/10 |
| | Patient | *"My left knee has a dull ache, maybe a three."* | Knee: aching 3/10 |
| | Patient | *"I want to be able to put plates on the top shelf."* Clicks **Stop Recording**. | Goal pinned on the left |
| 0:35 | Patient | Clicks **Start Visit**, then **Record the Visit**. | "Step 1 of 2: Learning your voices" |
| | PT | *"Hi, I'm your physical therapist today."* | Step 2 |
| | Patient | *"Hi, I'm here about my shoulder."* | Recording (red dot) |
| 0:45 | PT / Patient | Script lines 1–6 below. | Lines appear labelled PT / Patient; **line 4 pulses neck → shoulder** |
| 1:10 | PT / Patient | Lines 7–8. | Neck outlined "Area assessed by PT"; Movement Check fills in **Before 5 → After 2, Better** |
| 1:25 | PT | Clicks **After 2/10** under "Show on body". | Shoulder dims from 5 to 2 on the body |
| 1:35 | PT / Patient | Lines 9–11, then **End Visit**. | |
| 1:50 | Patient | | **Knee glows amber: "nobody talked about it"**; goal card "came up"; **Does This Match?** → clicks **That's Right** |
| 2:05 | Narrator | Scrolls to the **PT Summary**. | Goal, marks, movement check, not discussed, follow-up |
| 2:20 | Narrator | "Show where it hurts, say what it feels like, and never leave with pain nobody talked about." | |

## Script

| # | Speaker | Line | What happens |
|---|---|---|---|
| 1 | PT | What brings you in today? | PT line |
| 2 | Patient | My right shoulder aches when I reach up to put plates away. | Shoulder glows; goal counts as discussed |
| 3 | PT | Does it stay in one place? | PT line |
| 4 | Patient | Sometimes it runs from my neck down into my shoulder. | **Pulse: neck → right shoulder** |
| 5 | PT | How bad is the shoulder right now, zero to ten? | Shoulder glows |
| 6 | Patient | About a five. | Rating 5 (before) |
| 7 | PT | Let me check your neck. Slowly turn your head to the left. | Movement: turn head left; neck = area assessed. **Turn Head plays by itself:** the neck bones turn, the top two most |
| 8 | Patient | Oh, the shoulder feels better. Maybe a two. | After 2, Better |
| 8a | PT | Now raise your right arm up for me, slowly. | **Reach Up plays by itself:** the arm bone rises inside the see-through shoulder, the shoulder blade turns (2:1 rule), working muscles glow orange; then back to the whole body |
| 8b | Patient | Ow, it starts hurting about halfway up. | (Optional, if time: PT clicks Right shoulder → **Reach Up**, drags to 90°, **Hurts From Here**, drags to 150°, **To Here**: a pink band glows around the shoulder and goes into the reports) |
| 9 | PT | Let's work on your neck and shoulder, with exercises at home. | Neck and shoulder glow |
| 10 | PT | And let's book a follow-up in two weeks. | Follow-up in the summary |
| 11 | Patient | Okay, thanks. | |

The knee is never mentioned on purpose: that's the catch.

## If something goes wrong

| Problem | Do this |
|---|---|
| A line goes to the wrong person | Pause recording, **Redo voices**, carry on |
| Nothing appears after speaking | Check the green level bar moves; pause a little longer after the line |
| Server not reachable | Restart the backend; if it can't come back in 20 s, switch to the backup video |
| Movement check didn't fill in | The PT types it into the Movement Check card (Before / After / Better) |
| Judge's turn | **New Visit**, let them mark a spot by voice and say one sentence, or click Right shoulder → **Reach Up** and drag the slider |
| A movement didn't play (lines 7, 8a) | Click the body part → **Turn Head** / **Reach Up** → Play (▶) |

Rehearse three times, once in the demo room with the real mic.

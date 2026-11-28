# CLAUDE.md: WhereItHurts

Hackathon app (Sundai Hack 150): before a physical therapy (PT) visit the patient marks pain on a 3D body, the live PT–patient conversation lights up the regions mentioned, and marked pain nobody talked about is flagged at the end. It's a communication tool only: never diagnose or name a condition.

## Where to look

| What | Where |
|---|---|
| Plan, data model, timeline | `docs/PLAN.md` |
| Demo script, pitch and Q&A | `docs/DEMO_SCRIPT.md`, `docs/PITCH.md` |
| Anatomy + reports plan (PR #26) | `docs/ANATOMY_AND_REPORTS_PLAN.md` |
| UI design rules (any change to how the frontend looks) | the `apple-design` skill (personal install, see below) |
| Frontend (Vite + React + Three.js) | repo root: `src/`, `vite.config.js` |
| Visit state (saved in the browser; New Visit starts a new one) | `src/visitStore.js` (shape: `src/mockVisit.js`) |
| Pre-Visit Brief (from the last visit + today's prep) | `src/lib/brief.js` (data, tested), `src/panels/Brief.jsx` |
| Past Visits (history in the browser; swap for server storage later) | `src/lib/history.js` (only place that touches it), `src/panels/PastVisits.jsx` |
| Voice: Record Your Prep, Record the Visit, smart pass | `src/panels/PrepListen.jsx`, `LiveListen.jsx`, `liveVoice.js`, `smartPass.js`; backend `/api/live`, `/api/extract(/smart)` |
| Typed input (mic or server down) | `src/panels/TypedLine.jsx`, `prepLine.js`; tagging in `ConversationPanel.jsx` (`TagRegions`) |
| Movement check, summary | `src/panels/movementLog.js`, `MovementCheck.jsx`, `VisitWrapUp.jsx` |
| Coverage (did each marked pain / the goal come up; PT review) | `src/lib/coverage.js`, `CoverageReview` in `VisitWrapUp.jsx` |
| Next phase plan (Tasks A, 0, 1, 4, 5) | `docs/NEXT_PHASE_PLAN.md` |
| Show Anatomy (reference bones and muscles, per-body fit) | `src/scene/anatomy.js`, `AnatomyOverlay.jsx`, `patientRegions.js` (`anatomy`); asset build `tools/anatomy/` |
| Auto-follow (the body follows the PT) | `src/scene/autoFollow.js` (director + word matching), `autoFollowState.js`, `AutoFollowControls.jsx`; words from `tools/anatomy/terms.mjs` |
| Region ids (keep in sync with `backend/app/constants.py`) | `src/regions.js` |
| Backend (FastAPI): extract and transcribe APIs | `backend/`; load the `whereithurts-backend` skill first |
| Three.js how-tos | `.claude/skills/threejs-*` |

## Run

```bash
npm install && npm run dev                                                  # frontend, :5173
cd backend && uv sync && scripts/get_models.sh && uv run uvicorn app.main:app --reload --reload-dir app --port 8000 --no-access-log   # backend, :8000
```

The frontend calls the backend as `fetch('/api/...')` through the Vite proxy.

## Frontend design

For any frontend UI work (new screens, panels, restyling, reviewing a screenshot), load the `apple-design` skill first and follow Apple's Human Interface Guidelines through it: accessibility and contrast first, then layout, typography and color. The app is shown on a projector, so favor legibility at a distance. Keep using the existing Tailwind theme tokens (`src/index.css`) and shadcn components (`src/components/ui/`); color is reserved for meaning (speaker, pain type, missed-pain flag).

The skill isn't in this repo, because it contains Apple's copyrighted guideline text. Install it once per machine:

```bash
git clone --depth 1 https://github.com/dickwu/apple-design-skill /tmp/apple-design-skill
mkdir -p ~/.claude/skills/apple-design
cp -R /tmp/apple-design-skill/SKILL.md /tmp/apple-design-skill/references ~/.claude/skills/apple-design/
```

Then start a new Claude Code session.

## Conventions

- Never commit to `main`. Pull `main`, create a branch (`feat/...`, `fix/...`, `docs/...`), commit, push, and open a pull request into `main`; Dinesh reviews and merges. Short, plain commit messages.
- Before opening a pull request, pull `main` again and update the branch so it merges cleanly.
- Secrets go only in `backend/.env` (gitignored), never in `VITE_` variables.
- No real patient data anywhere. All audio is role-played.

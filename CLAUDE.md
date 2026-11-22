# CLAUDE.md: WhereItHurts

Hackathon app (Sundai Hack 150): before a physical therapy (PT) visit the patient marks pain on a 3D body, the live PT–patient conversation lights up the regions mentioned, and marked pain nobody talked about is flagged at the end. It's a communication tool only: never diagnose or name a condition.

## Where to look

| What | Where |
|---|---|
| Plan, data model, role-play script, timeline | `docs/PLAN.md` |
| UI design rules (any change to how the frontend looks) | the `apple-design` skill, `.claude/skills/apple-design/` |
| Frontend (Vite + React + Three.js) | repo root: `src/`, `vite.config.js` |
| Visit state contract | `src/mockVisit.js`, `src/visitStore.js` |
| Region ids (keep in sync with `backend/app/constants.py`) | `src/regions.js` |
| Backend (FastAPI): extract and transcribe APIs | `backend/`; load the `whereithurts-backend` skill first |
| Three.js how-tos | `.claude/skills/threejs-*` |

## Run

```bash
npm install && npm run dev                                                  # frontend, :5173
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000 --no-access-log   # backend, :8000
```

The frontend calls the backend as `fetch('/api/...')` through the Vite proxy.

## Frontend design

For any frontend UI work (new screens, panels, restyling, reviewing a screenshot), load the `apple-design` skill first and follow Apple's Human Interface Guidelines through it: accessibility and contrast first, then layout, typography and color. The app is shown on a projector, so favor legibility at a distance. Keep using the existing Tailwind theme tokens (`src/index.css`) and shadcn components (`src/components/ui/`); color is reserved for meaning (speaker, pain type, missed-pain flag).

The skill is in this repo at `.claude/skills/apple-design/` (from github.com/dickwu/apple-design-skill; the guideline text belongs to Apple Inc., see its `README.md`). After pulling it for the first time, start a new Claude Code session so it loads.

## Conventions

- Never commit to `main`. Pull `main`, create a branch (`feat/...`, `fix/...`, `docs/...`), commit, push, and open a pull request into `main`; Dinesh reviews and merges. Short, plain commit messages.
- Before opening a pull request, pull `main` again and update the branch so it merges cleanly.
- Secrets go only in `backend/.env` (gitignored), never in `VITE_` variables.
- No real patient data anywhere. All audio is role-played.

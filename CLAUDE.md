# CLAUDE.md: WhereItHurts

Hackathon app (Sundai Hack 150): the patient paints pain on a 3D body, a live doctor–patient conversation lights up the regions mentioned, and painted pain nobody talked about is flagged at the end. It's a communication tool only: never diagnose or name a condition.

## Where to look

| What | Where |
|---|---|
| Plan, data model, role-play script, timeline | `docs/PLAN.md` |
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

## Conventions

- Commit straight to `main` with short, plain commit messages. Pull before you start, since two people push here.
- Secrets go only in `backend/.env` (gitignored), never in `VITE_` variables.
- No real patient data anywhere. All audio is role-played.

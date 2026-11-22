# WhereItHurts

Paint where it hurts on a 3D body, then a live doctor–patient conversation lights up each body part as it's mentioned. Painted pain nobody talked about stays flagged amber at the end. Communication tool only; it never diagnoses.

Full plan: [docs/PLAN.md](docs/PLAN.md)

## Run

Requires Node 20+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

### Backend

FastAPI in [backend/](backend/): `POST /api/extract` (sentence → regions, pain path) and `POST /api/transcribe` (recording → speaker-labelled lines). The Vite dev server proxies `/api` to it. Needs Python 3.12, [uv](https://docs.astral.sh/uv/) and ffmpeg.

```bash
cd backend
cp .env.example .env    # add ANTHROPIC_API_KEY (optional: keywords work without it)
uv sync
uv run uvicorn app.main:app --reload --port 8000 --no-access-log
```

Speech models for `/api/transcribe` are optional; see [backend/README.md](backend/README.md).

## Layout

| File | Purpose |
| --- | --- |
| `src/mockVisit.js` | The visit JSON contract every role builds against |
| `src/visitStore.js` | Visit state: `setPainted`, `addSegment`, `onSegment`, `unmentioned()` |
| `src/regions.js` | MVP region ids (left/right = patient's side) |
| `src/scene/BodyScene.jsx` | Three.js scene; placeholder capsule body until the GLB lands |
| `src/App.jsx` | Legend, transcript, mentions, catch cards |

Region ids: `head`, `neck`, `lower_back`, `left_leg`, `left_knee`, `right_shoulder`.

Controls: left-click paints/selects, right-drag rotates, scroll zooms.

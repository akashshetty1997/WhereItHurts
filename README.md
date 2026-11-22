# WhereItHurts

Before a physical therapy visit, the patient marks where it hurts on a 3D body, by tapping or just saying it. During the visit the app listens hands-free, works out who is speaking (PT or patient), and lights up each body part as it's mentioned. At the end, marked pain nobody talked about glows amber, the patient confirms what changed, and the PT gets a one-screen summary. A communication tool only: it never diagnoses.

- Plan: [docs/PLAN.md](docs/PLAN.md) · Demo script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · Pitch: [docs/PITCH.md](docs/PITCH.md)

## Run (demo laptop)

Needs Node 20+, Python 3.12, [uv](https://docs.astral.sh/uv/), ffmpeg, and Chrome. Live listening needs the backend and its speech models; the smart pass uses Claude Code (logged in) or an API key.

```bash
# frontend
npm install
npm run dev                                   # http://localhost:5173

# backend (another terminal)
cd backend
cp .env.example .env                          # LLM_PROVIDER=claude_code by default; or api + ANTHROPIC_API_KEY
uv sync
scripts/get_models.sh                         # once per laptop: speech models, about 520 MB
uv run uvicorn app.main:app --reload --reload-dir app --port 8000 --no-access-log
curl localhost:8000/api/health                # {"transcription":"ok","llm":"claude_code"}
```

## Public link (frontend only)

`vercel.json` deploys the frontend to Vercel. There's no backend there, so accounts and live listening don't work: the login screen says so and offers **Try the Demo** (a local guest PT) to explore the body, marking, the visit screens and the summary. The full demo runs on the laptop.

## How it's built

| Where | What |
| --- | --- |
| `src/scene/BodyScene.jsx`, `src/shaders/patientMaterial.js` | three.js scene: patient model, pain looks, glows, pain-path pulse, amber flag, camera and view controls |
| `src/panels/PrepListen.jsx` | **Record Your Prep**: say where it hurts and your goal; keywords first, Claude for free phrasing |
| `src/panels/LiveListen.jsx`, `liveVoice.js` | **Record the Visit**: mic → WebSocket `/api/live`; voice enrollment, then every line labelled PT / Patient |
| `src/panels/smartPass.js` | Claude improves each visit line in the background (missed body parts, rating, movement, follow-up) |
| `src/panels/movementLog.js`, `MovementCheck.jsx` | Movement check (PT names a movement, patient rates before / after) |
| `src/panels/VisitWrapUp.jsx` | Summary: confirm cards, PT summary |
| `src/visitStore.js` | The visit state (kept in the browser across a refresh; **New Visit** clears it) |
| `src/auth/` | Demo accounts (patient / PT), Testing mode, Try the Demo, light / dark |
| `backend/` | FastAPI: extraction (keywords + Claude), live listening, transcription, accounts. See [backend/README.md](backend/README.md) |

Region ids: `head`, `neck`, `upper_back`, `lower_back`, `left_leg`, `left_knee`, `right_shoulder` (left / right = the patient's side).

Controls: click a body part to select it, drag to turn, Shift-drag to slide up or down, scroll to zoom. No mouse: the **View Controls** panel, or ← → turn, ↑ ↓ tilt, Shift+↑ ↓ slide, + − zoom, F L B R sides, 0 whole body, ? controls.

## Credits

- **Patient model:** "Sports_Male_04" from [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT License (`public/models/LICENSE-rocketbox.txt`). Converted to a static glTF (A-pose baked, PBR roughness from the specular maps) and compressed with gltf-transform (meshopt + WebP): `public/models/patient.glb`, 1.4 MB.
- **Female patient model:** "Sports_Female_02" from [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT License (`public/models/LICENSE-rocketbox.txt`), converted the same way: `public/models/patient-female.glb`.
- **Studio lighting:** "Studio Small 08" HDRI from [Poly Haven](https://polyhaven.com/a/studio_small_08), CC0: `public/hdri/studio_small_08_1k.hdr`.

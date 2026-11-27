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
| `src/scene/anatomy.js`, `AnatomyOverlay.jsx` | **Show Anatomy** (PT or Testing mode): reference bones, muscles and joints inside a selected region, see-through skin, Explain to Patient, Add to Report |
| `src/scene/movements.js`, `movementSim.js`, `MovementPanel.jsx`, `src/lib/spokenMovement.js` | **Movement simulations** (everyone): **Reach Up** (right shoulder), **Turn Head** (neck), **Bend Knee** (left knee). Slider or Play, one rule each, working muscles glow orange, mark the range where it hurts; each plays by itself when the PT asks for it during the visit ("raise your arm", "turn your head to the left", "bend your knee") |
| `tools/anatomy/` | Builds `public/models/anatomy.glb` from BodyParts3D (`structures.json` lists each region's structures; `node tools/anatomy/build.mjs`) |
| `src/panels/VisitWrapUp.jsx` | Summary: confirm cards, **Review What Came Up** (PT), PT summary |
| `src/lib/coverage.js` | Did each marked pain and the goal come up? Never came up / Asked, but the patient didn't answer / The patient talked about it / Reviewed by PT, with the sentences behind each |
| `src/visitStore.js` | The visit state (kept in the browser across a refresh; **New Visit** starts a new one). Each visit has its own id, start / end dates and an optional patient key (initials or a nickname) |
| `src/lib/history.js`, `src/panels/PastVisits.jsx` | **Past Visits** (PT and Testing mode): finished visits kept in this browser (50 per account), filtered by patient, opened read-only with their body marks and reports (dated the day of the visit). The only module that touches history storage, so a server can replace it |
| `src/auth/` | Demo accounts (patient / PT), Testing mode, Try the Demo, light / dark |
| `backend/` | FastAPI: extraction (keywords + Claude), live listening, transcription, accounts. See [backend/README.md](backend/README.md) |

Region ids: `head`, `neck`, `upper_back`, `lower_back`, `left_leg`, `left_knee`, `right_shoulder` (left / right = the patient's side).

Show Anatomy: select a body part, then **Show Anatomy** (or X). Click a bone or muscle for its plain name and what it does. Esc goes back to the skin. Each region's fit to each body is in `src/scene/patientRegions.js` (`anatomy`); in dev, `?fit=<region>:x,y,z,armDegrees,scale` tries another.

Movement simulations: select **Right shoulder**, **Neck** or **Left knee**, then **Reach Up**, **Turn Head** or **Bend Knee**. Drag the slider or press Play. The rules: for every 3° the arm goes up, about 2° come from the shoulder joint and 1° from the shoulder blade; about half of a head turn happens between the top two neck bones (C1–C2); the knee is a hinge and the kneecap glides half as far. Typical movement, for illustration. Tests: `npm test`.

Controls: click a body part to select it, drag to turn, Shift-drag to slide up or down, scroll to zoom. No mouse: the **View Controls** panel, or ← → turn, ↑ ↓ tilt, Shift+↑ ↓ slide, + − zoom, F L B R sides, 0 whole body, ? controls.

## Credits

- **Patient model:** "Sports_Male_04" from [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT License (`public/models/LICENSE-rocketbox.txt`). Converted to a static glTF (A-pose baked, PBR roughness from the specular maps) and compressed with gltf-transform (meshopt + WebP): `public/models/patient.glb`, 1.4 MB.
- **Female patient model:** "Sports_Female_02" from [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT License (`public/models/LICENSE-rocketbox.txt`), converted the same way: `public/models/patient-female.glb`.
- **Reference anatomy:** [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/), © The Database Center for Life Science, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (`public/models/LICENSE-bodyparts3d.txt`). The listed bones and muscles converted to glTF and compressed by `tools/anatomy/build.mjs`: `public/models/anatomy.glb`, 3.9 MB, loaded the first time anatomy is shown. An illustration, not any patient's scan.
- **Studio lighting:** "Studio Small 08" HDRI from [Poly Haven](https://polyhaven.com/a/studio_small_08), CC0: `public/hdri/studio_small_08_1k.hdr`.

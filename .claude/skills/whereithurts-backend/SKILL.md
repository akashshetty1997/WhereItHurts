---
name: whereithurts-backend
description: "How the WhereItHurts FastAPI backend (backend/) is organized and how to change it: where constants, settings, schemas, services and routes go, how to add an endpoint, the extract and transcribe APIs, and how to run, test and lint. Use for any work in backend/, adding or changing an API endpoint, the LLM extraction, speech-to-text or speaker diarization, constants.py, or connecting the frontend to the API."
---

# WhereItHurts backend

FastAPI app in `backend/`. Python 3.12, managed with uv. The React frontend at the repo root calls it through the Vite proxy as `fetch('/api/...')`.

## Where things live

```
backend/app/
  main.py          create_app(): CORS, lifespan (loads speech models), mounts api_router at /api
  constants.py     EVERY fixed value: region ids, LLM model and timeouts, keyword lists, audio limits,
                   model file names, diarization tuning. No env reads, no logic.
  config.py        Settings (pydantic-settings): env and secrets only, from backend/.env.
                   ANTHROPIC_API_KEY, TRANSCRIBE_ENABLED, TRANSCRIBE_ENGINE, MODELS_DIR, TRANSCRIBE_TMP_DIR
  api/router.py    registers every route module, once
  api/deps.py      SettingsDep, TranscriptionDep, AccountsDep, CurrentUserDep (needs a Bearer token)
  api/routes/      health.py, auth.py, extract.py, transcribe.py: thin HTTP handlers
  schemas/         Pydantic request/response models, one file per feature
  services/        the logic
    accounts.py    demo accounts: SQLite at settings.users_db_path, scrypt passwords, session tokens
    extraction.py  sentence -> regions/path/rating/movement/pain_type: fast (keywords) and smart (Claude) passes
    llm/           Claude for the smart pass: prompt.py (shared prompt + JSON schema), claude_code.py
                   (`claude -p`, no API key), anthropic_api.py (SDK + key). Pick with LLM_PROVIDER
    keywords.py    keyword fallback (corrects with the PT vocabulary first)
    vocabulary.py  loads data/pt_terms.csv: correct(), region_phrases(), terms()
  data/pt_terms.csv  PT vocabulary: term, region, common mishearings. Add words here, not in code.
    transcription/ audio.py (ffmpeg decode), engines.py (Parakeet/Whisper),
                   diarize.py (sentences + voice clustering), service.py (TranscriptionService)
backend/tests/     pytest; conftest.py gives `client` with transcription off
```

## Rules

1. **Constants go in `app/constants.py`.** Never inline a magic number, string list, model name or limit in a service or route; add a named constant (grouped, with a comment saying why) and import it. Anything that differs per machine or is secret goes in `config.py` `Settings` instead, plus a line in `backend/.env.example`.
2. **Routes are thin.** A route validates input (through a schema), calls one service function, and returns a schema. No business logic, no direct model or SDK calls in `api/routes/`.
3. **Logic lives in `services/`.** Services take plain values plus `Settings`, return schemas, and don't import FastAPI. That keeps them testable without HTTP.
4. **Shapes live in `schemas/`.** Every request and response is a Pydantic model; no bare dicts across the API.
5. **Dependencies come through `api/deps.py`.** No module-level globals for clients or models; long-lived objects are created in the `main.py` lifespan and stored on `app.state`.
6. **Region ids must match the frontend.** `constants.REGION_IDS` mirrors `src/regions.js` and the data model in `docs/PLAN.md`. Change both together. Left/right always mean the patient's side.
7. **Privacy.** Never log, print or commit audio or transcript text. Logs hold sizes, timings and counts. All test audio is fictional.
8. **Never diagnose.** No endpoint, prompt or response names a medical condition.

## Add an endpoint

1. Request/response models in `app/schemas/<feature>.py`.
2. Logic in `app/services/<feature>.py`, using constants and `Settings`.
3. Route in `app/api/routes/<feature>.py`: `router = APIRouter(tags=["<feature>"])`, a thin handler.
4. Register it in `app/api/router.py`.
5. Tests in `backend/tests/test_<feature>.py`, using the `client` fixture.
6. The frontend calls `/api/<path>`; the proxy is already set up in `vite.config.js`.

## Current API

| Method | Path | In | Out |
|---|---|---|---|
| GET | `/api/health` | – | `{status, transcription: "ok" \| "off", llm: "claude_code" \| "api" \| "off"}` |
| POST | `/api/auth/register` | `{name, email, password (8+), role: "patient" \| "pt"}` | 201 `{token, user}`; 409 if the email exists |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}`; 401 "Wrong email or password" |
| GET | `/api/auth/me` | header `Authorization: Bearer <token>` | `{id, name, email, role}`; 401 if not logged in |
| POST | `/api/auth/logout` | same header | 204 |
| POST | `/api/extract` | `{text, speaker?: "pt" \| "patient", context?, region?}` | instant, keywords: `{regions, path, follow_up, corrected_text, rating, movement, pain_type, source: "keywords"}` |
| POST | `/api/extract/smart` | same | ~3–4 s, Claude merged on top of keywords, `source: "llm"`; 503 when Claude isn't available (keep the instant answer) |
| POST | `/api/transcribe` | multipart `audio`, `speakers?` (1–6, 2 for a visit), `hints?` (JSON list) | `{model, language, duration_ms, processing_ms, diarize_ms, speakers, lines[{start_ms, end_ms, speaker, text}]}` |

- **PT vocabulary:** `app/data/pt_terms.csv` lists muscles, joints and movements, each with its region and common speech-to-text mishearings ("rotator cup" → "rotator cuff"). The keyword fallback corrects mishearings and maps terms to regions. `corrected_text` is the fixed sentence, or `null` when nothing changed. Show it alongside the original, never instead of it. The Claude prompt should include `vocabulary.terms()`. To add a word, add a CSV row (the region must be in `REGION_IDS`; mishearings must never be ordinary words), then run the tests.
- **Extract, two passes:** the frontend calls `/api/extract` first and lights the body from it (instant), then `/api/extract/smart` in the background and updates the line when it answers. Send `context` (the previous line) so "About a five." gets its rating, and `region` for voice intake (the tapped region). The smart pass adds movements, ratings in context, pain type and misheard-word fixes; keyword regions are kept and Claude's are added.
- **Which Claude:** `LLM_PROVIDER` in `backend/.env`: `claude_code` (default, runs `claude -p` with this machine's Claude Code login, no API key; tools, MCP, settings and CLAUDE.md are all switched off for that run), `api` (Anthropic SDK, needs `ANTHROPIC_API_KEY`), or `off`. Both use the same prompt and schema in `services/llm/prompt.py`, so switching changes nothing else. Change extraction behaviour in `prompt.py`. Tests never call a real Claude (`tests/conftest.py` sets `LLM_PROVIDER=off`; `tests/test_llm.py` uses a fake `claude` script).
- **Accounts:** demo-only login so the app knows who's the patient and who's the PT. To require a login on an endpoint, add a `user: CurrentUserDep` parameter. The extract and transcribe endpoints deliberately don't require one, so the demo never fails on auth. The frontend side is `src/auth/` (`useUser()` gives `{ user, logout }`).
- **Transcribe:** `"Speaker 1"` is whoever speaks first. The frontend maps speakers to doctor/patient. It returns 503 when the models aren't loaded.

## Commands (run in `backend/`)

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000 --no-access-log   # always --no-access-log
uv run pytest
uv run ruff check . && uv run ruff format .
```

Speech models (about 520 MB) go in `backend/models/`; the download commands are in `backend/README.md`. Without them, everything except `/api/transcribe` works. ffmpeg must be on the PATH.

Before finishing backend work, run `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest`, and make sure all three pass.

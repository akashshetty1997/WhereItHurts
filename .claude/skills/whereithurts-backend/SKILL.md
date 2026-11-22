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
  api/deps.py      SettingsDep, TranscriptionDep: how routes get settings and services
  api/routes/      health.py, extract.py, transcribe.py: thin HTTP handlers
  schemas/         Pydantic request/response models, one file per feature
  services/        the logic
    extraction.py  sentence -> regions/path/follow_up: LLM (stub) then keyword fallback
    keywords.py    keyword fallback
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
| GET | `/api/health` | – | `{status, transcription: "ok" \| "off"}` |
| POST | `/api/extract` | `{text, speaker?: "doctor" \| "patient"}` | `{regions, path, follow_up, source: "llm" \| "keywords"}` |
| POST | `/api/transcribe` | multipart `audio`, `speakers?` (1–6, 2 for a visit), `hints?` (JSON list) | `{model, language, duration_ms, processing_ms, diarize_ms, speakers, lines[{start_ms, end_ms, speaker, text}]}` |

- **Extract:** the Claude call is a TODO in `services/extraction.py::_extract_with_llm`. Return `None` there on any failure and the keyword fallback answers. Use `constants.LLM_MODEL`, `LLM_TIMEOUT_S` and `LLM_MAX_TOKENS`. Before writing it, load the `claude-api` skill.
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

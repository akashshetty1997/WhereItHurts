# WhereItHurts backend

FastAPI service for the two things the browser can't do on its own:

- `POST /api/extract`: one spoken sentence → body regions, pain path, rating, pain type and follow-up, instantly, from keywords and the PT vocabulary.
- `POST /api/extract/smart`: the same sentence read by Claude (~3–4 s): adds movements, ratings with context, and fixes misheard words. Uses your Claude Code login by default (`LLM_PROVIDER=claude_code`, no API key); set `LLM_PROVIDER=api` and `ANTHROPIC_API_KEY` in `.env` to use the API instead. 503 when Claude isn't available.
- `POST /api/transcribe`: a finished visit recording → transcript lines labelled "Speaker 1", "Speaker 2", with timestamps (speech-to-text plus speaker diarization, all on CPU, nothing leaves the machine).
- `GET /api/health`: `{status, transcription: ok|off}`.
- `/api/auth/register`, `/login`, `/me`, `/logout`: demo accounts (patient or PT). SQLite in `backend/data/users.db` (gitignored), passwords hashed with scrypt. Demo only: never enter real health information.

**PT vocabulary:** [app/data/pt_terms.csv](app/data/pt_terms.csv) lists about 70 muscles, joints and movements, each with its body region and common mishearings (like Amazon Transcribe Medical's custom vocabularies). Extraction fixes mishearings ("rotator cup" → "rotator cuff", returned as `corrected_text`) and lights the right region for PT words ("my trap is tight" → neck). To add a word, add a row.

Interactive API docs: http://127.0.0.1:8000/docs

## Run

Needs Python 3.12, [uv](https://docs.astral.sh/uv/) and ffmpeg (`brew install ffmpeg`).

```bash
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --reload-dir app --port 8000 --no-access-log
uv run pytest                     # tests (no models needed)
uv run ruff check . && uv run ruff format .
```

## Speech models (optional, about 520 MB)

Without them the server still runs, and `/api/transcribe` answers 503.

```bash
mkdir -p models && cd models
curl -sSLO https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
tar xjf sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2 && rm sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
curl -sSLO https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx
curl -sSLO https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx
```

`TRANSCRIBE_ENGINE=whisper` uses faster-whisper instead (it downloads about 1.6 GB on first start).

### How diarization works

ffmpeg decodes the recording to 16 kHz mono in memory. Parakeet (or Whisper) transcribes it with a timestamp per word. The words are cut into sentences, each sentence gets a TitaNet voice embedding, and the sentences are grouped by voice; consecutive sentences by one voice become one line. "Speaker 1" is whoever speaks first. Splitting at sentences catches the instant answer after a question that pause-based models miss.

### Test it

```bash
scripts/make_sample.sh samples/neuro_visit.txt     # two macOS voices -> .wav/.m4a/.webm
curl -s -F audio=@samples/neuro_visit.webm -F speakers=2 127.0.0.1:8000/api/transcribe
```

## Privacy

Audio and transcript text are never logged (logs hold sizes, timings and counts) and are never written to disk, except an MP4 with its index at the end, which goes to a temp file that is deleted right after decoding. All audio in this project is role-played; no real patient data.

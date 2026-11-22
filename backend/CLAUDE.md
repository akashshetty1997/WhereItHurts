# CLAUDE.md: backend

FastAPI backend for WhereItHurts. Load the `whereithurts-backend` skill before changing anything here: it has the layout, the rules and how to add an endpoint.

The short version:
- Fixed values go in `app/constants.py`; env and secrets go in `app/config.py` and `.env.example`.
- Routes (`app/api/routes/`) stay thin. Logic goes in `app/services/`, shapes in `app/schemas/`.
- Never log, print or commit audio or transcript text, and never name a medical condition.
- Before finishing: `uv run ruff check . && uv run ruff format --check . && uv run pytest`.

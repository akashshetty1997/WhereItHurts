"""Extraction through Claude Code (`claude -p`), using this machine's Claude Code login.

Each call starts a short, locked-down Claude Code run: no tools, no MCP servers, no settings or
CLAUDE.md files, no saved session, structured JSON output. Takes ~2-4 s, so it's used for the
background "smart" pass, never to block the instant keyword answer.
"""

import asyncio
import json
import logging
import tempfile
from functools import lru_cache

from app.config import Settings
from app.constants import CLAUDE_CODE_MODEL, LLM_TIMEOUT_S
from app.schemas.extract import Extraction, ExtractRequest
from app.services.llm import prompt
from app.services.llm.errors import LlmUnavailableError

_logger = logging.getLogger("whereithurts.llm.claude_code")


@lru_cache
def _empty_dir() -> str:
    """Run outside the repo so Claude Code loads no CLAUDE.md or project settings."""
    return tempfile.mkdtemp(prefix="whereithurts-claude-")


def command(request: ExtractRequest, settings: Settings) -> list[str]:
    return [
        settings.claude_cli,
        "-p",
        "--model", CLAUDE_CODE_MODEL,
        "--output-format", "json",
        "--tools", "",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--no-session-persistence",
        "--system-prompt", prompt.system_prompt(),
        "--json-schema", json.dumps(prompt.json_schema()),
        prompt.user_message(request),
    ]  # fmt: skip


async def extract(request: ExtractRequest, settings: Settings) -> Extraction:
    try:
        proc = await asyncio.create_subprocess_exec(
            *command(request, settings),
            cwd=_empty_dir(),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        raise LlmUnavailableError("claude command could not start") from exc
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=LLM_TIMEOUT_S)
    except TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise LlmUnavailableError("claude timed out") from exc
    if proc.returncode != 0:
        raise LlmUnavailableError(f"claude exited with {proc.returncode}")
    try:
        result = json.loads(stdout)
        data = result.get("structured_output")
        if result.get("is_error") or not isinstance(data, dict):
            raise ValueError("no structured output")
        extraction = prompt.parse(data)
    except ValueError as exc:  # includes JSON and validation errors
        raise LlmUnavailableError("claude returned unusable output") from exc
    _logger.info("llm_extract provider=claude_code ms=%s", result.get("duration_ms"))
    return extraction

"""Claude for smart extraction, behind one function: `await run(request, settings)`.

Which Claude runs is settings.llm_provider:
- "claude_code": `claude -p` with the Claude Code login on this machine (no API key)
- "api":         the Anthropic SDK with ANTHROPIC_API_KEY
- "off":         no LLM; callers keep the keyword answer

Both providers share prompt.py (system prompt, user message, JSON schema), so switching is
one setting and nothing else changes.
"""

import shutil

from app.config import Settings
from app.constants import LLM_PROVIDER_API, LLM_PROVIDER_CLAUDE_CODE
from app.schemas.extract import Extraction, ExtractRequest
from app.services.llm.errors import LlmUnavailableError

__all__ = ["LlmUnavailableError", "available", "run"]


def available(settings: Settings) -> bool:
    if settings.llm_provider == LLM_PROVIDER_CLAUDE_CODE:
        return shutil.which(settings.claude_cli) is not None
    if settings.llm_provider == LLM_PROVIDER_API:
        return bool(settings.anthropic_api_key)
    return False


async def run(request: ExtractRequest, settings: Settings) -> Extraction:
    """Raises LlmUnavailableError when the provider is off, missing, slow or fails."""
    if not available(settings):
        raise LlmUnavailableError(f"llm provider {settings.llm_provider!r} not available")
    if settings.llm_provider == LLM_PROVIDER_CLAUDE_CODE:
        from app.services.llm import claude_code

        return await claude_code.extract(request, settings)
    from app.services.llm import anthropic_api

    return await anthropic_api.extract(request, settings)

"""Extraction through the Anthropic API (settings.llm_provider = "api", ANTHROPIC_API_KEY)."""

import json
import logging
from functools import lru_cache

import anthropic

from app.config import Settings
from app.constants import LLM_EFFORT, LLM_MAX_TOKENS, LLM_MODEL, LLM_TIMEOUT_S
from app.schemas.extract import Extraction, ExtractRequest
from app.services.llm import prompt
from app.services.llm.errors import LlmUnavailableError

_logger = logging.getLogger("whereithurts.llm.api")


@lru_cache
def _client(api_key: str) -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=LLM_TIMEOUT_S, max_retries=1)


async def extract(request: ExtractRequest, settings: Settings) -> Extraction:
    try:
        response = await _client(settings.anthropic_api_key).messages.create(
            model=LLM_MODEL,
            max_tokens=LLM_MAX_TOKENS,
            system=prompt.system_prompt(),
            messages=[{"role": "user", "content": prompt.user_message(request)}],
            output_config={
                "effort": LLM_EFFORT,
                "format": {"type": "json_schema", "schema": prompt.json_schema()},
            },
        )
    except anthropic.APIConnectionError as exc:  # includes timeouts
        raise LlmUnavailableError("anthropic api not reachable") from exc
    except anthropic.APIStatusError as exc:
        raise LlmUnavailableError(f"anthropic api error {exc.status_code}") from exc
    if response.stop_reason != "end_turn":  # refusal or max_tokens: no complete JSON
        raise LlmUnavailableError(f"anthropic api stopped: {response.stop_reason}")
    try:
        text = next(block.text for block in response.content if block.type == "text")
        extraction = prompt.parse(json.loads(text))
    except (StopIteration, ValueError) as exc:
        raise LlmUnavailableError("anthropic api returned unusable output") from exc
    _logger.info("llm_extract provider=api request_id=%s", response._request_id)
    return extraction

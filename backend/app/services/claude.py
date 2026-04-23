"""ClaudeEnrichmentClient — async wrapper around the Anthropic Messages API.

Per PDF section 5: malformed JSON triggers one retry with a reminder; second
failure raises EnrichmentError so the caller can mark the product as failed.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from anthropic import AsyncAnthropic, APIError

from app.core.config import get_settings


class EnrichmentError(Exception):
    pass


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_json(text: str) -> dict[str, Any]:
    """Best-effort JSON extraction. Tolerates code fences and leading prose."""
    candidates: list[str] = []
    for match in _JSON_FENCE_RE.findall(text):
        candidates.append(match)
    candidates.append(text.strip())
    # Last resort: find first { ... matching final } by brace depth.
    if "{" in text and "}" in text:
        start = text.find("{")
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start : i + 1])
                    break

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    raise EnrichmentError("Claude response is not valid JSON")


class ClaudeEnrichmentClient:
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        settings = get_settings()
        self._api_key = api_key or settings.ANTHROPIC_API_KEY
        if not self._api_key:
            raise EnrichmentError(
                "ANTHROPIC_API_KEY is not set; enrichment cannot run"
            )
        self._client = AsyncAnthropic(api_key=self._api_key)
        self._model = model or settings.CLAUDE_MODEL

    async def call_json(
        self,
        *,
        system: str,
        user: str,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Issue a Messages call and return the parsed JSON dict.

        Retries once with a JSON reminder if the first response fails to parse.
        """
        first_text = await self._raw_call(system=system, user=user, max_tokens=max_tokens)
        try:
            return _extract_json(first_text)
        except EnrichmentError:
            pass

        reminder = (
            user
            + "\n\nIMPORTANT: respond with valid JSON only. No prose, no code fences."
        )
        second_text = await self._raw_call(
            system=system, user=reminder, max_tokens=max_tokens
        )
        return _extract_json(second_text)

    async def _raw_call(self, *, system: str, user: str, max_tokens: int) -> str:
        try:
            resp = await self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except APIError as exc:
            raise EnrichmentError(f"Claude API error: {exc}") from exc

        chunks: list[str] = []
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                chunks.append(block.text)
        return "".join(chunks).strip()

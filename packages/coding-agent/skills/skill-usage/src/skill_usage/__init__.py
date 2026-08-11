"""Host-attributed scoped method activation and disposition."""

from __future__ import annotations

from typing import Any, Literal

from rlm import host_request

Disposition = Literal["applied", "not_applicable"]


def _bounded_text(value: object, field: str, *, maximum: int, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be str, got {type(value).__name__}")
    normalized = value.strip()
    if not allow_empty and not normalized:
        raise ValueError(f"{field} must not be empty")
    if len(normalized) > maximum:
        raise ValueError(f"{field} must be at most {maximum} characters")
    return normalized


async def activate(*, name: str, intent: str) -> dict[str, Any]:
    """Load one admitted immutable method and record its host activation."""
    return await host_request(
        "skill_usage.activate",
        {
            "name": _bounded_text(name, "name", maximum=160),
            "intent": _bounded_text(intent, "intent", maximum=2000),
        },
    )


async def disposition(
    *,
    name: str,
    status: Disposition,
    evidence: list[str] | tuple[str, ...] = (),
    summary: str,
) -> dict[str, Any]:
    """Record the final disposition for one previously activated method."""
    normalized_name = _bounded_text(name, "name", maximum=160)
    if status not in ("applied", "not_applicable"):
        raise ValueError('status must be "applied" or "not_applicable"')
    if not isinstance(evidence, (list, tuple)):
        raise TypeError("evidence must be a list or tuple of strings")
    normalized_evidence = [
        _bounded_text(item, f"evidence[{index}]", maximum=2000)
        for index, item in enumerate(evidence)
    ]
    if len(normalized_evidence) > 64:
        raise ValueError("evidence must contain at most 64 entries")
    normalized_summary = _bounded_text(summary, "summary", maximum=4000)
    return await host_request(
        "skill_usage.disposition",
        {
            "name": normalized_name,
            "status": status,
            "evidence": normalized_evidence,
            "summary": normalized_summary,
        },
    )


async def status() -> dict[str, Any]:
    """Return the compact host-derived enforcement status for this session."""
    return await host_request("skill_usage.status")

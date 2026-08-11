from __future__ import annotations

import asyncio
from typing import Any

import pytest

import skill_usage


def test_activate_and_status_forward_normalized_payloads(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, Any] | None]] = []

    async def fake_host_request(kind: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        calls.append((kind, payload))
        return {"ok": True}

    monkeypatch.setattr(skill_usage, "host_request", fake_host_request)
    assert asyncio.run(skill_usage.activate(name=" clean-code ", intent=" review names ")) == {"ok": True}
    assert asyncio.run(skill_usage.status()) == {"ok": True}
    assert calls == [
        ("skill_usage.activate", {"name": "clean-code", "intent": "review names"}),
        ("skill_usage.status", None),
    ]


def test_disposition_forwards_typed_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, Any] | None]] = []

    async def fake_host_request(kind: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        calls.append((kind, payload))
        return {"ok": True}

    monkeypatch.setattr(skill_usage, "host_request", fake_host_request)
    result = asyncio.run(
        skill_usage.disposition(
            name="clean-code",
            status="applied",
            evidence=[" test:unit "],
            summary=" applied checks ",
        )
    )
    assert result == {"ok": True}
    assert calls == [
        (
            "skill_usage.disposition",
            {
                "name": "clean-code",
                "status": "applied",
                "evidence": ["test:unit"],
                "summary": "applied checks",
            },
        )
    ]


@pytest.mark.parametrize("status", ["", "ignored", "APPLIED"])
def test_disposition_rejects_unknown_status(status: str) -> None:
    with pytest.raises(ValueError, match="status must be"):
        asyncio.run(
            skill_usage.disposition(
                name="clean-code",
                status=status,  # type: ignore[arg-type]
                summary="reason",
            )
        )


def test_applied_evidence_requirement_is_host_owned() -> None:
    """The client accepts an empty list so the authoritative host rejects it."""
    async def reject(_kind: str, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        raise RuntimeError("applied disposition requires evidence")

    original = skill_usage.host_request
    skill_usage.host_request = reject
    try:
        with pytest.raises(RuntimeError, match="requires evidence"):
            asyncio.run(
                skill_usage.disposition(
                    name="clean-code",
                    status="applied",
                    summary="reason",
                )
            )
    finally:
        skill_usage.host_request = original

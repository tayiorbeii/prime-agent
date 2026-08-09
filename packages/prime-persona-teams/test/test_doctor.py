from __future__ import annotations

import json
import shutil
from pathlib import Path

from persona_team import doctor


def test_doctor_reports_ready_package_without_side_effects(tmp_path: Path) -> None:
    before = set(tmp_path.rglob("*"))
    report = doctor(project_root=tmp_path)

    assert report["schema"] == "prime.persona-team-doctor/v1"
    assert report["ready"] is True
    assert [check["id"] for check in report["checks"]] == [
        "package-root",
        "organization-manifest",
        "control-skill",
        "hidden-source",
        "run-store",
        "agent-template-api",
        "scoped-resources-api",
        "corpus-inventory",
        "unsafe-foreign-workflows",
        "prompt-budget",
    ]
    assert report["counts"] == {"functions": 5, "roles": 10, "workflows": 1}
    assert set(tmp_path.rglob("*")) == before


def test_doctor_reports_invalid_manifest_without_raising(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    (package_root / "package.json").write_text(json.dumps({"pi": {"skills": []}}))
    (package_root / "organization").mkdir()
    (package_root / "organization" / "organization.json").write_text("{")

    report = doctor(package_root=package_root, project_root=tmp_path)

    assert report["ready"] is False
    failed = {check["id"]: check for check in report["checks"] if check["status"] == "fail"}
    assert "organization-manifest" in failed
    assert "control-skill" in failed


def test_doctor_output_is_deterministic(tmp_path: Path) -> None:
    first = doctor(project_root=tmp_path)
    second = doctor(project_root=tmp_path)
    assert first == second


def test_doctor_rejects_tampered_generated_corpus(tmp_path: Path) -> None:
    source_root = Path(__file__).resolve().parents[1]
    package_root = tmp_path / "package"
    shutil.copytree(source_root, package_root, ignore=shutil.ignore_patterns(".venv", "node_modules", "__pycache__"))
    method = next((package_root / "library" / "generated" / "methods").glob("*/SKILL.md"))
    method.write_text(method.read_text() + "\ntampered\n")

    report = doctor(package_root=package_root, project_root=tmp_path)

    assert report["ready"] is False
    check = next(item for item in report["checks"] if item["id"] == "corpus-inventory")
    assert check["status"] == "fail"
    assert "hash mismatch" in check["message"]


def test_doctor_rejects_tampered_persona_prompt(tmp_path: Path) -> None:
    source_root = Path(__file__).resolve().parents[1]
    package_root = tmp_path / "package"
    shutil.copytree(source_root, package_root, ignore=shutil.ignore_patterns(".venv", "node_modules", "__pycache__"))
    role = package_root / "organization" / "roles" / "security-officer.md"
    role.write_text(role.read_text() + "\ntampered persona\n")

    report = doctor(package_root=package_root, project_root=tmp_path)

    assert report["ready"] is False
    check = next(item for item in report["checks"] if item["id"] == "corpus-inventory")
    assert check["status"] == "fail"
    assert "persona hash mismatch" in check["message"]

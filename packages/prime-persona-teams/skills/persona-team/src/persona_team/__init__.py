"""Prime Persona Teams control and diagnostic surface."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Literal, TypedDict


class DoctorCheck(TypedDict):
    id: str
    status: Literal["pass", "warn", "fail", "skip"]
    message: str


class DoctorReport(TypedDict):
    schema: str
    ready: bool
    package_version: str
    package_root: str
    counts: dict[str, int]
    checks: list[DoctorCheck]


_CHECK_ORDER = (
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
)
_FOREIGN_EXECUTION_MARKERS = ("claude code", "paperclip", ".claude/", "gstack-")


def _default_package_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _check(check_id: str, status: Literal["pass", "warn", "fail", "skip"], message: str) -> DoctorCheck:
    return {"id": check_id, "status": status, "message": message}


def _load_json(path: Path) -> tuple[object | None, str | None]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except FileNotFoundError:
        return None, f"missing {path.name}"
    except json.JSONDecodeError as error:
        return None, f"invalid JSON at line {error.lineno}, column {error.colno}: {error.msg}"
    except OSError as error:
        return None, f"cannot read {path.name}: {error}"


def _description(skill_path: Path) -> str:
    try:
        text = skill_path.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = re.search(r"^description:\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _verify_corpus(root: Path) -> tuple[bool, str]:
    generated = root / "library" / "generated"
    manifest_data, manifest_error = _load_json(generated / "manifest.json")
    classification_data, classification_error = _load_json(generated / "classification.json")
    if not isinstance(manifest_data, dict) or not isinstance(classification_data, dict):
        return False, manifest_error or classification_error or "corpus manifests must be objects"
    if manifest_data.get("schema") != "prime.generated-corpus-manifest/v1":
        return False, "invalid corpus manifest schema"
    files = manifest_data.get("files")
    if not isinstance(files, dict) or not files:
        return False, "corpus manifest has no files"
    actual_files = {
        str(path.relative_to(generated))
        for path in generated.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    if actual_files != set(files):
        return False, "generated corpus file set does not match manifest"
    for relative, expected_hash in sorted(files.items()):
        if not isinstance(relative, str) or not isinstance(expected_hash, str):
            return False, "corpus manifest contains invalid hash entries"
        path = (generated / relative).resolve()
        if not path.is_relative_to(generated.resolve()) or not path.is_file() or _sha256(path) != expected_hash:
            return False, f"generated corpus hash mismatch: {relative}"
    generator = manifest_data.get("generator")
    generator_path = root / "scripts" / "generate_corpus.py"
    if (
        not isinstance(generator, dict)
        or generator.get("path") != "scripts/generate_corpus.py"
        or not generator_path.is_file()
        or generator.get("sha256") != _sha256(generator_path)
    ):
        return False, "corpus generator identity is stale or invalid"
    counts = classification_data.get("counts")
    records = classification_data.get("records")
    expected_counts = {
        "sourceSkills": 86,
        "activeMethods": 42,
        "quarantinedWorkflows": 44,
        "roles": 10,
        "classified": 96,
    }
    if counts != expected_counts or not isinstance(records, list) or len(records) != 96:
        return False, "corpus classification counts are invalid"
    ids = [record.get("id") for record in records if isinstance(record, dict)]
    if len(ids) != 96 or len(set(ids)) != 96:
        return False, "corpus classification IDs are incomplete or duplicated"
    source_root = root / "library" / "source" / "upstream"
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("source"), dict):
            return False, "corpus source provenance is malformed"
        source = record["source"]
        source_path = source.get("path")
        source_hash = source.get("sha256")
        if not isinstance(source_path, str) or not isinstance(source_hash, str):
            return False, "corpus source provenance is incomplete"
        generated_record = record.get("generated")
        if record.get("kind") == "persona":
            if not isinstance(generated_record, dict):
                return False, "persona generation provenance is missing"
            generated_path = generated_record.get("path")
            generated_hash = generated_record.get("sha256")
            if not isinstance(generated_path, str) or not isinstance(generated_hash, str):
                return False, "persona generation provenance is incomplete"
            resolved_generated = (root / generated_path).resolve()
            if (
                not resolved_generated.is_relative_to(root)
                or not resolved_generated.is_file()
                or _sha256(resolved_generated) != generated_hash
            ):
                return False, f"generated persona hash mismatch: {generated_path}"
        if source_path.startswith("agents/"):
            source_path = "roles/" + source_path.removeprefix("agents/")
        resolved_source = (source_root / source_path).resolve()
        if (
            not resolved_source.is_relative_to(source_root.resolve())
            or not resolved_source.is_file()
            or _sha256(resolved_source) != source_hash
        ):
            return False, f"source provenance hash mismatch: {source_path}"
    return True, "generated corpus, generator, provenance hashes, and complete classification are valid"


def doctor(
    *,
    package_root: str | Path | None = None,
    project_root: str | Path | None = None,
) -> DoctorReport:
    """Inspect package readiness without starting a run or mutating the project."""
    root = Path(package_root).resolve() if package_root is not None else _default_package_root()
    project = Path(project_root).resolve() if project_root is not None else Path.cwd().resolve()
    checks: dict[str, DoctorCheck] = {}

    package_data, package_error = _load_json(root / "package.json")
    if root.is_dir() and package_error is None:
        checks["package-root"] = _check("package-root", "pass", "package root and package.json are readable")
    else:
        checks["package-root"] = _check("package-root", "fail", package_error or "package root is missing")

    organization_data, organization_error = _load_json(root / "organization" / "organization.json")
    counts = {"functions": 0, "roles": 0, "workflows": 0}
    if isinstance(organization_data, dict):
        schema = organization_data.get("schema")
        valid_schema = schema == "prime.organization/v1"
        valid_id = isinstance(organization_data.get("id"), str) and bool(organization_data.get("id"))
        for key in counts:
            value = organization_data.get(key)
            counts[key] = len(value) if isinstance(value, list) else 0
        references_valid = True
        for key, directory, expected_schema in (
            ("functions", "functions", "prime.function/v1"),
            ("roles", "roles", "prime.role/v1"),
            ("workflows", "workflows", "prime.workflow/v1"),
        ):
            references = organization_data.get(key, [])
            if not isinstance(references, list):
                references_valid = False
                continue
            for reference in references:
                reference_path = root / "organization" / directory / f"{str(reference).rsplit('/', 1)[-1]}.json"
                reference_data, _ = _load_json(reference_path)
                if (
                    not isinstance(reference, str)
                    or not isinstance(reference_data, dict)
                    or reference_data.get("schema") != expected_schema
                    or reference_data.get("id") != reference
                ):
                    references_valid = False
                    continue
                if key == "roles":
                    persona_file = reference_data.get("personaFile")
                    methods = reference_data.get("defaultMethods")
                    if (
                        not isinstance(persona_file, str)
                        or not (root / "organization" / "roles" / persona_file).is_file()
                        or not isinstance(methods, list)
                        or not all(
                            isinstance(method, str)
                            and (root / "library" / "generated" / "methods" / method / "SKILL.md").is_file()
                            for method in methods
                        )
                    ):
                        references_valid = False
        if valid_schema and valid_id and all(counts.values()) and references_valid:
            checks["organization-manifest"] = _check(
                "organization-manifest", "pass", "organization schema and references are valid"
            )
        else:
            checks["organization-manifest"] = _check(
                "organization-manifest", "fail", "organization requires v1 schema, id, functions, roles, and workflows"
            )
    else:
        checks["organization-manifest"] = _check(
            "organization-manifest", "fail", organization_error or "organization manifest must be an object"
        )

    declared_skills: list[str] = []
    if isinstance(package_data, dict):
        pi = package_data.get("pi")
        if isinstance(pi, dict) and isinstance(pi.get("skills"), list):
            declared_skills = [entry for entry in pi["skills"] if isinstance(entry, str)]
    control_path = root / "skills" / "persona-team" / "SKILL.md"
    declared_skill_files: list[Path] = []
    for entry in declared_skills:
        candidate = (root / entry).resolve()
        if not candidate.is_relative_to(root):
            continue
        if candidate.name == "SKILL.md" and candidate.is_file():
            declared_skill_files.append(candidate)
        elif candidate.is_dir():
            direct = candidate / "SKILL.md"
            if direct.is_file():
                declared_skill_files.append(direct)
            else:
                declared_skill_files.extend(sorted(candidate.rglob("SKILL.md")))
    visible_skill_files = []
    for skill_file in declared_skill_files:
        text = skill_file.read_text(encoding="utf-8")
        if not re.search(r"^disable-model-invocation:\s*true\s*$", text, re.MULTILINE):
            visible_skill_files.append(skill_file)
    if visible_skill_files == [control_path]:
        checks["control-skill"] = _check("control-skill", "pass", "exactly one package skill is model-invocable")
    else:
        checks["control-skill"] = _check(
            "control-skill", "fail", f"expected only persona-team visible, found {len(visible_skill_files)} visible skills"
        )

    forbidden_declared = [entry for entry in declared_skills if "library/source" in entry or "quarantined" in entry]
    checks["hidden-source"] = _check(
        "hidden-source",
        "fail" if forbidden_declared else "pass",
        "source or quarantine content is registered" if forbidden_declared else "source and quarantine paths are not registered",
    )

    writable = project.is_dir() and os.access(project, os.W_OK)
    checks["run-store"] = _check(
        "run-store",
        "pass" if writable else "warn",
        "project root can host an opt-in run store" if writable else "project root is not writable",
    )

    extension_path = root / "extensions" / "persona-teams.ts"
    extension_text = extension_path.read_text(encoding="utf-8") if extension_path.is_file() else ""
    checks["agent-template-api"] = _check(
        "agent-template-api",
        "pass" if "registerAgentTemplate" in extension_text else "skip",
        "agent templates are registered" if "registerAgentTemplate" in extension_text else "template API not installed yet",
    )
    checks["scoped-resources-api"] = _check(
        "scoped-resources-api",
        "pass" if "skills:" in extension_text and "exposeSelected" in extension_text else "skip",
        "template skill scopes are configured" if "exposeSelected" in extension_text else "scoped resources not installed yet",
    )

    corpus_valid, corpus_message = _verify_corpus(root)
    checks["corpus-inventory"] = _check(
        "corpus-inventory",
        "pass" if corpus_valid else "fail",
        corpus_message,
    )

    active_text = "\n".join(path.read_text(encoding="utf-8").lower() for path in declared_skill_files)
    unsafe = [marker for marker in _FOREIGN_EXECUTION_MARKERS if marker in active_text]
    checks["unsafe-foreign-workflows"] = _check(
        "unsafe-foreign-workflows",
        "fail" if unsafe else "pass",
        f"visible skill contains foreign workflow markers: {', '.join(unsafe)}" if unsafe else "no executable foreign workflow markers are visible",
    )

    description_length = len(_description(control_path))
    checks["prompt-budget"] = _check(
        "prompt-budget",
        "pass" if 0 < description_length <= 1500 else "fail",
        f"control skill description is {description_length} characters",
    )

    ordered = [checks[check_id] for check_id in _CHECK_ORDER]
    version = package_data.get("version", "unknown") if isinstance(package_data, dict) else "unknown"
    return {
        "schema": "prime.persona-team-doctor/v1",
        "ready": not any(check["status"] == "fail" for check in ordered),
        "package_version": version if isinstance(version, str) else "unknown",
        "package_root": str(root),
        "counts": counts,
        "checks": ordered,
    }


__all__ = ["DoctorCheck", "DoctorReport", "doctor"]

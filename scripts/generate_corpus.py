#!/usr/bin/env python3
"""Deterministically generate neutral hidden method wrappers and provenance reports."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PACKAGE_ROOT / "library" / "source" / "upstream"
GENERATED_ROOT = PACKAGE_ROOT / "library" / "generated"
ROLE_ROOT = PACKAGE_ROOT / "organization" / "roles"
SCHEMA = "prime.method-corpus/v1"
FORBIDDEN_ACTIVE_MARKERS = ("paperclip", "gstack-", "claude code", ".claude/", "hermes")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError("unterminated YAML frontmatter")
    header = text[4:end]
    values: dict[str, str] = {}
    for key in ("name", "description", "license"):
        match = re.search(rf"^{key}:\s*(.+)$", header, re.MULTILINE)
        if match:
            raw = match.group(1).strip()
            if raw.startswith(('"', "'")):
                try:
                    raw = json.loads(raw)
                except json.JSONDecodeError:
                    raw = raw.strip("'\"")
            values[key] = raw
    return values, text[end + 5 :]


def remove_unavailable_reference_links(body: str) -> str:
    """Remove broken local links that are absent from the imported source corpus."""
    link_pattern = r"\[([^\]]+)\]\((?:\./)?references/[A-Za-z0-9_./-]+\.md(?:#[^)]+)?\)"
    rewritten = re.sub(
        link_pattern,
        lambda match: (
            "the corresponding guidance in this skill"
            if match.group(1).startswith(("references/", "./references/"))
            else match.group(1)
        ),
        body,
    )
    return re.sub(
        r"`?(?:\./)?references/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_-]+)?`?",
        "the corresponding guidance in this skill",
        rewritten,
    )


def rewrite_method_references(body: str, active_slugs: list[str]) -> str:
    rewritten = body
    for slug in sorted(active_slugs, key=len, reverse=True):
        rewritten = re.sub(rf"(?<![a-z0-9-]){re.escape(slug)}(?![a-z0-9-])", f"persona-team-{slug}", rewritten)
    return rewritten


def render_method(slug: str, description: str, license_name: str, source_hash: str, body: str, metadata: dict[str, object]) -> str:
    frontmatter = {
        "name": f"persona-team-{slug}",
        "description": description,
        "license": license_name,
    }
    lines = ["---"]
    lines.extend(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in frontmatter.items())
    lines.extend(
        [
            "disable-model-invocation: true",
            "metadata:",
            "  namespace: prime-persona-team",
            "  transformation: adapted-hidden-method",
            "  source-set: upstream-method-corpus",
            f"  source-commit: {json.dumps(metadata['commit'])}",
            f"  source-path: {json.dumps(f'skills/{slug}/SKILL.md')}",
            f"  source-sha256: {json.dumps(source_hash)}",
            "---",
            "",
        ]
    )
    return "\n".join(lines) + body.lstrip()


def render_card(slug: str, description: str, source_hash: str, metadata: dict[str, object]) -> str:
    return f"""---
id: persona-team-{slug}
source-set: upstream-method-corpus
source-commit: {metadata['commit']}
source-sha256: {source_hash}
---

# {slug.replace('-', ' ').title()} — Method Card

## Use when

{description}

## Do not use when

The selected child role does not explicitly include `persona-team-{slug}`, required evidence is unavailable, or the method would exceed the role's authority or workspace scope.

## Required output evidence

Cite the task-specific inputs used, decisions made, uncertainty retained, and the concrete artifact or verification produced.

## Source sections

Load `../methods/persona-team-{slug}/SKILL.md` only inside an explicitly scoped child.
"""


def generate(target: Path) -> None:
    metadata = json.loads((SOURCE_ROOT / "metadata.json").read_text())
    skill_dirs = sorted(path for path in (SOURCE_ROOT / "skills").iterdir() if (path / "SKILL.md").is_file())
    active_slugs = [path.name for path in skill_dirs if not path.name.startswith("gstack-")]
    records: list[dict[str, object]] = []
    method_root = target / "methods"
    card_root = target / "method-cards"
    method_root.mkdir(parents=True)
    card_root.mkdir(parents=True)

    for skill_dir in skill_dirs:
        source_path = skill_dir / "SKILL.md"
        source_bytes = source_path.read_bytes()
        source_hash = sha256(source_bytes)
        values, body = source_frontmatter(source_bytes.decode("utf-8"))
        slug = skill_dir.name
        if values.get("name") != slug:
            raise ValueError(f"source name mismatch for {slug}")
        license_name = values.get("license") or str(metadata.get("license", ""))
        active = not slug.startswith("gstack-") and license_name == "MIT"
        record: dict[str, object] = {
            "schema": "prime.method-classification/v1",
            "id": f"source/skill/{slug}",
            "kind": "method" if active else "workflow-source",
            "source": {
                "repo": metadata["repo"],
                "commit": metadata["commit"],
                "path": f"skills/{slug}/SKILL.md",
                "sha256": source_hash,
            },
            "license": license_name or "unknown",
            "compatibility": "adapted-standalone" if active else "workflow-rewrite",
            "disposition": "generated-hidden-method" if active else "quarantined-source-only",
            "reasonCodes": ["UNAVAILABLE_SOURCE_REFERENCES_REMOVED"] if active else ["FOREIGN_WORKFLOW_RUNTIME", "HOST_STATE_MUTATION"],
        }
        if active:
            description = rewrite_method_references(values.get("description", "").strip(), active_slugs)
            if not description or len(description) > 1024:
                raise ValueError(f"invalid description for {slug}")
            generated = render_method(
                slug,
                description,
                license_name,
                source_hash,
                remove_unavailable_reference_links(rewrite_method_references(body, active_slugs)),
                metadata,
            )
            lower_generated = generated.lower()
            markers = [marker for marker in FORBIDDEN_ACTIVE_MARKERS if marker in lower_generated]
            if markers:
                raise ValueError(f"active method persona-team-{slug} contains forbidden markers: {markers}")
            output_dir = method_root / f"persona-team-{slug}"
            output_dir.mkdir()
            output_path = output_dir / "SKILL.md"
            output_path.write_text(generated)
            card_path = card_root / f"persona-team-{slug}.md"
            card = render_card(slug, description, source_hash, metadata)
            if len(card) > 4000:
                raise ValueError(f"method card too large for {slug}")
            card_path.write_text(card)
            record["generated"] = {
                "wrapper": f"library/generated/methods/persona-team-{slug}/SKILL.md",
                "card": f"library/generated/method-cards/persona-team-{slug}.md",
                "sha256": sha256(generated.encode()),
            }
        records.append(record)

    for role_path in sorted(ROLE_ROOT.glob("*.md")):
        role_bytes = role_path.read_bytes()
        lower_role = role_bytes.decode("utf-8").lower()
        markers = [marker for marker in FORBIDDEN_ACTIVE_MARKERS if marker in lower_role]
        if markers:
            raise ValueError(f"active role {role_path.name} contains forbidden markers: {markers}")
        records.append(
            {
                "schema": "prime.method-classification/v1",
                "id": f"source/role/{role_path.stem}",
                "kind": "persona",
                "source": {
                    "repo": metadata["repo"],
                    "commit": metadata["commit"],
                    "path": f"agents/{role_path.stem}/AGENTS.md",
                    "sha256": sha256((SOURCE_ROOT / "roles" / role_path.stem / "AGENTS.md").read_bytes()),
                },
                "license": metadata["license"],
                "compatibility": "adapter-required",
                "disposition": "neutral-compact-role",
                "generated": {
                    "path": f"organization/roles/{role_path.name}",
                    "sha256": sha256(role_bytes),
                },
                "reasonCodes": ["FOREIGN_RUNTIME_SECTION_REMOVED", "AUTHORITY_NARROWED"],
            }
        )

    records.sort(key=lambda record: str(record["id"]))
    classification = {
        "schema": SCHEMA,
        "sourceSet": {key: metadata[key] for key in ("repo", "commit", "dirty", "license")},
        "counts": {
            "sourceSkills": len(skill_dirs),
            "activeMethods": len(active_slugs),
            "quarantinedWorkflows": len(skill_dirs) - len(active_slugs),
            "roles": len(list(ROLE_ROOT.glob("*.md"))),
            "classified": len(records),
        },
        "records": records,
    }
    (target / "classification.json").write_text(json.dumps(classification, indent=2, sort_keys=True) + "\n")
    (target / "quarantine-report.md").write_text(
        "# Quarantine Report\n\n"
        "Foreign multi-stage workflow sources are provenance-only and are never registered as skills.\n\n"
        + "\n".join(f"- `{record['id']}`: {', '.join(record['reasonCodes'])}" for record in records if record["disposition"] == "quarantined-source-only")
        + "\n"
    )
    (target / "license-report.md").write_text(
        "# License Report\n\n"
        f"All {len(records)} source records carry the vendored MIT license from `{metadata['repo']}` at `{metadata['commit']}`. "
        "The original license is preserved at `library/source/upstream/LICENSE`.\n"
    )
    manifest = {
        "schema": "prime.generated-corpus-manifest/v1",
        "generator": {
            "path": "scripts/generate_corpus.py",
            "sha256": sha256(Path(__file__).read_bytes()),
        },
        "files": {
            str(path.relative_to(target)): sha256(path.read_bytes())
            for path in sorted(target.rglob("*"))
            if path.is_file()
        },
    }
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def tree_digest(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): sha256(path.read_bytes())
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="prime-persona-corpus-") as temp:
        staged = Path(temp) / "generated"
        generate(staged)
        if args.verify:
            if not GENERATED_ROOT.is_dir() or tree_digest(staged) != tree_digest(GENERATED_ROOT):
                raise SystemExit("generated corpus is stale; run scripts/generate_corpus.py")
            return 0
        backup = GENERATED_ROOT.with_name("generated.backup")
        shutil.rmtree(backup, ignore_errors=True)
        if GENERATED_ROOT.exists():
            os.replace(GENERATED_ROOT, backup)
        try:
            GENERATED_ROOT.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(staged, GENERATED_ROOT)
        except BaseException:
            shutil.rmtree(GENERATED_ROOT, ignore_errors=True)
            if backup.exists():
                os.replace(backup, GENERATED_ROOT)
            raise
        shutil.rmtree(backup, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

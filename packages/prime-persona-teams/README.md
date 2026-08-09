# Prime Persona Teams

Prime Persona Teams is an optional Prime Agent package for composing isolated role personas with exact child-scoped method skills. It implements the skills/persona architecture described by the vertical-slice planning bundle without depending on, calling, or installing the Paperclip product.

## What it adds

- One root-visible Python control skill: `persona-team`.
- Ten compact child-only role templates registered by a trusted extension.
- Forty-two neutral `persona-team-*` methodology skills, hidden until an exact template selects them.
- A deterministic inventory of all 86 source skills: 42 active methods and 44 foreign workflow sources kept provenance-only.
- Five declarative function manifests and one declarative workflow contract. This package does not execute external lifecycle services.

## Install locally

```bash
prime-agent package install --local /absolute/path/to/packages/prime-persona-teams
```

Restart or reload Prime Agent, then diagnose from IPython:

```python
report = persona_team.doctor()
assert report["ready"], report
```

Removing or disabling this one package removes its extension and visible control skill. Generated source inventories and any user-created artifacts remain ordinary files; uninstall performs no data deletion.

## Child templates

Pass an exact ID to the native RLM callable:

```python
planner = await rlm(
    "Produce a bounded technical plan and write it to the requested artifact path.",
    name="engineering-planner",
    template="prime/persona-team/engineering-manager",
)
```

Available IDs:

- `prime/persona-team/founder-ceo`
- `prime/persona-team/product-designer`
- `prime/persona-team/devex-lead`
- `prime/persona-team/engineering-manager`
- `prime/persona-team/implementation-engineer`
- `prime/persona-team/staff-reviewer`
- `prime/persona-team/security-officer`
- `prime/persona-team/qa-lead`
- `prime/persona-team/release-engineer`
- `prime/persona-team/retro-ops-manager`

Template catalogs and persona text are not appended to the parent prompt. An unknown template, missing selected skill, wildcard skill name, or unavailable required tool fails before admission. A selected hidden method is cloned into an immutable child view; parent and sibling skill records do not change.

## Corpus generation

The provenance mirror under `library/source/upstream/` is outside every skill discovery path. Foreign multi-stage workflow sources remain source-only and are never executable methods.

Regenerate and verify checked-in outputs:

```bash
python3 scripts/generate_corpus.py
python3 scripts/generate_corpus.py --verify
```

Generation is deterministic and transactional. `library/generated/classification.json`, `manifest.json`, the license report, and quarantine report account for every imported persona or skill source. Active method wrappers contain neutral instructions and no foreign runtime markers.

The imported upstream checkout referenced supporting Markdown files that were not present in that checkout. The standalone adaptation removes those dangling links rather than fabricating or claiming to inline missing content. Classification records therefore mark active methods as `adapted-standalone` with `UNAVAILABLE_SOURCE_REFERENCES_REMOVED`; the unchanged source mirror remains available for provenance review.

## Authority boundaries

Role children produce candidate artifacts and their own narrowly scoped decisions. Host code or an operator must validate accepted artifacts and lifecycle transitions. Staff review, security, and QA are independent. Release execution requires explicit human approval. Retrospective memory and workflow changes remain proposals until separately applied.

## Rollback

```bash
prime-agent package remove --local /absolute/path/to/packages/prime-persona-teams
```

Core support is inert when `template` is omitted and when no extension registers templates. Existing ordinary RLM calls retain their previous behavior.

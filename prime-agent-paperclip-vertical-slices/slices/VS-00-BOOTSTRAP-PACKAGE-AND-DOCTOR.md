# VS-00 — Bootstrap the Optional Package and Prove a Non-Polluting `doctor()`

## Slice status

```text
Prerequisites: none
Core Prime changes: none expected
Package changes: yes
Default exposure: project-local and opt-in
Primary proof: the package can be installed, diagnosed, disabled, and removed without changing ordinary Prime behavior
```

## 1. Observable outcome

From a Prime Agent session started at the fork root, the user can run:

```python
report = await paperclip_factory.doctor()
print(report)
```

and receive a deterministic readiness report covering:

- package version;
- detected Prime version and source commit when available;
- package root;
- organization manifest validity;
- discovered function/role/workflow counts;
- source-mirror availability;
- run-store writability;
- experimental core feature availability;
- prompt-exposure audit;
- fatal errors versus optional warnings.

At the same time:

- the root system prompt contains exactly one new model-invocable skill, `paperclip-factory`;
- no role persona and no method description is visible;
- disabling or removing the package restores the baseline resource list;
- running `doctor()` does not create a factory run, mutate source files, or start a child agent.

This is a complete vertical slice because it crosses installation, Prime skill discovery, Python-kernel import, package data loading, validation, user-visible output, and disable/removal behavior.

## 2. User story

> As an operator experimenting with the Paperclip port, I can install one optional Prime package and inspect whether it is safe and ready before any factory behavior is enabled.

## 3. Why this slice comes first

The largest early risk is accidental prompt pollution. A package skeleton that already exposes dozens of skills would make every later result suspect. This slice establishes the packaging and visibility boundary before source import, personas, child templates, or workflow state exist.

It also creates a stable place for later slices:

```text
packages/paperclip-factory/
```

Prime's root workspace already includes `packages/*`, so no root workspace-list change should be needed. Confirm that against the current checkout rather than assuming it.

## 4. Scope

### 4.1 Create the package skeleton

Suggested structure:

```text
packages/paperclip-factory/
├── package.json
├── README.md
├── CHANGELOG.md
├── src/
│   ├── manifest/
│   │   ├── load-manifest.ts
│   │   ├── validate-manifest.ts
│   │   └── types.ts
│   └── extension.ts
├── organization/
│   └── organization.json
├── roles/
│   └── README.md
├── functions/
│   └── README.md
├── workflows/
│   └── README.md
├── library/
│   ├── source/
│   │   └── README.md
│   ├── generated/
│   │   └── README.md
│   └── quarantine/
│       └── README.md
├── skills/
│   └── paperclip-factory/
│       ├── SKILL.md
│       ├── pyproject.toml
│       └── src/
│           └── paperclip_factory/
│               ├── __init__.py
│               ├── doctor.py
│               └── types.py
└── test/
    ├── package-manifest.test.ts
    ├── package-visibility.test.ts
    └── fixtures/
```

The exact file split may adapt to current repository conventions. Preserve the boundary:

```text
skills/             only the visible control skill
roles/              not a skill-discovery directory
library/source/     raw source, never auto-discovered
library/generated/  future generated material, not automatically exposed
```

### 4.2 Package manifest

Add a normal Prime package manifest using the inherited `pi` resource key. Register only:

- the control Python-backed skill;
- the package extension, if an extension is needed for status/commands.

Do not register `roles/`, `functions/`, `workflows/`, or `library/` as Prime skills.

A representative package fragment:

```json
{
  "name": "prime-agent-paperclip-factory",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./dist/extension.js"],
    "skills": ["./skills/paperclip-factory"]
  }
}
```

Use the package's actual build conventions. Do not add a new runtime dependency merely to parse YAML. JSON is the preferred initial persisted representation; YAML examples in planning documents are semantic examples, not a requirement to add a parser.

### 4.3 Minimal organization manifest

Create an organization manifest with stable IDs but no executable functions:

```json
{
  "schema": "prime.organization/v1",
  "id": "paperclip-factory",
  "name": "Paperclip Factory",
  "version": "0.1.0",
  "functions": [],
  "workflows": [],
  "defaultWorkflow": null
}
```

The loader must:

- resolve paths relative to the installed package, not the current working directory;
- reject unknown schema major versions;
- report malformed JSON with path and parse position when available;
- never rewrite the manifest during `doctor()`.

### 4.4 Control skill

`SKILL.md` must be deliberately small. Its startup description should identify only factory-control intents:

```yaml
---
name: paperclip-factory
description: Inspect, start, resume, or audit an explicitly requested Paperclip Factory run. Use only when the user names Paperclip Factory or asks to run its staged planning/build/review workflow.
---
```

The body should explain:

- call `paperclip_factory.doctor()` before first use;
- no run starts implicitly;
- methods and personas are child-scoped;
- release operations require explicit approval;
- current slice supports diagnosis only.

Do not list every function, role, or method in the description.

### 4.5 Python API

Expose a typed, serializable result. Avoid returning an unbounded diagnostic object whose `repr` can flood the context.

Suggested public contract:

```python
@dataclass(frozen=True)
class DoctorCheck:
    id: str
    status: Literal["pass", "warn", "fail", "skip"]
    summary: str
    details: tuple[str, ...] = ()

@dataclass(frozen=True)
class DoctorReport:
    schema: str
    ready: bool
    package_version: str
    checks: tuple[DoctorCheck, ...]

    def __str__(self) -> str:
        ...
```

Public call:

```python
async def doctor(*, verbose: bool = False) -> DoctorReport:
    ...
```

`verbose=False` must keep rendered output bounded. `verbose=True` may include paths but must not include environment-variable values, credentials, transcripts, or arbitrary file contents.

### 4.6 Checks required in v1

| Check ID | Pass condition | Failure class |
|---|---|---|
| `package-root` | package data directory resolves and exists | fail |
| `organization-manifest` | JSON parses and schema/id are valid | fail |
| `control-skill` | exactly one package skill is model-invocable | fail |
| `hidden-source` | no `SKILL.md` under source/quarantine is registered | fail |
| `run-store` | project-local `.prime/paperclip-factory/runs` can be created or is writable | warn if read-only |
| `agent-template-api` | generic template API detected | skip until VS-04 |
| `scoped-resources-api` | scoped child-resource API detected | skip until VS-05 |
| `source-checkout` | configured local original or pinned mirror exists | warn until VS-01 |
| `unsafe-gstack` | no generated model-invocable skill contains forbidden markers | pass with empty corpus |
| `prompt-budget` | control-skill description and injected text remain within budget | fail |

The run-store check may create and remove one sentinel file. It must not leave the directory dirty when it did not exist before unless Prime conventions require the directory to persist.

## 5. Explicit non-goals

Do not:

- import the 86 method skills;
- create role prompts;
- add an Agent Template API;
- add `rlm.run(template=...)`;
- create a run ledger;
- register a workflow;
- spawn a child;
- add context-mode or jCodeMunch;
- add deployment behavior;
- add an “all skills” mode;
- alter built-in Prime resource behavior.

## 6. Data flow

```text
Prime package resolver
  → loads one extension and one Python-backed skill
  → kernel imports paperclip_factory
  → doctor() resolves package data
  → validates organization.json and package visibility
  → returns bounded DoctorReport
  → no state transition and no child creation
```

## 7. Test-first implementation

### 7.1 Red test A — package discovery

Create a focused package test that loads the package resources using the current package/resource loader and asserts:

```text
visible model-invocable skills added by package = ["paperclip-factory"]
```

Also assert:

- package role/library directories do not become skills;
- no skill description contains “Founder CEO,” “Security Officer,” or a known method description;
- the extension list contains at most the intended package extension.

Run the test and confirm it fails because the package does not exist.

### 7.2 Green A

Create the minimal package and control skill. Make the discovery test pass without adding role or method content.

### 7.3 Red test B — doctor report

Add a Python/API-focused test or a TypeScript subprocess test that calls `doctor()` against:

1. a valid fixture;
2. a missing manifest;
3. an invalid schema;
4. a package fixture with a second visible skill.

Expected behavior:

- valid fixture returns `ready=True`;
- missing/invalid manifest returns `ready=False` and a `fail` check;
- extra visible skill fails `control-skill`;
- no exception escapes for ordinary diagnostic failures.

Confirm the test fails for the expected missing implementation.

### 7.4 Green B

Implement the bounded report and checks.

### 7.5 Refactor

- centralize package-data path resolution;
- keep check IDs stable constants;
- remove duplicated validation logic;
- make report rendering deterministic;
- sort checks by a declared order, not filesystem order.

## 8. Focused test commands

Resolve exact paths from the implementation. Expected shape:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-manifest.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-visibility.test.ts
```

For Python, prefer a standard-library test invoked through the managed interpreter or a TypeScript test that starts the package module in an isolated temporary home. Do not introduce pytest solely for this slice unless the repository already standardizes it.

After code changes:

```bash
cd <prime-repo-root>
npm run check
```

Capture complete output.

## 9. Manual verification

Use an isolated Prime config and a disposable project:

```bash
export PRIME_AGENT_CODING_AGENT_DIR="$(mktemp -d)"
mkdir -p /tmp/pfk-prime-smoke
cd /tmp/pfk-prime-smoke
```

Install the local package project-locally using the actual Prime package command, then start Prime from the source checkout.

Verify:

1. startup lists only `paperclip-factory` from this package;
2. `await paperclip_factory.doctor()` returns a bounded report;
3. no `.prime/paperclip-factory/runs/<run-id>` exists;
4. disabling/removing the package removes the skill;
5. ordinary Prime IPython still works after removal.

Do not use live provider credentials for automated tests. A manual TUI smoke may use the operator's configured environment, but record no private transcript in the repository.

## 10. Acceptance criteria

- [ ] Package installs from a local path through Prime's package mechanism.
- [ ] Root model-visible skill delta is exactly one.
- [ ] Idle prompt delta attributable to the package is no more than 1,500 characters.
- [ ] `doctor()` returns a stable typed report.
- [ ] Invalid manifests are reported without crashing Prime.
- [ ] `doctor()` has no child-agent or workflow side effects.
- [ ] Package-disabled mode produces the same resource list as baseline.
- [ ] Package removal leaves no active extension handler.
- [ ] No role/persona text appears in parent system prompt.
- [ ] No source/quarantine content is auto-discovered.
- [ ] Focused tests pass.
- [ ] `npm run check` passes.
- [ ] `IMPLEMENTATION-STATUS.md` is updated with measured prompt delta.

## 11. Instrumentation

Record, but do not transmit:

```text
package version
Prime version
number of package-visible skills
number of hidden source entries
doctor duration
prompt delta characters
check outcomes
```

Do not add analytics events in this slice.

## 12. Rollback

Project-local rollback:

```bash
prime-agent package remove --local <local-package-identity>
```

Repository rollback:

- remove the package directory and any explicitly added package wiring;
- do not modify core Prime behavior;
- preserve only planning/status records if the user wants them.

A failed package must never prevent Prime from starting. If package loading throws, Prime should follow existing diagnostic behavior and remain usable.

## 13. Required completion evidence

Add to the standard completion report:

```text
baseline visible skill names
post-install visible skill names
post-disable visible skill names
measured system-prompt character deltas
doctor report from valid fixture
doctor report from malformed fixture
```

## 14. Copy-ready implementation prompt

Use [`../prompts/VS-00-PROMPT.md`](../prompts/VS-00-PROMPT.md).

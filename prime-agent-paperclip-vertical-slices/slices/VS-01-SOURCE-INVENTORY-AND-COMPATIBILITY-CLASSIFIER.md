# VS-01 — Build a Reproducible Source Inventory and Compatibility Classifier

## Slice status

```text
Prerequisites: VS-00 complete
Core Prime changes: none
Package changes: yes
Primary proof: every candidate Paperclip artifact receives a deterministic disposition before any bulk port
```

## 1. Observable outcome

The operator can run:

```python
report = await paperclip_factory.inventory(
    source="/absolute/path/to/paperclip-factory-kit",
)
print(report.summary())
```

or an equivalent package CLI and obtain checked-in, reproducible reports showing:

- all source role/persona files;
- all source skills;
- workflows/tasks and support files;
- source repository/commit/path/hash;
- frontmatter metadata and license;
- referenced files and missing references;
- harness-specific markers;
- compatibility classification;
- intended Prime function/role/phase mapping;
- generation disposition.

No classified source is made model-invocable by this slice.

The report must also work against the pinned Hermes mirror when the original local checkout is unavailable, while clearly labeling it as a mirror rather than the original source.

## 2. User story

> As the maintainer of the port, I can prove that every source artifact is accounted for and know which ones are portable, require adaptation, must be rewritten as workflows, or must remain quarantined.

## 3. Source precedence

Use the following order:

1. explicit `source=` argument;
2. package setting or environment path explicitly configured by the operator;
3. known sibling checkout only when configured—not guessed broadly across the filesystem;
4. vendored/pinned Hermes mirror snapshot;
5. fail with an actionable report when neither source exists.

Never silently merge two sources. A run has one `sourceSetId` derived from:

```text
repository identity + commit + inventory schema version
```

If a local checkout has uncommitted changes, record:

```text
commit
dirty=true
diff hash or changed-file list
```

Do not copy uncommitted content into generated artifacts unless the operator explicitly opts in.

## 4. Source layout

Keep source material outside Prime auto-discovery:

```text
packages/paperclip-factory/library/
├── source/
│   ├── README.md
│   └── <source-set-id>/
│       ├── metadata.json
│       └── mirror-or-reference-data
├── inventory/
│   ├── inventory.json
│   ├── inventory.md
│   ├── compatibility.json
│   ├── compatibility.md
│   └── license-report.md
└── quarantine/
    └── README.md
```

Prefer storing metadata and hashes over duplicating the full original repository. When mirroring is necessary, preserve exact bytes and license files.

## 5. Inventory record

Each source item must include at least:

```json
{
  "schema": "prime.paperclip-source-item/v1",
  "sourceSetId": "pfk-source-...",
  "id": "source-skill-gstack-autoplan",
  "kind": "method-skill",
  "slug": "gstack-autoplan",
  "repo": "tayiorbeii/paperclip-factory-kit-hermes",
  "commit": "28733e96246d325f3cb9a28225c167ce1c03bf75",
  "path": "skills/paperclip/gstack-autoplan/SKILL.md",
  "sha256": "...",
  "frontmatter": {
    "name": "gstack-autoplan",
    "license": "MIT"
  },
  "references": [],
  "markers": [
    "ask-user-question",
    "claude-home-path",
    "plan-mode",
    "gstack-state"
  ],
  "classification": "workflow-rewrite",
  "reasonCodes": [
    "HARNESS_CLAUDE_TOOL",
    "HARNESS_CLAUDE_PATH",
    "HOST_WORKFLOW_SEMANTICS"
  ],
  "target": {
    "functions": ["planning"],
    "roles": ["planning-synthesizer"],
    "phases": ["planning"]
  },
  "disposition": "quarantine"
}
```

Use enumerated reason codes. Human-readable prose may supplement them but must not be the only classifier output.

## 6. Compatibility classes

### `native`

Use when the source is methodology/reference guidance that:

- does not require another harness's tools;
- uses only relative references that exist;
- has clear redistribution/use metadata;
- does not mutate external agent configuration;
- can remain hidden and be selectively exposed.

Example seed: `clean-code`, subject to actual scan results.

### `adapter-required`

Use when the methodology is portable but names tools or commands that Prime can map safely.

Examples:

- generic `Read`/`Grep` references;
- a browser helper that can map to an installed Prime capability;
- output formatting that needs a Prime artifact wrapper.

### `workflow-rewrite`

Use when source instructions encode orchestration or lifecycle rather than a reusable method.

Markers include:

```text
AskUserQuestion
ExitPlanMode
~/.claude
~/.gstack
slash-command self-invocation
telemetry prompts
upgrade/install prompts
state mutation outside package/run directories
multiple approval stages
external-agent control loops
```

These must not be generated as executable skills unchanged.

### `reference-only`

Use when content may inform adaptation but should not be agent-executable, for example:

- source-specific installer documentation;
- obsolete lane configuration;
- a duplicate methodology already provided by a canonical Prime-native skill.

### `quarantined`

Use when:

- license is missing or conflicting;
- required references are absent;
- source bytes or hash cannot be established;
- instructions are dangerous or ambiguous;
- adaptation has not yet been reviewed.

Quarantine is the safe default for unknown cases.

## 7. Static marker scanner

At minimum detect case-insensitively and with path-aware matching:

| Marker | Reason code |
|---|---|
| `AskUserQuestion` | `HARNESS_CLAUDE_TOOL` |
| `ExitPlanMode` | `HARNESS_CLAUDE_PLAN_MODE` |
| `~/.claude`, `.claude/skills` | `HARNESS_CLAUDE_PATH` |
| `~/.gstack`, `gstack-config` | `GSTACK_STATE` |
| `mcp__*__AskUserQuestion` | `HOST_SPECIFIC_TOOL` |
| `kanban_*` Hermes calls | `HERMES_HOST_TOOL` |
| `hermes` profile/kanban commands | `HERMES_RUNTIME` |
| `codex exec`, `claude -p`, Pi RPC | `EXTERNAL_LANE` |
| absolute `/home/...` or `/Users/...` | `ABSOLUTE_LOCAL_PATH` |
| telemetry/onboarding/upgrade prompts | `SELF_CONFIGURATION` |
| direct deploy/release command | `IRREVERSIBLE_ACTION` |
| missing linked file | `MISSING_REFERENCE` |
| absent license field and unresolved source license | `LICENSE_UNKNOWN` |

The scanner supplies evidence; classification policy decides disposition. Do not classify solely by one regex when context changes the meaning.

## 8. Seed role and function mappings

Generate explicit mapping records for the ten roles:

```text
founder-ceo             → planning/framing
product-designer        → planning
devex-lead              → planning, conditional
engineering-manager     → planning, Plan→Build authority
implementation-engineer → delivery
staff-reviewer          → assurance/review
security-officer        → assurance/security
qa-lead                 → assurance/qa
release-engineer        → release-learning/release
retro-ops-manager       → release-learning/retro
```

Use the existing five-profile Hermes mapping only as a seed. Do not collapse the three assurance roles into one authority.

## 9. Scope

Implement:

- source locator;
- Git metadata reader;
- hash calculator;
- frontmatter parser using existing Prime utilities where safely reusable;
- reference extractor;
- static marker scanner;
- deterministic classifier;
- markdown/JSON report rendering;
- `doctor()` integration showing inventory freshness;
- package CLI or Python call.

## 10. Non-goals

Do not:

- generate executable method wrappers;
- create role templates;
- change Prime core;
- spawn agents;
- automatically repair source;
- execute source scripts;
- install source dependencies;
- claim semantic equivalence from static scanning;
- expose inventory entries as startup skills.

## 11. Test-first implementation

### 11.1 Red — portable fixture

Create a fixture containing a small portable method with valid frontmatter and one relative reference. Assert:

```text
classification=native
disposition=eligible
hash stable
reference resolved
```

### 11.2 Red — gstack fixture

Create a reduced fixture containing representative Claude/gstack markers. Assert:

```text
classification=workflow-rewrite
disposition=quarantine
all expected reason codes present
```

### 11.3 Red — license and reference failures

Assert:

- missing license becomes quarantined;
- broken relative link emits `MISSING_REFERENCE`;
- duplicate source IDs fail the inventory;
- invalid frontmatter is reported, not ignored;
- source bytes are never rewritten.

### 11.4 Red — determinism

Run inventory twice with:

- different filesystem enumeration order;
- different absolute checkout roots;
- same source bytes and commit.

Canonical JSON and content hashes must match except for explicitly non-canonical diagnostic fields. Absolute local source root must not enter canonical IDs.

### 11.5 Green

Implement the smallest scanner/classifier/report pipeline needed to pass each fixture.

### 11.6 Refactor

Separate:

```text
source discovery
source parsing
evidence extraction
classification policy
report rendering
```

Keep classification pure and independently testable.

## 12. Focused test commands

Expected package tests:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/inventory.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/classifier.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/inventory-determinism.test.ts
```

Then:

```bash
cd <prime-repo-root>
npm run check
```

## 13. Manual verification

Run inventory against the pinned Hermes port and, when available, the local original checkout.

Inspect:

```text
total source items
role count
skill count
workflow/task count
native count
adapter-required count
workflow-rewrite count
reference-only count
quarantined count
unknown-license count
broken-reference count
```

The known Hermes planning baseline describes ten roles and approximately 86 skills. Treat count drift as a source change to explain, not as an automatic failure if the selected source differs.

Verify no new root-visible skill appears.

## 14. Acceptance criteria

- [ ] Every discovered candidate has one canonical inventory record.
- [ ] Each record has repo/path/commit/hash or an explicit dirty-source declaration.
- [ ] Every record has a compatibility class and disposition.
- [ ] Unknown and license-ambiguous cases quarantine by default.
- [ ] Known Claude/gstack markers cannot classify as `native`.
- [ ] Reports are deterministic.
- [ ] Original source bytes remain unchanged.
- [ ] Inventory output is outside skill-discovery paths.
- [ ] `doctor()` reports stale or missing inventory.
- [ ] Root prompt/visible skill delta is unchanged from VS-00.
- [ ] Focused tests and `npm run check` pass.

## 15. Rollback

Delete generated inventory reports and disable the inventory command. The source reference/mirror remains untouched. VS-00 `doctor()` may report inventory unavailable but must remain functional.

## 16. Required completion evidence

Include:

```text
source identity and commit
dirty-source status
item counts by kind and class
all reason-code counts
canonical inventory hash
root skill list before/after
sample native record
sample workflow-rewrite record
sample quarantined record
```

## 17. Copy-ready implementation prompt

Use [`../prompts/VS-01-PROMPT.md`](../prompts/VS-01-PROMPT.md).

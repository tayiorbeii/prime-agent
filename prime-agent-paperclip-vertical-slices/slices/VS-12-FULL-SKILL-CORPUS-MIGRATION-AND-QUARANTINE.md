# VS-12 — Migrate the Full Skill and Persona Corpus with Deterministic Generation and Quarantine

## Slice status

```text
Prerequisites: VS-01 inventory/classifier stable; VS-05 scoped methods stable; role/function consumers proven
Core Prime changes: none
Paperclip package changes: yes
Primary proof: every source role, skill, workflow, and reference has one reproducible disposition, while only explicitly reviewed hidden methods and child templates become executable
```

## 1. Observable outcome

The maintainer can run:

```python
report = await paperclip_factory.sync_source_corpus(
    source="/absolute/path/to/paperclip-factory-kit",
    apply=False,
)
print(report)
```

to preview a deterministic generation diff, then explicitly apply it:

```python
report = await paperclip_factory.sync_source_corpus(
    source="/absolute/path/to/paperclip-factory-kit",
    apply=True,
    expected_source_set="pfk-source-...",
)
```

The package produces:

- all ten compact role definitions/templates;
- all eligible namespaced hidden method skills;
- all adapter-required method wrappers;
- Prime-native workflow definitions for approved rewritten workflows;
- reference-only copies/metadata;
- quarantined artifacts and reasons;
- complete provenance and license reports;
- a generated manifest linking every source item to exactly one output/disposition;
- prompt-budget and forbidden-marker verification.

The root remains exposed to one `paperclip-factory` control skill.

## 2. User story

> As the maintainer, I can update the complete Paperclip corpus from a pinned source and know that nothing was silently omitted, incompatibly copied, globally exposed, or made executable without a reviewed transformation.

## 3. Canonical pipeline

```text
locate one source set
  → inventory exact bytes
  → extract evidence/markers/licenses/references
  → apply deterministic classifier
  → apply checked-in human overrides
  → validate disposition
  → generate into temporary output
  → run compatibility and prompt audits
  → produce diff/report
  → explicit apply by atomic directory swap
```

Never generate directly over the live output tree before validation.

## 4. Source inputs

Supported:

```text
explicit clean local original checkout
explicit dirty local checkout with opt-in and dirty metadata
pinned Hermes mirror
future source archive with manifest/hash
```

A generation run records:

```text
source repository
commit
dirty status
changed paths/diff hash when dirty
inventory schema
generator version
override-set hash
timestamp (non-canonical metadata only)
```

Do not combine original and mirror records in one source set.

## 5. Classification override file

Static scanning is not sufficient for 86 complex skills.

Create:

```text
packages/paperclip-factory/library/classification-overrides.json
```

Each override:

```json
{
  "sourceId": "source-skill-gstack-autoplan",
  "classification": "workflow-rewrite",
  "disposition": "quarantined",
  "targetId": "paperclip/workflow/autoplan",
  "rationale": "Contains Claude plan-mode, AskUserQuestion, ~/.gstack state, onboarding, and self-update behavior.",
  "review": {
    "status": "approved",
    "reviewer": "maintainer",
    "reviewedSourceHash": "sha256:..."
  }
}
```

Rules:

- override source hash must match current source;
- stale override becomes unresolved and blocks executable generation;
- classifier can make output more restrictive without override;
- classifier cannot make a reviewed quarantine executable;
- executable/adapted status requires reviewed override or an explicit safe auto-policy for simple native methods;
- changes to override file receive focused review.

## 6. Output categories

### 6.1 Roles

Generate ten compact roles:

```text
founder-ceo
product-designer
devex-lead
engineering-manager
implementation-engineer
staff-reviewer
security-officer
qa-lead
release-engineer
retro-ops-manager
```

Output:

```text
roles/generated/<role>/role.md
roles/generated/<role>/role.json
```

Role generator strips/replaces host-specific operations and adds:

```text
inputs
outputs
authority
non-goals
workspace policy
uncertainty behavior
Prime child behavior
source provenance
```

Role text must not include methodology bodies that belong in methods.

### 6.2 Native methods

Output:

```text
skills/methods/pfk-<slug>/SKILL.md
skills/methods/pfk-<slug>/references/...
library/generated/method-cards/pfk-<slug>.md
```

Every generated method:

```yaml
disable-model-invocation: true
```

Frontmatter includes original slug/path/repo/commit/hash/license/classification/generator version.

Method card target:

```text
≤ 4,000 characters by default
purpose
when to use
key constraints
expected outputs
source/reference pointers
```

The full adapted skill may remain longer and loads progressively only in a selected child.

### 6.3 Adapter-required methods

Generate a wrapper that:

- maps supported tool names to Prime concepts;
- removes setup/onboarding unrelated to the method;
- keeps the portable methodology;
- explicitly lists adaptation changes;
- contains no unresolved foreign-host marker.

Preserve an adaptation diff/report.

### 6.4 Workflow rewrites

Do not generate source text as a normal model-invocable method.

Create:

```text
workflows/generated/<workflow-id>/workflow.json
workflows/generated/<workflow-id>/README.md
library/quarantine/<source-id>/source-metadata.json
```

Only implement a workflow when a prior vertical slice has a host/runtime contract for it. Otherwise disposition remains quarantined/reference-only.

For example, `gstack-autoplan` may inform the existing planning function but must not become `pfk-gstack-autoplan` executable unchanged.

### 6.5 Reference-only

Store metadata and, when licensing permits, exact reference files outside skill discovery. Reference-only content may be searchable by maintainer tools but not advertised to role agents.

### 6.6 Quarantine

Each quarantine entry includes:

```text
source metadata/hash
reason codes
forbidden markers
license state
missing references
suggested future adaptation
review status
```

No quarantined directory may be registered as a package skill/resource.

## 7. Names and collision policy

Generated method ID:

```text
pfk-<normalized-original-slug>
```

Role/template/function/workflow IDs use slash namespaces.

Handle collisions:

- same normalized slug from identical source: deduplicate with provenance list;
- same slug, different content: block and require explicit override ID;
- collision with user/package skill: Prime normal precedence still applies, but factory template resolution must verify expected source identity/hash, not accept a different `pfk-*` by name;
- never fall back to generic unprefixed original name.

## 8. Reference rewriting

For each Markdown link/image/reference:

- resolve against source skill directory;
- copy only allowed referenced files;
- preserve relative structure;
- rewrite links only when output structure changes;
- verify all generated links;
- reject path traversal;
- do not fetch remote links automatically;
- list remote references in provenance;
- enforce size/type limits for binary assets;
- never copy `.env`, credentials, transcripts, caches, or VCS internals.

## 9. Foreign-host marker policy

Generated executable role/method files must contain zero unresolved occurrences of markers such as:

```text
AskUserQuestion
ExitPlanMode
~/.claude
~/.gstack
kanban_show
kanban_complete
hermes profile
mcp__...AskUserQuestion
foreign install/update/telemetry prompts
```

Some words may appear in an adaptation explanation outside executable content. Scanner distinguishes:

```text
executable body
provenance/adaptation report
quarantine source metadata
```

Do not pass the test by deleting meaningful methodology indiscriminately. Adaptation report shows removed/rewritten sections.

## 10. License/provenance

For every generated or retained item, report:

```text
source license declared
repository license fallback
attribution
modification status
redistribution status
local-use status
unknown/conflict
```

Unknown/conflicting is quarantined.

Generate:

```text
library/generated/corpus-manifest.json
library/generated/corpus-manifest.md
library/generated/license-report.json
library/generated/license-report.md
library/generated/provenance.json
```

The package's outer license never overrides per-source terms.

## 11. Generation transaction

Apply process:

1. generate to `.tmp/corpus-<id>`;
2. validate schema and links;
3. scan executable outputs;
4. load generated skill metadata using Prime's real skill loader;
5. construct every role template with scoped methods in a test loader;
6. measure root/child prompt budgets;
7. compare manifest coverage to inventory;
8. write generation report;
9. require `expected_source_set`;
10. atomically replace generated output directory;
11. retain previous generated version under bounded backup or version control;
12. update package corpus pointer.

No partial live output.

## 12. Verification APIs

```python
await paperclip_factory.verify_corpus()
await paperclip_factory.list_methods(
    classification=None,
    function=None,
    role=None,
    limit=50,
)
await paperclip_factory.explain_method("pfk-system-design")
await paperclip_factory.list_quarantine(limit=50)
```

Default output bounded; no full source bodies.

`doctor()` includes:

```text
inventory hash
generated manifest hash
source-set match
coverage
stale overrides
root-visible pfk count
forbidden executable markers
license failures
broken references
prompt budgets
```

## 13. Corpus coverage invariant

Every inventory source item is in exactly one bucket:

```text
generated-role
generated-method
generated-workflow
reference-only
quarantined
excluded-non-agent-file with explicit reason
```

No unaccounted items.

Coverage report uses source item IDs, not only counts.

## 14. Non-goals

Do not:

- make all methods visible;
- install all methods into every role;
- execute quarantined workflows;
- use an LLM as the sole classifier;
- silently accept dirty source;
- fetch remote assets;
- auto-apply new source updates;
- rewrite active child snapshots;
- change Prime core;
- publish a package.

## 15. Test-first implementation

### 15.1 Red — complete fixture corpus

Fixture with:

```text
one role
one native method
one adapter-required method
one workflow rewrite
one reference-only file
one unknown-license item
one slug collision
one broken reference
```

Assert exact dispositions and generated outputs.

### 15.2 Red — override hash

Stale reviewed override blocks executable generation.

### 15.3 Red — loader compatibility

Load all generated skills with Prime's actual skill loader:

- names match directories;
- descriptions valid/bounded;
- hidden flag true;
- references resolve;
- no duplicate names.

### 15.4 Red — forbidden markers

Known gstack fixture cannot appear in executable output. Adaptation report/quarantine may contain markers and is not falsely treated as executable.

### 15.5 Red — root and child budgets

Load package with full corpus:

```text
root visible package skills = ["paperclip-factory"]
root added prompt ≤ 1,500 chars idle
each template sees only exact method allowlist
no child gets all methods
```

### 15.6 Red — determinism

Same source/overrides/generator produces byte-identical canonical generated output across temp roots and enumeration order.

### 15.7 Red — transactional apply

Inject validation failure. Live generated directory remains unchanged.

### 15.8 Red — source update

Change one source item:

- inventory/source-set changes;
- only related generated items and reports change;
- existing active template snapshot not silently updated;
- stale override reported.

## 16. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-generation.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-overrides.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-loader-compatibility.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-forbidden-markers.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-determinism.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-transaction.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/corpus-prompt-budget.test.ts
```

Run Prime resource/system-prompt focused tests if loaders are exercised through shared helpers. Then root `npm run check`.

## 17. Manual verification

Against the chosen real source:

1. preview sync;
2. inspect counts and classification changes;
3. inspect at least:
   - three native methods;
   - three adapter-required methods;
   - three workflow rewrites;
   - all ten roles;
   - all license failures;
4. apply exact source set;
5. run verify;
6. start Prime and inspect root skills;
7. spawn several roles and inspect exact methods;
8. attempt explicit `/skill:pfk-*` behavior according to chosen advanced escape-hatch policy;
9. change one source and preview diff;
10. verify active child version drift policy.

## 18. Acceptance criteria

- [ ] Inventory coverage is 100% by source item ID.
- [ ] Ten roles are generated and mapped.
- [ ] Every eligible method is namespaced and hidden.
- [ ] Every executable output has provenance/license.
- [ ] Unknown licenses quarantine.
- [ ] No unresolved foreign-host marker exists in executable output.
- [ ] Workflow rewrites are not exposed as normal methods.
- [ ] All generated links resolve.
- [ ] Generation is deterministic and transactional.
- [ ] Root-visible `pfk-*` count is zero.
- [ ] No template uses an all-method wildcard.
- [ ] Prompt budgets pass with full corpus.
- [ ] Focused tests and `npm run check` pass.

## 19. Rollback

Point the package corpus pointer back to the prior generated version or revert the generated directory commit. Do not delete source inventory or active-run snapshots. Disable any newly generated template/method whose provenance cannot be trusted.

## 20. Required completion evidence

Include:

```text
source-set identity
inventory and corpus manifest hashes
coverage table
classification/disposition counts
ten-role mapping
license report
forbidden-marker report
loader verification
root and representative child prompt measurements
transaction failure proof
source-update diff
```

## 21. Copy-ready implementation prompt

Use [`../prompts/VS-12-PROMPT.md`](../prompts/VS-12-PROMPT.md).

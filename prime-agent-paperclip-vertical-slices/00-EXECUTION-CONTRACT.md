# Execution Contract for Prime Agent Self-Augmentation

This document is normative. Every implementation slice inherits these rules.

## 1. Work-unit policy

Implement one vertical slice at a time.

A vertical slice must:

- expose one observable capability from package input through runtime behavior to persisted output;
- include focused automated tests;
- include a manual verification path;
- have a rollback mechanism;
- leave the repository usable when later slices are absent;
- avoid speculative abstractions not needed by the slice.

Do not perform layer-only batches such as “add every schema,” “port every skill,” or “build the entire registry” without a user-visible path proving the layer.

## 2. Repository rules

Before editing:

1. Read the root `AGENTS.md` in full.
2. Read `CONTEXT.md` and applicable ADRs if present.
3. Read each file in full before making broad changes to it.
4. Inspect external package types in `node_modules` rather than guessing.
5. Record the exact baseline commit and working-tree state.

Follow the repository’s current validation rules:

- Do not run `npm run dev`, `npm run build`, or the unbounded `npm test`.
- When a test file is created or changed, run that exact file and iterate until it passes.
- Run `npm run check` after code changes and capture the complete output.
- Use suite harnesses and faux providers; never use paid provider credentials in tests.
- Stage only files changed by the current slice.
- Never use destructive workspace commands such as `git reset --hard`, `git checkout .`, `git clean -fd`, or broad `git stash`.

## 3. TDD loop

Each behavioral change follows red → green → refactor:

### Red

- Add the smallest test demonstrating the user-visible behavior.
- Run only the focused test.
- Confirm failure for the intended reason.
- Record that failure in the slice notes.

### Green

- Implement only enough production code to pass.
- Preserve existing public behavior unless the slice explicitly changes it.
- Re-run the focused test until green.

### Refactor

- Remove duplication and sharpen types.
- Re-run the focused test.
- Run adjacent focused tests named by the slice.
- Run `npm run check`.

A test that passes before implementation is not a valid red step. Amend it before continuing.

## 4. Source preservation

Imported Paperclip material must remain auditable.

- Keep raw or mirrored sources outside Prime’s auto-discovered `skills/` paths.
- Never modify source mirrors in place.
- Generate Prime-compatible artifacts into a separate directory.
- Preserve original repository, path, commit, content hash, license, and transformation classification.
- A generated artifact must identify the generator version.
- Any source with ambiguous licensing is quarantined, not loaded.
- Any source with unsupported harness instructions is quarantined until explicitly adapted.

## 5. Non-confusion policy

The implementation must never make “install everything everywhere” the default.

Until role-scoped resource loading exists:

- only `paperclip-factory` may be visible to the root model;
- imported methods must use `disable-model-invocation: true` or remain outside loaded skill paths;
- persona text must be injected only into the selected child session;
- role prompts must not be appended to the parent system prompt;
- gstack workflows must not be model-invocable.

After role-scoped loading exists:

- selected methods may be made visible inside the selected child only;
- missing requested methods fail explicitly;
- parent and sibling resource views must remain unchanged;
- no child receives an `all` method set.

## 6. Authority policy

Models may propose state changes; host code validates them.

The following must be host- or schema-enforced:

- run identity;
- workflow state;
- required artifacts;
- role ownership;
- approval decisions;
- gate prerequisites;
- human approval requirements;
- workspace and branch metadata;
- acceptance evidence.

A phrase such as “approved,” “done,” or “ready to ship” in free text cannot transition a gate.

External coding agents and subagents produce candidate work only. Prime’s factory coordinator owns acceptance into the run ledger.

## 7. Safety and release policy

- Release/deployment actions require explicit human approval.
- Security rejection blocks release.
- QA failure blocks release.
- Review absence blocks release.
- A release function may prepare commands but not execute irreversible actions without approval.
- Memory promotion from a run to project/global scope requires an explicit apply step.
- Context helpers may fail open to bounded native inspection; governance gates fail closed.

## 8. Feature flags

Every core capability introduced for this port must either:

- be generic and inert until invoked, or
- be guarded by a setting/package presence check.

Suggested settings:

```jsonc
{
  "paperclipFactory": {
    "enabled": false,
    "experimentalAgentTemplates": false,
    "experimentalScopedChildResources": false
  }
}
```

The exact final settings may change, but the disable path must remain immediate and tested.

## 9. Status tracking

Create:

```text
docs/plans/paperclip-prime-port/IMPLEMENTATION-STATUS.md
```

Suggested content:

```markdown
# Implementation Status

Baseline Prime commit: <sha>
Paperclip source: <path or pinned commit>

| Slice | Status | Branch | Commit | Focused tests | Notes |
|---|---|---|---|---|---|
| VS-00 | not-started | | | | |
...
```

Allowed statuses:

```text
not-started
red
implementing
verifying
complete
blocked
rolled-back
```

Update the status file only after verifying the corresponding facts.

## 10. Required completion report

At the end of every slice, report:

```markdown
## Slice completion

- Slice:
- Branch:
- Commit:
- User-visible capability:
- Files created:
- Files modified:
- Tests added/changed:
- Focused test commands and results:
- `npm run check` result:
- Manual verification:
- Acceptance criteria:
- Deviations from plan:
- Known risks:
- Rollback command or setting:
- Next eligible slice:
```

Do not claim completion when an acceptance criterion or required command was not run. Mark the slice blocked or partial and state exactly why.

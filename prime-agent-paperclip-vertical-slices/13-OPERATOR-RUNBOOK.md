# Operator Runbook for Prime Agent Self-Augmentation

## 1. Purpose

This runbook describes how to hand the planning bundle to a Prime Agent fork and keep self-modification controlled, reviewable, and resumable.

The bundle is not one giant implementation prompt. It is a sequence of end-to-end capabilities. Each slice leaves a working system and creates evidence that the next slice is justified.

## 2. Copy the bundle into the fork

Recommended path:

```text
<prime-agent-repo>/
└── docs/
    └── plans/
        └── paperclip-prime-port/
            ├── README.md
            ├── IMPLEMENTATION-STATUS.md
            ├── slices/
            └── prompts/
```

Keep the planning bundle in source control so branch work can cite the exact version of the plan.

## 3. Establish the baseline

Before VS-00:

```bash
git status --short --branch
git rev-parse HEAD
node --version
npm --version
```

Record:

- current Prime commit;
- upstream/fork remotes;
- current working-tree changes;
- applicable `AGENTS.md`, `CONTEXT.md`, and ADRs;
- whether the Paperclip original checkout exists;
- whether the Hermes mirror is the selected source.

Update the Baseline section in `IMPLEMENTATION-STATUS.md` when it differs from the research baseline. Do not pretend stale line numbers remain accurate after upstream changes.

## 4. Start an implementation run

Preferred:

1. Start Prime Agent from the fork root.
2. Give it [`10-MASTER-IMPLEMENTATION-PROMPT.md`](10-MASTER-IMPLEMENTATION-PROMPT.md).
3. Require it to name the next eligible slice.
4. Require a dedicated branch.
5. Require the red test before production edits.
6. Let it finish exactly one slice.
7. Review its completion report and diff before accepting the status change.

For an explicitly selected slice, give it the matching file under `prompts/`.

## 5. One run, one slice

Do not ask one Prime session to implement VS-00 through VS-05 together.

Reasons:

- each slice changes the evidence available for later architecture decisions;
- compaction can erase important boundaries;
- core changes deserve isolated review;
- rollback remains clear;
- prompt/resource measurements can be attributed;
- failures do not contaminate a larger half-built framework.

A follow-up run may address defects in the same slice. It should not start the next slice until the current acceptance gate is complete.

## 6. Branch convention

Suggested:

```text
feat/pfk-vs-00-package-doctor
feat/pfk-vs-01-inventory
feat/pfk-vs-04-agent-templates
```

When several agents work in parallel, use separate worktrees and disjoint files. Never let two agents independently edit the same RLM/session/runtime seam.

## 7. Status discipline

Prime Agent should move a status through:

```text
not-started
  → red
  → implementing
  → verifying
  → complete
```

A status may become:

```text
blocked
rolled-back
```

`complete` requires:

- required focused tests;
- complete `npm run check`;
- manual verification specified by the slice;
- prompt/resource measurements;
- acceptance checklist;
- rollback path;
- exact files/commit.

Do not mark complete merely because code was written.

## 8. Review checkpoints

Mandatory human review before:

- first Prime core change in VS-04;
- resource-loader scoping in VS-05;
- child cwd/worktree changes in VS-07;
- any release executor in VS-09;
- any external lane using real credentials in VS-10;
- quarantine-to-executable corpus change in VS-12;
- real pilot/release in VS-13/VS-14.

## 9. Interruption and resume

If a Prime implementation session ends mid-slice:

1. leave status at its actual stage;
2. record branch, files, tests, and failure;
3. do not have a new agent infer completion from a dirty tree;
4. start the next session with:
   - execution contract;
   - selected slice;
   - status file;
   - `git status`;
   - previous test output;
5. require re-verification of the red/green state.

## 10. Upstream updates

Before a core slice:

```bash
git fetch <upstream-remote>
git log --oneline <recorded-baseline>..<upstream>/main -- <affected-paths>
```

Re-read changed files and tests in full. Update the plan only when current code invalidates an assumption. Preserve the architecture invariants even if file names move.

## 11. Defect handling

A defect found during a slice is:

- in scope when it prevents the slice's acceptance behavior;
- deferred when unrelated;
- recorded as a risk or follow-up;
- fixed test-first when in scope.

Do not opportunistically redesign unrelated Prime subsystems.

## 12. Final convergence

After VS-14, conduct a separate review rather than immediately enabling the package broadly.

Review:

```text
root prompt/resource budget
template and method isolation
source/provenance coverage
run recovery
worktree safety
gate authority
human release approval
memory proposal policy
external/provider optionality
installation and rollback
manual pilot evidence
```

The Paperclip package should remain opt-in until this review is accepted.

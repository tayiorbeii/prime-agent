# VS-07 — Implement a Bounded Delivery Function in an Isolated Worktree

## Slice status

```text
Prerequisites: VS-06 complete and Plan → Build gate advanced
Core Prime changes: limited generic child-working-directory support may be required
Paperclip package changes: yes
Primary proof: one approved build-queue item produces candidate code and verification evidence in a leased worktree without self-approving review
```

## 1. Observable outcome

For a run in `building` with an accepted build queue:

```python
assignment = await paperclip_factory.assign_build_task(
    run_id,
    task_id="build-001",
)
```

The package:

1. validates the task is approved and unassigned;
2. creates or leases an isolated git worktree and branch;
3. records baseline repository/worktree metadata;
4. spawns an Implementation Engineer child with the worktree as its effective cwd;
5. gives it only delivery methods and capabilities;
6. collects a candidate implementation report, diff metadata, and verification results;
7. marks the task `candidate-ready`;
8. leaves the run in `building`;
9. creates no review/security/QA approval.

The user can inspect the candidate before VS-08 assurance.

## 2. User story

> As the factory owner, I can assign one approved vertical-slice task to a bounded implementation child and receive inspectable candidate changes in an isolated worktree, without allowing the builder to mark the work reviewed or releasable.

## 3. Entry conditions

Fail closed unless:

- run state is `building`;
- Plan → Build transition event exists;
- accepted build queue contains the task;
- task dependencies are complete;
- task is not already actively leased;
- repository root and HEAD are known;
- worktree base ref is available;
- dirty-main-worktree policy is satisfied;
- allowed scope and validation commands are present.

A dirty primary worktree should not automatically block isolated worktree creation when the selected base commit is explicit, but the run records the dirty status and warns about uncommitted work that is not part of the build task.

## 4. Generic child cwd support

A correct child session should load context, settings, skills, and shell/Python behavior relative to its actual worktree. Prompting `os.chdir()` is insufficient because Prime's session services and context files remain bound to the original cwd.

Add a generic optional child working directory to the RLM/template launch contract only if current APIs cannot already create a child runtime for a target cwd.

Suggested option:

```ts
workspace?: {
  cwd: string;
}
```

or a resolved internal field:

```ts
childCwd?: string;
```

Requirements:

- not exposed as an arbitrary unsafe package string without validation;
- canonicalize and require existing directory;
- package supplies an exact worktree path;
- host creates cwd-bound services for the child;
- parent remains bound to original cwd;
- child session manager cwd matches worktree;
- inline and daemon paths agree;
- persisted child registry records canonical cwd;
- existing RLM behavior unchanged when omitted.

Do not implement worktree creation in Prime core. Core only supports a generic child cwd. The Paperclip package owns git policy.

## 5. Worktree lease

Package layout:

```text
.prime/paperclip-factory/
└── worktrees/
    └── leases/
        └── <lease-id>.json
```

Actual worktree should follow a configurable root outside the repository working tree when practical:

```text
<repo-parent>/.prime-worktrees/<repo-slug>/<run-id>/<task-id>
```

Lease record:

```json
{
  "schema": "paperclip.worktree-lease/v1",
  "leaseId": "lease-...",
  "runId": "...",
  "taskId": "build-001",
  "repositoryRoot": "...",
  "worktreePath": "...",
  "branch": "pfk/<run-id>/build-001",
  "baseCommit": "...",
  "ownerAssignmentId": "...",
  "status": "active",
  "createdAt": "...",
  "lastObservedAt": "..."
}
```

### 5.1 Safety rules

- use `git worktree` porcelain output to inspect existing worktrees;
- canonicalize path;
- refuse path collisions;
- refuse branch already checked out elsewhere;
- never delete a worktree with uncommitted changes automatically;
- never use `git clean`, `reset --hard`, or broad stash;
- cleanup is explicit and evidence-preserving;
- copy `.env` files is out of scope and unsafe by default;
- secrets never enter run artifacts.

## 6. Implementation Engineer template

Role responsibilities:

```text
implement exactly one approved task
stay within allowed scope
write/modify code and tests
run declared validation
report deviations and risks
produce candidate work only
```

Selected methods, initial vetted subset:

```text
pfk-clean-code
pfk-clean-architecture
pfk-refactoring-patterns
```

Do not select planning, release, review, QA, or gstack workflow skills.

Tools:

```text
ipython
```

Any direct edit/bash tools must remain under Prime's actual tool policy. The child can use IPython and `%%bash`; tool restriction is not an OS sandbox.

## 7. Task context

Child receives:

```text
run/assignment/task IDs
accepted product/engineering/handoff refs
exact task record
worktree path and branch
base commit
allowed path scopes
acceptance criteria
validation commands
prohibited actions
artifact directory outside or inside worktree as explicitly chosen
required final report
```

Do not inline every planning artifact. Use summaries and paths.

## 8. Scope enforcement

Implement two layers.

### 8.1 Declared scope

Task `scope` includes exact path prefixes or components. Normalize against worktree root. Reject `..`, absolute external paths, and symlink escapes in declared scope.

### 8.2 Observed changed files

At collection:

```bash
git status --porcelain=v2
git diff --name-status <baseCommit>...HEAD
git diff --name-status
```

Include committed and uncommitted candidate changes.

Reject candidate acceptance when changed files are outside declared scope, except explicitly allowed generated evidence paths. Preserve worktree and report the violation.

Do not ask the child to self-report changed files as the authority.

## 9. Verification evidence

Host/package executes or verifies declared commands after child completion, rather than trusting prose.

Record per command:

```json
{
  "command": "npm run test:unit -- foo",
  "cwd": "...",
  "startedAt": "...",
  "durationMs": 1234,
  "exitCode": 0,
  "stdoutArtifact": "...",
  "stderrArtifact": "...",
  "truncatedInlinePreview": "..."
}
```

Use Prime output materialization if already available; otherwise store full output in run evidence and return bounded previews.

Command policy:

- commands originate from accepted build queue, not arbitrary child result;
- allow an explicit safe adaptation when project commands changed, with recorded deviation;
- reject destructive git commands;
- time out;
- preserve output;
- no secrets in rendered summary.

## 10. Candidate implementation artifact

Required `implementation-report/v1`:

```text
task and assignment IDs
base and resulting commit/working state
changed files observed by host
implementation summary
acceptance criteria results
commands run by child
commands independently verified by host
test failures
known risks
deviations
artifact refs
review-required=true
```

The host fills authoritative git and verification fields. The child's report is input, not authority.

## 11. Run/task state

Add task statuses:

```text
queued
leased
running
candidate-ready
blocked
failed
cancelled
accepted-after-assurance
```

This slice ends at `candidate-ready`.

The run remains `building`. No transition to assurance until VS-08 explicitly creates assurance assignments for the candidate.

## 12. Failure behavior

| Failure | Behavior |
|---|---|
| worktree creation fails | assignment blocked, no child |
| child starts in wrong cwd | cancel/reject, preserve session |
| scope violation | candidate blocked, worktree retained |
| validation failure | candidate may be `candidate-ready` with failing evidence only if policy allows review of failures; default blocked |
| child commits unrelated files | reject scope |
| primary repo moves | worktree base remains recorded; mark drift |
| lease orphaned | doctor reports; explicit recovery |
| package disabled | no new assignments; worktree untouched |
| child says review passed | ignored |

## 13. Non-goals

Do not:

- merge candidate branch;
- push;
- create a PR;
- execute release;
- copy secrets/env files;
- run external Claude/Codex/Pi lanes;
- perform staff/security/QA;
- auto-clean worktrees;
- accept multiple tasks in one child;
- add broad shell allowlists.

## 14. Test-first implementation

### 14.1 Red — generic child cwd

In Prime focused tests:

- child cwd differs from parent;
- child context files/settings resolve from child cwd;
- parent cwd unchanged;
- invalid/missing path rejects before admission;
- inline/daemon parity;
- default child inheritance unchanged.

### 14.2 Red — worktree lease

Use temporary git repo:

- create branch/worktree;
- persist lease;
- duplicate lease/task rejects;
- path collision rejects;
- dirty worktree cleanup refuses;
- recovery discovers existing matching worktree.

### 14.3 Red — role/method scope

Builder sees only implementation role and delivery methods. Parent/planning/assurance methods absent.

### 14.4 Red — scope validation

Cases:

```text
all changes in scope → eligible
one file outside scope → blocked
symlink path escape → blocked
untracked out-of-scope file → blocked
artifact evidence path explicitly allowed → okay
```

### 14.5 Red — verification trust

Child report claims tests passed while host command fails. Authoritative result is failure and task does not become clean candidate-ready.

### 14.6 Red — restart/recovery

Restart after lease creation and after child admission. `advance()` or recovery APIs find the lease and avoid duplicate worktrees/children.

### 14.7 Green/refactor

Keep git command execution behind a typed adapter so tests do not shell-string concatenate user inputs.

## 15. Focused test commands

Prime if cwd support changes:

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-recursion.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-runtime.test.ts
```

Use current daemon child tests as applicable.

Package:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/worktree-lease.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/delivery-function.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/delivery-scope-policy.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/delivery-verification.test.ts
```

Then root `npm run check`.

## 16. Manual verification

Use a disposable git repository:

1. complete planning and enter building;
2. assign one task;
3. inspect worktree and child cwd;
4. let child make a small tested change;
5. collect candidate;
6. inspect host-observed diff and outputs;
7. attempt out-of-scope change and confirm block;
8. stop Prime after admission, restart, and recover;
9. request cleanup while worktree dirty and confirm refusal;
10. verify no merge/push/review event occurred.

## 17. Acceptance criteria

- [ ] Delivery requires an approved build task.
- [ ] Child effective cwd is the isolated worktree.
- [ ] Parent cwd/resources remain unchanged.
- [ ] Worktree lease is durable and collision-safe.
- [ ] Builder sees only delivery role/method scope.
- [ ] Host observes changed files independently.
- [ ] Out-of-scope changes block candidate acceptance.
- [ ] Host verification outranks child claims.
- [ ] Candidate remains unreviewed and unmerged.
- [ ] Restart does not duplicate lease/worktree/child.
- [ ] Cleanup never destroys dirty work.
- [ ] Focused tests and `npm run check` pass.

## 18. Rollback

Disable delivery assignment. Retain worktrees and leases for manual inspection. Generic child-cwd support remains inert for ordinary RLM calls; it can be disabled behind the experimental template/workspace capability if necessary.

## 19. Required completion evidence

Include:

```text
parent and child cwd proof
lease record
worktree list
host-observed diff
in-scope success
out-of-scope rejection
child-vs-host test disagreement
restart recovery
dirty cleanup refusal
absence of merge/review approvals
```

## 20. Copy-ready implementation prompt

Use [`../prompts/VS-07-PROMPT.md`](../prompts/VS-07-PROMPT.md).

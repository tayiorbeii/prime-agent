# VS-13 — Complete a Resumable Five-Function Greenfield/Brownfield Factory Workflow

## Slice status

```text
Prerequisites: VS-06–VS-12 complete
Core Prime changes: only fixes required for generic template/scoped-child/cwd parity
Paperclip package changes: yes
Primary proof: one explicit factory run can traverse framing, planning, delivery, assurance, release, and retrospective across restarts without prompt pollution or duplicate work
```

## 1. Observable outcome

The operator can start either:

```python
run = await paperclip_factory.start(
    objective="Create a small hosted code-question service",
    entry_mode="greenfield",
    planning_mode="rigorous",
)
```

or:

```python
recommendation = await paperclip_factory.recommend_entry(
    objective="Review and ship the existing staging changes",
    project="/repo",
)
run = await paperclip_factory.start(
    objective="Review and ship the existing staging changes",
    entry_mode="brownfield",
    entry_state=recommendation.state,
    accept_recommendation=True,
)
```

Then repeatedly and explicitly:

```python
await paperclip_factory.advance(run.run_id)
```

The run can move through:

```text
framing
planning
building
assurance
release-ready
release-executing
released
retrospective
completed
```

with `blocked` and `cancelled` paths.

Prime may stop/restart at any point. Reconciliation resumes from persisted state without duplicating accepted artifacts, active assignments, worktrees, external invocations, or release actions.

## 2. User story

> As the owner of a long-running project, I can run the complete Paperclip operating loop through Prime Agent, resume it safely after interruptions, and inspect exactly why each transition occurred.

## 3. Five functions

### Orchestration

Host-authoritative package runtime:

```text
entry recommendation
next-action planning
assignment admission
submission collection
gate evaluation
reconciliation
bounded active-run summary
operator commands
```

An optional Orchestrator child may advise, but cannot mutate state or override host action planning.

### Planning

Modes:

```text
compact
standard
rigorous
```

Suggested role topology:

| Mode | Roles |
|---|---|
| compact | Engineering Manager |
| standard | Product Designer → Engineering Manager → Synthesizer |
| rigorous | Founder/CEO + Product Designer (+ DevEx conditional) → Engineering Manager → Synthesizer |

Founder and Product may run in parallel when inputs are independent. Engineering waits for accepted upstream artifacts. DevEx is conditionally required when the run manifest says APIs, CLIs, SDKs, integrations, or developer-facing workflows are material.

### Delivery

Execute accepted build-queue tasks in dependency order, one assignment per task and one worktree lease per active task. Parallel delivery is allowed only for disjoint declared scopes and non-overlapping dependencies.

### Assurance

Independent Staff Reviewer, Security Officer, and QA Lead per candidate/release snapshot as defined in VS-08.

### Release-learning

Release Engineer, explicit human approval, verified release record, Retro/Ops Manager, follow-up and memory proposals.

## 4. Workflow manifest

Complete:

```text
workflows/factory-run/workflow.json
```

The manifest defines:

```text
states
transitions
required artifacts
required decisions
human approval
conditional roles
retry policy
reconciliation class
terminal states
```

Host code validates it. Do not encode the entire workflow only in prompts.

## 5. Greenfield path

```text
create run
  → Founder framing
  → Product planning
  → optional DevEx planning
  → Engineering planning/build queue
  → Planning synthesis
  → Plan→Build gate
  → delivery task DAG
  → integrated candidate snapshot
  → independent assurance
  → Review→Ship gate
  → release preparation
  → human approval
  → release verification
  → retrospective
  → completed
```

Required greenfield artifacts may include:

```text
company/founder brief
product spec
DevEx spec when conditional
engineering plan
build queue
planning handoff
implementation reports
integrated candidate snapshot
three assurance reports/decisions
release plan/record
retrospective
follow-up proposals
```

## 6. Brownfield entry recommendation

Implement the source decision table as deterministic recommendation, not silent authority:

| Observed state | Recommended entry |
|---|---|
| ambiguous brief/product hypothesis | framing |
| clear product intent, no approved technical plan | planning |
| approved task graph, no implementation | building |
| code exists, no formal review | assurance |
| reviewed code, missing QA/security evidence | assurance |
| release-ready evidence exists | release-ready |
| shipped, no retrospective | retrospective |

`recommend_entry()` returns:

```text
recommended state
evidence
uncertainties
missing artifacts
confidence category
```

Starting with the recommendation requires explicit operator acceptance or explicit `entry_state`.

Never classify based solely on model prose. Inspect repository/run artifacts and ask for explicit state where evidence is insufficient.

## 7. Multi-task delivery and integration snapshot

For build queue DAG:

- validate acyclic dependencies;
- admit only ready tasks;
- detect overlapping scopes before parallelism;
- merge/integrate candidate branches only through an explicit package integration operation;
- do not merge into primary branch;
- create one integrated candidate snapshot for assurance;
- record conflict resolution as candidate work requiring review;
- failed task blocks dependent tasks, not unrelated completed evidence.

Initial implementation may process sequentially by default. Parallel mode remains opt-in and requires disjoint-scope proof.

## 8. Assignment attempt model

Assignments are immutable attempts:

```text
assignment logical task
  ├── attempt 1 cancelled
  ├── attempt 2 invalid artifact
  └── attempt 3 accepted
```

Do not overwrite failed attempts.

Retry policy:

```text
automatic retries: none for model/agent semantic failure
bounded process retry: only for proven transient admission/infrastructure errors
operator retry: explicit
```

A new attempt pins current template/method/source hashes.

## 9. Reconciliation classes

On resume, classify active operations:

### Safe to reconstruct

```text
missing projection
completed child with artifact files
known failed child
stale worktree lease with inspectable path
```

### Safe to retry after explicit action

```text
child never admitted
provider unavailable before execution
validation command interrupted before side effects
```

### Manual reconciliation required

```text
external lane process status unknown
release action status unknown
partial merge/integration
worktree changed by unknown actor
candidate source commit drift
event chain corruption
```

Never automatically repeat an uncertain release or external implementation invocation.

## 10. Child registry reconciliation

Use Prime's parent-scoped RLM registry plus package assignment records:

- match by persisted RLM child ID/session ID/name;
- record active/completed/error;
- accept artifacts only after package validation;
- missing child with no artifacts becomes retryable/blocked;
- completed child with valid artifacts may be collected after restart;
- do not infer completion solely from child registry status;
- deletion/tombstone remains historical.

## 11. Active-run root summary

The root gets a compact supplemental block only when:

- the package is installed;
- an active run is selected for the current session/project;
- the feature is enabled.

Maximum 3,000 characters.

Include:

```text
run ID/objective
current state
next eligible action
blocked gates/reasons
running assignments
pending human approval
exact control API examples
```

Exclude:

```text
full personas
full method descriptions
full artifacts
all timeline events
all findings
all memory
```

Prompt injection must be stable for cache friendliness and avoid changing every turn for inconsequential timestamps.

## 12. Operator interfaces

Python:

```python
paperclip_factory.start(...)
paperclip_factory.recommend_entry(...)
paperclip_factory.status(run_id)
paperclip_factory.advance(run_id)
paperclip_factory.pending(run_id)
paperclip_factory.timeline(run_id, limit=...)
paperclip_factory.reconcile(run_id)
paperclip_factory.retry_assignment(...)
paperclip_factory.cancel(run_id, reason=...)
paperclip_factory.select_active_run(run_id)
```

Optional slash commands:

```text
/factory status
/factory advance
/factory pending
/factory reconcile
```

Commands call the same package APIs. No duplicate state logic in UI handlers.

## 13. Concurrency and locks

- one run-local mutation lock;
- one lease per logical task/workspace;
- deterministic assignment IDs or idempotency keys;
- explicit expected sequence for mutations;
- parallel children can submit files independently;
- host serializes acceptance events;
- no two advances admit the same logical stage;
- cross-run operations remain isolated.

## 14. Cancellation

Cancellation:

- appends event;
- stops admitting new work;
- requests cancellation of active children/processes where safe;
- does not delete worktrees/artifacts/logs;
- does not revoke historical approvals;
- marks uncertain operations for reconciliation;
- is idempotent.

## 15. Prompt and context budgets

Measure:

```text
idle root package prompt
active run root summary
each role base prompt
selected skill descriptions
context packet
artifact summaries
```

Define per-role budgets in package verification. Reject a generated template whose prompt exceeds its budget without an explicit reviewed exception.

No role receives the whole corpus.

## 16. Non-goals

Do not:

- enable the package by default for every Prime user;
- add an autonomous infinite scheduler;
- run real deployments in automated tests;
- flatten the five functions into one giant persona;
- expose all methods to any root or child;
- auto-resolve uncertain external/release operations;
- permit security, QA, or review majority voting;
- auto-apply retrospective memory;
- delete worktrees or evidence during cancellation;
- introduce a second lifecycle database when the existing ledger is sufficient.

## 17. End-to-end test harness

Use Prime's faux provider and deterministic scripted children. No live provider.

Script role behaviors to:

- write valid artifacts;
- send parent messages;
- reject gates;
- mutate workspaces;
- stop mid-run;
- return malformed IDs;
- leave uncertain external/release state.

Use disposable git repositories and isolated Prime config directories.

## 18. Test-first implementation

### 17.1 Red — greenfield happy path

Run every stage to `completed`. Assert exact state/event/artifact/decision sequence and no duplicate assignments.

### 17.2 Red — brownfield entry paths

Fixture each decision-table row. Assert recommendation evidence and explicit acceptance requirement.

### 17.3 Red — gate blocks

At every gate remove one required artifact/decision/approval. Transition fails with exact missing reason.

### 17.4 Red — restart matrix

Restart after:

```text
run creation
child admission
artifact write before collection
artifact acceptance
worktree lease
candidate snapshot
assurance fan-out
gate ready
release approval
release execution start
release success
retro proposal
```

Assert safe resume or manual-reconciliation state as appropriate.

### 17.5 Red — concurrency

Two `advance()` calls and parallel submissions cannot duplicate assignment/transition. Two runs remain isolated.

### 17.6 Red — prompt isolation/budgets

Capture root and all roles across the full workflow. Verify exact persona/method/provider scopes and character budgets.

### 17.7 Red — cancellation

Cancel at planning, building, assurance, and release-executing. Verify idempotency and preservation.

### 17.8 Red — active child version pinning

Update corpus/templates mid-run. Existing assignments/children retain pinned identity; new attempts use new version only after explicit retry/update policy.

## 19. Focused test commands

Package:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-greenfield.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-brownfield.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-restart-matrix.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-concurrency.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-cancellation.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-prompt-budget.test.ts
```

Run affected Prime focused recursion/daemon/resource tests and root `npm run check`.

Do not run unbounded `npm test`.

## 20. Manual pilot

Choose one small, non-production brownfield task.

Requirements:

- project-local package install;
- isolated config/worktrees;
- no real deploy unless separately approved;
- record status after each turn;
- deliberately restart Prime at least twice;
- force one rejection/remediation loop;
- inspect all role contexts;
- complete retro with proposals;
- do not apply memory automatically.

Create a pilot report with usability, token/prompt, latency, failure, and operator-intervention observations.

## 21. Acceptance criteria

- [ ] All five functions participate in one complete run.
- [ ] Greenfield and brownfield entry work.
- [ ] Workflow/gates are manifest/host enforced.
- [ ] Every role receives exact persona/method/capability scope.
- [ ] Multi-task state is durable and idempotent.
- [ ] Restart matrix passes.
- [ ] Uncertain irreversible/external work requires reconciliation.
- [ ] Root active-run summary is bounded.
- [ ] No method/persona corpus leaks into root.
- [ ] Security/QA/review independence remains.
- [ ] Human release approval remains exact.
- [ ] Memory remains proposal-first.
- [ ] Cancellation preserves evidence.
- [ ] Faux-provider E2E tests and `npm run check` pass.
- [ ] One manual pilot is documented.

## 22. Rollback

Stop new runs and disable active-run prompt injection. Existing ledgers remain readable. Pin package/corpus/template version for active runs. Do not auto-rewind external code or releases. Use per-slice kill switches to disable delivery, assurance, or release while retaining inspection.

## 23. Required completion evidence

Include:

```text
greenfield event timeline
brownfield recommendation examples
artifact/decision/gate graph
restart matrix
concurrency/idempotency results
all role prompt/resource captures
active root prompt measurement
cancellation results
manual pilot report
```

## 24. Copy-ready implementation prompt

Use [`../prompts/VS-13-PROMPT.md`](../prompts/VS-13-PROMPT.md).
